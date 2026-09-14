import type { FailureMode } from '@/catalog/schema/types'
import { getResource } from '@/catalog/registry'
import type { ActiveIncident, SimGraph } from './types'

/** Small deterministic PRNG so a seeded scenario always plays out identically. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** How damaging each failure mode is. Unknown modes get a sensible middle. */
const SEVERITY: Record<string, { capacityLoss: number; latency: number; errorRate: number; ticks?: number }> = {
  'host-failure': { capacityLoss: 0.34, latency: 0, errorRate: 0, ticks: 45 },
  'cpu-credit': { capacityLoss: 0.6, latency: 120, errorRate: 0 },
  'disk-full': { capacityLoss: 0, latency: 40, errorRate: 0.5 },
  oom: { capacityLoss: 0.5, latency: 0, errorRate: 0.2 },
  oomkill: { capacityLoss: 0.5, latency: 0, errorRate: 0.25 },
  'image-pull': { capacityLoss: 1, latency: 0, errorRate: 0 },
  imagepull: { capacityLoss: 1, latency: 0, errorRate: 0 },
  crashloop: { capacityLoss: 0.7, latency: 0, errorRate: 0.4 },
  throttling: { capacityLoss: 0.35, latency: 180, errorRate: 0 },
  pending: { capacityLoss: 0.5, latency: 0, errorRate: 0 },
  'conn-exhaust': { capacityLoss: 0.75, latency: 60, errorRate: 0.3 },
  'conn-limit': { capacityLoss: 0.75, latency: 60, errorRate: 0.3 },
  failover: { capacityLoss: 1, latency: 0, errorRate: 1, ticks: 90 },
  'replica-lag': { capacityLoss: 0, latency: 25, errorRate: 0.02 },
  'storage-full': { capacityLoss: 0, latency: 0, errorRate: 0.9 },
  'long-lock': { capacityLoss: 0.5, latency: 900, errorRate: 0.1 },
  stampede: { capacityLoss: 0, latency: 200, errorRate: 0.15 },
  'cold-cache': { capacityLoss: 0, latency: 150, errorRate: 0.05, ticks: 60 },
  evictions: { capacityLoss: 0.2, latency: 60, errorRate: 0 },
  'hot-partition': { capacityLoss: 0.85, latency: 120, errorRate: 0.2 },
  'hot-shard': { capacityLoss: 0.7, latency: 80, errorRate: 0.15 },
  'hot-doc': { capacityLoss: 0.6, latency: 200, errorRate: 0.1 },
  'throttle-429': { capacityLoss: 0.6, latency: 90, errorRate: 0.2 },
  scan: { capacityLoss: 0.7, latency: 400, errorRate: 0.1 },
  'all-unhealthy': { capacityLoss: 1, latency: 0, errorRate: 1 },
  'backend-unhealthy': { capacityLoss: 1, latency: 0, errorRate: 1 },
  'no-endpoints': { capacityLoss: 1, latency: 0, errorRate: 1 },
  surge: { capacityLoss: 0.3, latency: 250, errorRate: 0.1 },
  expired: { capacityLoss: 1, latency: 0, errorRate: 1 },
  'cert-expiry': { capacityLoss: 1, latency: 0, errorRate: 1 },
  'cold-start': { capacityLoss: 0, latency: 400, errorRate: 0, ticks: 30 },
  throttle: { capacityLoss: 0.5, latency: 30, errorRate: 0.25 },
  'stale-ttl': { capacityLoss: 0, latency: 30, errorRate: 0.3 },
  'zone-outage': { capacityLoss: 0.5, latency: 0, errorRate: 0 },
  'disk-throttle': { capacityLoss: 0.4, latency: 220, errorRate: 0 },
  'spot-reclaim': { capacityLoss: 0.4, latency: 0, errorRate: 0, ticks: 40 },
  preempt: { capacityLoss: 0.4, latency: 0, errorRate: 0, ticks: 40 },
  'node-pressure': { capacityLoss: 0.4, latency: 50, errorRate: 0.1 },
  'iops-exhausted': { capacityLoss: 0.5, latency: 300, errorRate: 0 },
  'low-hit-rate': { capacityLoss: 0, latency: 60, errorRate: 0 },
  backlog: { capacityLoss: 0, latency: 500, errorRate: 0 },
  poison: { capacityLoss: 0.3, latency: 0, errorRate: 0.1 },
  etcd: { capacityLoss: 0, latency: 0, errorRate: 0 },
  'iterator-age': { capacityLoss: 0, latency: 400, errorRate: 0 },
  'dlq-fill': { capacityLoss: 0, latency: 0, errorRate: 0.05 },
  redelivery: { capacityLoss: 0.2, latency: 40, errorRate: 0.05 },
  'no-controller': { capacityLoss: 1, latency: 0, errorRate: 1 },
  'missing-index': { capacityLoss: 0.4, latency: 300, errorRate: 0.1 },
  'no-metrics': { capacityLoss: 0, latency: 0, errorRate: 0 },
  flapping: { capacityLoss: 0.2, latency: 60, errorRate: 0.05 },
  'scale-lag': { capacityLoss: 0.3, latency: 200, errorRate: 0, ticks: 40 },
  'request-cost': { capacityLoss: 0, latency: 0, errorRate: 0 },
  'public-leak': { capacityLoss: 0, latency: 0, errorRate: 0 },
  'az-bound': { capacityLoss: 1, latency: 0, errorRate: 1 },
  'version-skew': { capacityLoss: 0, latency: 0, errorRate: 0 },
  'concurrency-overload': { capacityLoss: 0, latency: 350, errorRate: 0.05 },
  'live-migrate': { capacityLoss: 0.1, latency: 40, errorRate: 0, ticks: 20 },
  'dtu-throttle': { capacityLoss: 0.6, latency: 200, errorRate: 0.15 },
  firewall: { capacityLoss: 1, latency: 0, errorRate: 1 },
  'wrong-region': { capacityLoss: 1, latency: 0, errorRate: 1 },
  stale: { capacityLoss: 0, latency: 0, errorRate: 0 },
  dangling: { capacityLoss: 0, latency: 0, errorRate: 0 },
  unhealthy: { capacityLoss: 1, latency: 0, errorRate: 1 },
  'integration-timeout': { capacityLoss: 0, latency: 600, errorRate: 0.2 },
  throttled: { capacityLoss: 0.5, latency: 20, errorRate: 0.3 },
  'pending-pods': { capacityLoss: 0.4, latency: 0, errorRate: 0 },
}

