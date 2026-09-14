import type { PropBag } from '@/catalog/schema/types'
import { deriveProfile, latencyUnderLoad, type DerivedProfile } from './capacity'
import { buildTopology, fanout, PASS_THROUGH, type Topology } from './graph'
import { evaluateAttacks, type AttackResult } from './attacks'
import { nodeCostPerHour } from './cost'
import {
  DEFAULT_CONFIG, type ActiveIncident, type EdgeState, type NodeState,
  type SimConfig, type SimEvent, type SimGraph, type SimMetrics, type SimState,
} from './types'

/** How much an autoscaling group may grow in one tick. */
const RAMP_PER_TICK = 1.35

/** Traffic shape over time for a client node. */
function patternMultiplier(pattern: string, elapsed: number): number {
  switch (pattern) {
    case 'diurnal':
      return 0.55 + 0.45 * Math.sin((elapsed / 120) * Math.PI * 2)
    case 'spiky': {
      const phase = (elapsed % 90) / 90
      return phase > 0.72 && phase < 0.86 ? 6.5 : 0.85
    }
    case 'thundering': {
      const phase = (elapsed % 60) / 60
      return phase < 0.1 ? 9 : 0.5
    }
    default:
      return 1
  }
}

export interface TickInput {
  graph: SimGraph
  config?: Partial<SimConfig>
  incidents?: ActiveIncident[]
  /** Previous state, used for smoothing and event de-duplication. */
  previous?: SimState
}

/**
 * One simulation step. Pure: the same graph, config and incidents always
 * produce the same state, which is what makes scenarios reproducible and the
 * engine testable without a browser.
 */
