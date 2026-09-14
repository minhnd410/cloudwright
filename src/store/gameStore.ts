import { create } from 'zustand'
import {
  addEdge, applyEdgeChanges, applyNodeChanges,
  type Connection, type EdgeChange, type NodeChange,
} from '@xyflow/react'
import type { Flow, PropValue } from '@/catalog/schema/types'
import { canContain, validateConnection, type ConnectionVerdict } from '@/catalog/schema/rules'
import { defaultProps, getPort, getResource, requireResource } from '@/catalog/registry'
import { review, scoreFindings, type Finding } from '@/sim/advisor'
import { tick as simTick } from '@/sim/engine'
import { expireIncidents, makeIncident, maybeInjectChaos, possibleIncidents } from '@/sim/incidents'
import type { ActiveIncident, SimEvent, SimGraph, SimState } from '@/sim/types'
import type { CwEdge, CwEdgeData, CwNode, SavedDiagram } from './types'
import { serialize } from './serialize'

const STORAGE_KEY = 'cloudwright:diagram:v1'
const MAX_EVENTS = 220
const MAX_HISTORY = 180

export interface MetricHistory {
  demand: number[]
  served: number[]
  errorRate: number[]
  p95: number[]
  cost: number[]
}

export interface RejectedConnection {
  verdict: Extract<ConnectionVerdict, { ok: false }>
  sourceLabel: string
  targetLabel: string
  at: number
}

export type SimSpeed = 0 | 1 | 2 | 4

export interface GameState {
  // ── Diagram ──
  name: string
  nodes: CwNode[]
  edges: CwEdge[]
  selectedNodeId: string | null
  selectedEdgeId: string | null

  // ── Simulation ──
  speed: SimSpeed
  sim: SimState | null
  incidents: ActiveIncident[]
  events: SimEvent[]
  history: MetricHistory
  chaosMode: boolean
  attacksEnabled: boolean
  loadMultiplier: number

  // ── Review ──
  findings: Finding[]
  score: number

  // ── Transient UI ──
  rejected: RejectedConnection | null
  hoveredNodeId: string | null
  /** Bumped whenever a whole diagram is swapped in, so the canvas re-fits. */
  fitSignal: number

  // ── Actions ──
  addNode: (defId: string, position: { x: number; y: number }, parentId?: string) => string
  removeNodes: (ids: string[]) => void
  onNodesChange: (changes: NodeChange<CwNode>[]) => void
  onEdgesChange: (changes: EdgeChange<CwEdge>[]) => void
  connect: (connection: Connection) => void
  isValidConnection: (connection: Connection) => boolean
  explainConnection: (connection: Connection) => ConnectionVerdict | null
  dismissRejection: () => void

  select: (nodeId: string | null, edgeId?: string | null) => void
  setHovered: (nodeId: string | null) => void
  setProp: (nodeId: string, key: string, value: PropValue) => void
  renameNode: (nodeId: string, label: string) => void
  setName: (name: string) => void

  setSpeed: (speed: SimSpeed) => void
  step: () => void
  resetSim: () => void
  toggleChaos: () => void
  setAttacksEnabled: (on: boolean) => void
  setLoadMultiplier: (m: number) => void
  triggerIncident: (nodeId: string, modeId: string) => void
  clearIncident: (incidentId: string) => void
  clearAllIncidents: () => void
  randomIncident: () => void

  load: (diagram: SavedDiagram) => void
  clear: () => void
  save: () => void
  restore: () => boolean
  toSimGraph: () => SimGraph
  runReview: () => void
}

let nodeSeq = 1
const nextNodeId = () => `n${nodeSeq++}`

function emptyHistory(): MetricHistory {
  return { demand: [], served: [], errorRate: [], p95: [], cost: [] }
}

function pushHistory(history: MetricHistory, sim: SimState): MetricHistory {
  const push = (arr: number[], v: number) => {
    const next = [...arr, v]
    return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next
  }
  return {
    demand: push(history.demand, sim.metrics.totalDemand),
    served: push(history.served, sim.metrics.totalServed),
    errorRate: push(history.errorRate, sim.metrics.errorRate),
    p95: push(history.p95, sim.metrics.p95LatencyMs),
    cost: push(history.cost, sim.metrics.costPerHour),
  }
}