const DEFAULT_SEVERITY = { capacityLoss: 0.4, latency: 80, errorRate: 0.1 }

export function makeIncident(nodeId: string, mode: FailureMode, tick: number, idSuffix = ''): ActiveIncident {
  const sev = SEVERITY[mode.id] ?? DEFAULT_SEVERITY
  return {
    id: `inc:${nodeId}:${mode.id}${idSuffix}`,
    nodeId,
    modeId: mode.id,
    label: mode.label,
    symptom: mode.symptom,
    remedy: mode.remedy,
    capacityLoss: sev.capacityLoss,
    latencyPenaltyMs: sev.latency,
    errorRate: sev.errorRate,
    startedAtTick: tick,
    durationTicks: 'ticks' in sev ? sev.ticks : undefined,
  }
}

/** Every failure this graph could realistically experience right now. */
export function possibleIncidents(graph: SimGraph): { nodeId: string; mode: FailureMode }[] {
  const out: { nodeId: string; mode: FailureMode }[] = []
  for (const node of graph.nodes) {
    if (node.disabled) continue
    const def = getResource(node.defId)
    for (const mode of def?.sim?.failureModes ?? []) out.push({ nodeId: node.id, mode })
  }
  return out
}

/**
 * Chaos mode: occasionally injects a failure drawn from what the resources in
 * play can actually suffer from. Deterministic given the seed and tick.
 */
export function maybeInjectChaos(
  graph: SimGraph,
  tick: number,
  seed: number,
  active: ActiveIncident[],
  probabilityPerTick = 0.02,
): ActiveIncident | null {
  const rng = mulberry32(seed * 7919 + tick)
  if (rng() > probabilityPerTick) return null

  const candidates = possibleIncidents(graph).filter(
    (c) => !active.some((a) => a.nodeId === c.nodeId && a.modeId === c.mode.id),
  )
  if (candidates.length === 0) return null

  const pick = candidates[Math.floor(rng() * candidates.length)]
  return makeIncident(pick.nodeId, pick.mode, tick, `:${tick}`)
}

/** Drops incidents whose natural duration has elapsed. */
export function expireIncidents(active: ActiveIncident[], tick: number): ActiveIncident[] {
  return active.filter((i) => i.durationTicks === undefined || tick - i.startedAtTick < i.durationTicks)
}