export function tick(input: TickInput): SimState {
  const config: SimConfig = { ...DEFAULT_CONFIG, ...input.config }
  const prev = input.previous
  const tickNo = (prev?.tick ?? 0) + 1
  const elapsed = (prev?.elapsed ?? 0) + config.secondsPerTick

  const topo = buildTopology(input.graph)
  const nodeById = new Map(input.graph.nodes.map((n) => [n.id, n]))
  const incidentsByNode = groupIncidents(input.incidents ?? [])

  // 1 ── Derive each node's capabilities from its configuration.
  const profiles = new Map<string, DerivedProfile>()
  for (const [id, def] of topo.defs) {
    const props = (nodeById.get(id)?.props ?? {}) as PropBag
    profiles.set(id, deriveProfile(def, props))
  }

  // 2 ── Work out where hostile traffic reaches and what stops it.
  const attacks: AttackResult = config.attacksEnabled
    ? evaluateAttacks(input.graph, topo)
    : { attackDemand: new Map(), pressure: new Map(), edgeAttackShare: new Map(), breaches: [], mitigatedBy: [] }

  // 3 ── Forward pass: push demand from every source through the graph.
  const demand = new Map<string, number>()
  const legitDemand = new Map<string, number>()
  const served = new Map<string, number>()
  const edgeFlow = new Map<string, number>()

  for (const sourceId of topo.sources) {
    const props = nodeById.get(sourceId)?.props ?? {}
    const base = Number(props.rps ?? 0) * config.loadMultiplier
    const shaped = base * patternMultiplier(String(props.pattern ?? 'steady'), elapsed)
    legitDemand.set(sourceId, shaped)
    demand.set(sourceId, shaped)
  }

  for (const [nodeId, extra] of attacks.attackDemand) {
    demand.set(nodeId, (demand.get(nodeId) ?? 0) + extra)
  }

  const effectiveCapacity = new Map<string, number>()
  const injectedError = new Map<string, number>()
  const injectedLatency = new Map<string, number>()

  for (const [id, profile] of profiles) {
    let cap = profile.capacity
    let err = 0
    let lat = 0
    for (const inc of incidentsByNode.get(id) ?? []) {
      cap *= 1 - inc.capacityLoss
      err = 1 - (1 - err) * (1 - inc.errorRate)
      lat += inc.latencyPenaltyMs
    }
    effectiveCapacity.set(id, cap)
    injectedError.set(id, err)
    injectedLatency.set(id, lat)
  }

  const scaledReplicas = new Map<string, number>()

  const propagate = () => {
    edgeFlow.clear()
    for (const nodeId of topo.order) {
      const d = demand.get(nodeId) ?? 0
      const cap = effectiveCapacity.get(nodeId) ?? 0
      const s = Math.min(d, cap)
      served.set(nodeId, s)
      if (s <= 0) continue

      // Hostile requests consume capacity here but are not passed on as real
      // work: a flood the edge absorbed never becomes a database query.
      const hostile = attacks.attackDemand.get(nodeId) ?? 0
      const legitShare = d > 0 ? Math.max(0, d - hostile) / d : 1
      const forwardable = s * legitShare
      if (forwardable <= 0) continue

      const profile = profiles.get(nodeId)!
      const shares = fanout(nodeId, topo, profile.hitRatio)
      for (const edge of topo.out.get(nodeId) ?? []) {
        const share = shares.get(edge.id) ?? 0
        const flow = forwardable * share
        edgeFlow.set(edge.id, (edgeFlow.get(edge.id) ?? 0) + flow)
        demand.set(edge.target, (demand.get(edge.target) ?? 0) + flow)
      }
    }
  }

  propagate()

  // Autoscaling: work out how many instances the observed demand justifies,
  // then only move part of the way there this tick. Capacity therefore arrives
  // a minute or two after the traffic does, exactly as it does in production.
  let scaledAny = false
  for (const [id, profile] of profiles) {
    if (!profile.autoscales) {
      scaledReplicas.set(id, profile.replicas)
      continue
    }
    const d = demand.get(id) ?? 0
    const wanted = Math.ceil(d / Math.max(profile.unitCapacity * profile.targetLoad, 1e-6))
    const target = Math.min(profile.maxReplicas, Math.max(profile.replicas, wanted))
    const previousReplicas = prev?.nodes[id]?.replicasReady ?? profile.replicas
    const ramped = Math.min(target, Math.max(profile.replicas, Math.floor(previousReplicas * RAMP_PER_TICK) + 1))
    scaledReplicas.set(id, ramped)
    if (ramped !== profile.replicas) {
      const incidentLoss = (incidentsByNode.get(id) ?? []).reduce((acc, i) => acc * (1 - i.capacityLoss), 1)
      effectiveCapacity.set(id, profile.unitCapacity * ramped * incidentLoss)
      scaledAny = true
    }
  }

  if (scaledAny) {
    // Re-run with the new capacity: a tier that just scaled passes more through.
    for (const key of demand.keys()) {
      if (!topo.sources.includes(key) && !attacks.attackDemand.has(key)) demand.set(key, 0)
      else demand.set(key, (topo.sources.includes(key) ? legitDemand.get(key) ?? 0 : 0) + (attacks.attackDemand.get(key) ?? 0))
    }
    propagate()
  }

  // 4 ── Backward pass: latency and errors accumulate from the leaves upward.
  const latency = new Map<string, number>()
  const errorRate = new Map<string, number>()

  for (let i = topo.order.length - 1; i >= 0; i--) {
    const nodeId = topo.order[i]
    const profile = profiles.get(nodeId)!
    const d = demand.get(nodeId) ?? 0
    const cap = effectiveCapacity.get(nodeId) ?? 0
    const u = cap > 0 ? d / cap : d > 0 ? Infinity : 0

    const own = latencyUnderLoad(profile.baseLatencyMs, u) + (injectedLatency.get(nodeId) ?? 0)

    let downLatency = 0
    let downSurvival = 1
    const shares = fanout(nodeId, topo, profile.hitRatio)
    for (const edge of topo.out.get(nodeId) ?? []) {
      const share = shares.get(edge.id) ?? 0
      if (share <= 0) continue
      downLatency = Math.max(downLatency, latency.get(edge.target) ?? 0)
      const targetErr = errorRate.get(edge.target) ?? 0
      downSurvival *= 1 - Math.min(1, share * targetErr)
    }

    const shedErr = d > 0 && cap >= 0 ? Math.max(0, (d - Math.min(d, cap)) / d) : 0
    const injected = injectedError.get(nodeId) ?? 0
    const total = 1 - (1 - shedErr) * (1 - injected) * downSurvival

    latency.set(nodeId, own + downLatency)
    errorRate.set(nodeId, Math.min(1, total))
  }

  // Requests arriving straight from a client or the public internet are the
  // ones whose responses leave your network and are billed as egress.
  const externalRps = new Map<string, number>()
  for (const [id] of topo.defs) {
    let external = 0
    for (const edge of topo.in.get(id) ?? []) {
      const sourceArchetype = topo.defs.get(edge.source)?.archetype
      if (sourceArchetype === 'client' || sourceArchetype === 'internet') {
        external += edgeFlow.get(edge.id) ?? 0
      }
    }
    if (external > 0) externalRps.set(id, Math.min(external, served.get(id) ?? external))
  }

  // 5 ── Assemble state.
  const nodes: Record<string, NodeState> = {}
  const breachesByNode = new Map<string, typeof attacks.breaches>()
  for (const b of attacks.breaches) {
    const list = breachesByNode.get(b.nodeId) ?? []
    list.push(b)
    breachesByNode.set(b.nodeId, list)
  }

  let costPerHour = 0
  for (const [id, def] of topo.defs) {
    const props = (nodeById.get(id)?.props ?? {}) as PropBag
    const profile = profiles.get(id)!
    const d = demand.get(id) ?? 0
    const s = served.get(id) ?? 0
    const cap = effectiveCapacity.get(id) ?? 0
    const incidents = incidentsByNode.get(id) ?? []
    const breached = breachesByNode.get(id) ?? []
    const err = errorRate.get(id) ?? 0
    const u = cap > 0 && Number.isFinite(cap) ? d / cap : 0

    const cost = nodeCostPerHour(def, props, s, externalRps.get(id) ?? 0)
    costPerHour += cost

    const replicasDesired = scaledReplicas.get(id) ?? profile.replicas
    const lostFraction = incidents.reduce((acc, i) => Math.max(acc, i.capacityLoss), 0)
    const replicasReady = Math.max(0, Math.round(replicasDesired * (1 - lostFraction)))

    nodes[id] = {
      id,
      status: nodeStatus({ def: def.archetype, demand: d, cap, err, u, incidents, breached: breached.length > 0 }),
      demand: d,
      served: s,
      dropped: Math.max(0, d - s),
      capacity: cap,
      utilisation: u,
      latencyMs: latency.get(id) ?? 0,
      errorRate: err,
      replicasReady,
      replicasDesired,
      incidents: incidents.map((i) => i.id),
      attackPressure: attacks.pressure.get(id) ?? 0,
      breachedBy: breached.map((b) => b.vector),
      costPerHour: cost,
    }
  }

  const maxFlow = Math.max(1, ...edgeFlow.values())
  const edges: Record<string, EdgeState> = {}
  for (const edge of input.graph.edges) {
    const flow = edgeFlow.get(edge.id) ?? 0
    const attackShare = attacks.edgeAttackShare.get(edge.id) ?? 0
    edges[edge.id] = {
      id: edge.id,
      throughput: flow,
      intensity: Math.min(1, Math.sqrt(flow / maxFlow)),
      errorRate: errorRate.get(edge.target) ?? 0,
      attackShare,
      active: flow > 0.01 || attackShare > 0.05,
    }
  }

  const metrics = computeMetrics({ topo, nodes, profiles, legitDemand, latency, errorRate, costPerHour, attacks })
  const events = deriveEvents(tickNo, nodes, topo, prev)

  return { tick: tickNo, elapsed, nodes, edges, metrics, events }
}