export const useGame = create<GameState>((set, get) => ({
  name: 'Untitled architecture',
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,

  speed: 0,
  sim: null,
  incidents: [],
  events: [],
  history: emptyHistory(),
  chaosMode: false,
  attacksEnabled: true,
  loadMultiplier: 1,

  findings: [],
  score: 100,

  rejected: null,
  hoveredNodeId: null,
  fitSignal: 0,

  // ── Diagram mutation ──────────────────────────────────────────────────────

  addNode: (defId, position, parentId) => {
    const def = requireResource(defId)
    const id = nextNodeId()
    const node: CwNode = {
      id,
      type: def.container ? 'container' : 'resource',
      position,
      data: { defId, label: def.short, props: defaultProps(def) },
      ...(def.container
        ? {
            style: { width: def.container.size?.width ?? 320, height: def.container.size?.height ?? 240 },
            zIndex: -1,
          }
        : {}),
      ...(parentId ? { parentId, extent: 'parent' as const } : {}),
    }
    set((s) => ({ nodes: [...s.nodes, node], selectedNodeId: id, selectedEdgeId: null }))
    get().runReview()
    return id
  },

  removeNodes: (ids) => {
    const set0 = new Set(ids)
    set((s) => ({
      nodes: s.nodes.filter((n) => !set0.has(n.id) && !(n.parentId && set0.has(n.parentId))),
      edges: s.edges.filter((e) => !set0.has(e.source) && !set0.has(e.target)),
      selectedNodeId: s.selectedNodeId && set0.has(s.selectedNodeId) ? null : s.selectedNodeId,
      incidents: s.incidents.filter((i) => !set0.has(i.nodeId)),
    }))
    get().runReview()
  },

  onNodesChange: (changes) => {
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) }))
    if (changes.some((c) => c.type === 'remove' || c.type === 'add')) get().runReview()
  },

  onEdgesChange: (changes) => {
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) }))
    if (changes.some((c) => c.type === 'remove')) get().runReview()
  },

  explainConnection: (connection) => {
    const { nodes, edges } = get()
    const source = nodes.find((n) => n.id === connection.source)
    const target = nodes.find((n) => n.id === connection.target)
    if (!source || !target) return null
    if (source.id === target.id) {
      return {
        ok: false,
        reason: 'A resource cannot depend on itself.',
        teach: 'Self-referencing dependencies are almost always a modelling mistake. If a service really does call itself, that call goes through a load balancer or a queue, which is what you should draw.',
      }
    }
    const sourceDef = getResource(source.data.defId)
    const targetDef = getResource(target.data.defId)
    if (!sourceDef || !targetDef) return null

    const sourcePort = getPort(sourceDef, connection.sourceHandle ?? '')
    const targetPort = getPort(targetDef, connection.targetHandle ?? '')
    if (!sourcePort || !targetPort) return null

    const duplicate = edges.some(
      (e) =>
        e.source === connection.source && e.target === connection.target &&
        e.sourceHandle === connection.sourceHandle && e.targetHandle === connection.targetHandle,
    )
    if (duplicate) {
      return {
        ok: false,
        reason: 'These are already connected this way.',
        teach: 'One dependency is enough. If you need a second path for redundancy, it should go to a different instance of the resource, not a duplicate line to the same one.',
      }
    }

    return validateConnection({
      source: sourceDef,
      sourcePort,
      target: targetDef,
      targetPort,
      sourcePortLoad: edges.filter((e) => e.source === connection.source && e.sourceHandle === connection.sourceHandle).length,
      targetPortLoad: edges.filter((e) => e.target === connection.target && e.targetHandle === connection.targetHandle).length,
    })
  },

  isValidConnection: (connection) => get().explainConnection(connection)?.ok === true,

  connect: (connection) => {
    const verdict = get().explainConnection(connection)
    if (!verdict) return
    if (!verdict.ok) {
      const { nodes } = get()
      set({
        rejected: {
          verdict,
          sourceLabel: nodes.find((n) => n.id === connection.source)?.data.label ?? 'source',
          targetLabel: nodes.find((n) => n.id === connection.target)?.data.label ?? 'target',
          at: Date.now(),
        },
      })
      return
    }

    const data: CwEdgeData = { flow: verdict.primary, flows: verdict.flows }
    set((s) => ({
      edges: addEdge({ ...connection, type: 'flow', data, animated: false }, s.edges) as CwEdge[],
      rejected: null,
    }))
    get().runReview()
  },

  dismissRejection: () => set({ rejected: null }),

  select: (nodeId, edgeId = null) => set({ selectedNodeId: nodeId, selectedEdgeId: edgeId }),
  setHovered: (nodeId) => set({ hoveredNodeId: nodeId }),

  setProp: (nodeId, key, value) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, props: { ...n.data.props, [key]: value } } } : n,
      ),
    }))
    get().runReview()
  },

  renameNode: (nodeId, label) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, label } } : n)),
    })),

  setName: (name) => set({ name }),

  // ── Simulation control ────────────────────────────────────────────────────

  setSpeed: (speed) => set({ speed }),

  step: () => {
    const state = get()
    const graph = state.toSimGraph()
    const nextTick = (state.sim?.tick ?? 0) + 1

    let incidents = expireIncidents(state.incidents, nextTick)
    if (state.chaosMode) {
      const injected = maybeInjectChaos(graph, nextTick, 20260915, incidents)
      if (injected) incidents = [...incidents, injected]
    }

    const sim = simTick({
      graph,
      previous: state.sim ?? undefined,
      incidents,
      config: {
        attacksEnabled: state.attacksEnabled,
        loadMultiplier: state.loadMultiplier,
      },
    })

    const events = [...state.events, ...sim.events].slice(-MAX_EVENTS)
    set({ sim, incidents, events, history: pushHistory(state.history, sim) })
  },

  resetSim: () =>
    set({ sim: null, incidents: [], events: [], history: emptyHistory(), speed: 0 }),

  toggleChaos: () => set((s) => ({ chaosMode: !s.chaosMode })),
  setAttacksEnabled: (on) => set({ attacksEnabled: on }),
  setLoadMultiplier: (m) => set({ loadMultiplier: m }),

  triggerIncident: (nodeId, modeId) => {
    const state = get()
    const node = state.nodes.find((n) => n.id === nodeId)
    if (!node) return
    const def = getResource(node.data.defId)
    const mode = def?.sim?.failureModes?.find((m) => m.id === modeId)
    if (!mode) return
    const tickNo = state.sim?.tick ?? 0
    const incident = makeIncident(nodeId, mode, tickNo)
    if (state.incidents.some((i) => i.id === incident.id)) return
    set({
      incidents: [...state.incidents, incident],
      events: [
        ...state.events,
        {
          id: `manual:${incident.id}:${tickNo}`,
          tick: tickNo,
          severity: 'error' as const,
          source: 'chaos',
          message: `Injected "${mode.label}" on ${node.data.label}`,
          nodeId,
        },
      ].slice(-MAX_EVENTS),
    })
    if (get().speed === 0) get().step()
  },

  clearIncident: (incidentId) => {
    set((s) => ({ incidents: s.incidents.filter((i) => i.id !== incidentId) }))
    get().step()
  },

  clearAllIncidents: () => {
    set({ incidents: [] })
    get().step()
  },

  randomIncident: () => {
    const state = get()
    const options = possibleIncidents(state.toSimGraph()).filter(
      (c) => !state.incidents.some((i) => i.nodeId === c.nodeId && i.modeId === c.mode.id),
    )
    if (options.length === 0) return
    const pick = options[Math.floor(Math.random() * options.length)]
    get().triggerIncident(pick.nodeId, pick.mode.id)
  },

  // ── Persistence ───────────────────────────────────────────────────────────

  toSimGraph: () => {
    const { nodes, edges } = get()
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        defId: n.data.defId,
        props: n.data.props,
        parentId: n.parentId,
      })),
      edges: edges
        .filter((e) => e.data)
        .map((e) => ({
          id: e.id,
          source: e.source,
          sourcePort: e.sourceHandle ?? '',
          target: e.target,
          targetPort: e.targetHandle ?? '',
          flow: e.data!.flow as Flow,
        })),
    }
  },

  runReview: () => {
    const findings = review(get().toSimGraph())
    set({ findings, score: scoreFindings(findings).score })
  },

  load: (diagram) => {
    const nodes: CwNode[] = diagram.nodes
      .filter((n) => getResource(n.defId))
      .map((n) => {
        const def = requireResource(n.defId)
        return {
          id: n.id,
          type: def.container ? 'container' : 'resource',
          position: { x: n.x, y: n.y },
          data: { defId: n.defId, label: n.label, props: { ...defaultProps(def), ...n.props } },
          ...(def.container
            ? { style: { width: n.w ?? def.container.size?.width ?? 320, height: n.h ?? def.container.size?.height ?? 240 }, zIndex: -1 }
            : {}),
          ...(n.parentId ? { parentId: n.parentId, extent: 'parent' as const } : {}),
        }
      })

    const ids = new Set(nodes.map((n) => n.id))
    const edges: CwEdge[] = diagram.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        type: 'flow',
        data: { flow: e.flow, flows: e.flows },
      }))

    nodeSeq = nodes.reduce((max, n) => Math.max(max, Number(n.id.replace(/\D/g, '')) || 0), 0) + 1

    set((s) => ({
      name: diagram.name,
      nodes, edges,
      selectedNodeId: null, selectedEdgeId: null,
      sim: null, incidents: [], events: [], history: emptyHistory(), speed: 0,
      fitSignal: s.fitSignal + 1,
    }))
    get().runReview()
  },

  clear: () => {
    set({
      name: 'Untitled architecture',
      nodes: [], edges: [],
      selectedNodeId: null, selectedEdgeId: null,
      sim: null, incidents: [], events: [], history: emptyHistory(), speed: 0,
      findings: [], score: 100,
    })
  },

  save: () => {
    const { name, nodes, edges } = get()
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize(name, nodes, edges)))
    } catch {
      /* storage unavailable — the app still works, it just will not persist */
    }
  },

  restore: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return false
      const parsed = JSON.parse(raw) as SavedDiagram
      if (parsed.version !== 1) return false
      get().load(parsed)
      return true
    } catch {
      return false
    }
  },
}))

/** Used by the canvas when dropping a node onto a container. */
export function canDropInto(parentDefId: string, childDefId: string): boolean {
  const parent = getResource(parentDefId)
  const child = getResource(childDefId)
  if (!parent || !child) return false
  return canContain(parent, child)
}