function nodeStatus(a: {
  def: string
  demand: number
  cap: number
  err: number
  u: number
  incidents: ActiveIncident[]
  breached: boolean
}): NodeState['status'] {
  const fullyDown = a.incidents.some((i) => i.capacityLoss >= 0.99) || (a.cap <= 0 && a.demand > 0)
  if (fullyDown) return 'down'
  if (a.breached) return 'breached'
  if (a.err > 0.25) return 'degraded'
  if (a.u > 0.9) return 'saturated'
  if (a.incidents.length > 0) return 'degraded'
  if (a.demand > 0) return 'healthy'
  return 'idle'
}

function groupIncidents(list: ActiveIncident[]): Map<string, ActiveIncident[]> {
  const map = new Map<string, ActiveIncident[]>()
  for (const inc of list) {
    const existing = map.get(inc.nodeId) ?? []
    existing.push(inc)
    map.set(inc.nodeId, existing)
  }
  return map
}

function computeMetrics(a: {
  topo: Topology
  nodes: Record<string, NodeState>
  profiles: Map<string, DerivedProfile>
  legitDemand: Map<string, number>
  latency: Map<string, number>
  errorRate: Map<string, number>
  costPerHour: number
  attacks: AttackResult
}): SimMetrics {
  let totalDemand = 0
  let totalServed = 0
  let latencyWeighted = 0
  let worstUtil = 0
  let availability = 1

  for (const [sourceId, rps] of a.legitDemand) {
    totalDemand += rps
    const err = a.errorRate.get(sourceId) ?? 0
    totalServed += rps * (1 - err)
    latencyWeighted += (a.latency.get(sourceId) ?? 0) * rps
  }

  for (const state of Object.values(a.nodes)) {
    if (Number.isFinite(state.utilisation)) worstUtil = Math.max(worstUtil, state.utilisation)
  }

  // Availability of the critical path: every node carrying real traffic is a
  // dependency, and dependencies multiply.
  for (const [id, profile] of a.profiles) {
    const def = a.topo.defs.get(id)
    if (!def || PASS_THROUGH.has(def.archetype)) continue
    if (['client', 'attacker'].includes(def.archetype)) continue
    if ((a.nodes[id]?.demand ?? 0) <= 0) continue
    availability *= profile.availability
  }

  const p50 = totalDemand > 0 ? latencyWeighted / totalDemand : 0
  const tail = 1 + 2.2 * Math.min(worstUtil, 2) ** 2
  const compromise = a.attacks.breaches.length
    ? Math.min(1, a.attacks.breaches.reduce((m, b) => Math.max(m, b.pressure), 0))
    : 0

  return {
    totalDemand,
    totalServed,
    errorRate: totalDemand > 0 ? 1 - totalServed / totalDemand : 0,
    p50LatencyMs: p50,
    p95LatencyMs: p50 * tail,
    costPerHour: a.costPerHour,
    costPerMonth: a.costPerHour * 730,
    availability: a.legitDemand.size > 0 ? availability : 1,
    compromise,
  }
}

/** Log lines a human would actually see during an incident. */
function deriveEvents(
  tickNo: number,
  nodes: Record<string, NodeState>,
  topo: Topology,
  prev?: SimState,
): SimEvent[] {
  const events: SimEvent[] = []
  const push = (severity: SimEvent['severity'], nodeId: string, message: string) => {
    const def = topo.defs.get(nodeId)
    events.push({
      id: `${tickNo}:${nodeId}:${message.slice(0, 24)}`,
      tick: tickNo,
      severity,
      source: def ? def.short.toLowerCase().replace(/\s+/g, '-') : nodeId,
      message,
      nodeId,
    })
  }

  for (const [id, state] of Object.entries(nodes)) {
    const before = prev?.nodes[id]
    if (before?.status === state.status) continue
    const def = topo.defs.get(id)
    const name = def?.short ?? id

    switch (state.status) {
      case 'down':
        push('critical', id, `${name} is not responding — all requests failing`)
        break
      case 'breached':
        push('critical', id, `${name} compromised via ${state.breachedBy.join(', ')}`)
        break
      case 'degraded':
        push('error', id, `${name} degraded — ${(state.errorRate * 100).toFixed(1)}% of requests failing`)
        break
      case 'saturated':
        push('warn', id, `${name} at ${(state.utilisation * 100).toFixed(0)}% of capacity — latency climbing`)
        break
      case 'healthy':
        if (before && before.status !== 'idle') push('success', id, `${name} recovered`)
        break
      default:
        break
    }
  }

  return events
}

/** Runs a fixed number of ticks and returns the final state. Used by tests. */
export function run(graph: SimGraph, ticks = 1, config?: Partial<SimConfig>, incidents?: ActiveIncident[]): SimState {
  let state: SimState | undefined
  for (let i = 0; i < ticks; i++) {
    state = tick({ graph, config, incidents, previous: state })
  }
  return state!
}
