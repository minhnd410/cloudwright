import type { AttackVector, Flow, PropBag } from '@/catalog/schema/types'

/** The graph, stripped of anything visual. This is all the simulator sees. */
export interface SimNode {
  id: string
  defId: string
  props: PropBag
  /** Containment parent (subnet, cluster, node pool…). */
  parentId?: string
  /** Player or scenario disabled this node. */
  disabled?: boolean
}

export interface SimEdge {
  id: string
  source: string
  sourcePort: string
  target: string
  targetPort: string
  flow: Flow
}

export interface SimGraph {
  nodes: SimNode[]
  edges: SimEdge[]
}

// ── Runtime state ───────────────────────────────────────────────────────────

export type NodeStatus = 'idle' | 'healthy' | 'saturated' | 'degraded' | 'down' | 'breached'

export interface NodeState {
  id: string
  status: NodeStatus
  /** Requests per second arriving. */
  demand: number
  /** Requests per second successfully handled. */
  served: number
  /** Requests per second shed because there was no capacity. */
  dropped: number
  /** Effective capacity in requests per second right now. */
  capacity: number
  /** demand / capacity, uncapped so you can see how far over you are. */
  utilisation: number
  /** End-to-end latency contributed at and below this node, in ms. */
  latencyMs: number
  /** 0..1 fraction of requests through this node that fail. */
  errorRate: number
  replicasReady: number
  replicasDesired: number
  /** Active incident ids affecting this node. */
  incidents: string[]
  /** 0..1 residual attack pressure that reached this node. */
  attackPressure: number
  /** Attack vectors that reached this node without being mitigated. */
  breachedBy: AttackVector[]
  /** USD per hour attributable to this node right now. */
  costPerHour: number
}

export interface EdgeState {
  id: string
  /** Requests per second flowing along this edge. */
  throughput: number
  /** 0..1 relative to the busiest edge; drives animation density. */
  intensity: number
  errorRate: number
  /** 0..1 share of this edge's traffic that is hostile. */
  attackShare: number
  /** True when the edge is carrying live traffic. */
  active: boolean
}

export interface SimMetrics {
  /** Requests per second entering the system. */
  totalDemand: number
  /** Requests per second answered successfully. */
  totalServed: number
  /** 0..1 */
  errorRate: number
  /** Median and tail latency across entry paths, in ms. */
  p50LatencyMs: number
  p95LatencyMs: number
  costPerHour: number
  costPerMonth: number
  /** 0..1 composite availability of the critical path. */
  availability: number
  /** 0..1 how much hostile traffic reached something it should not have. */
  compromise: number
}

export interface SimState {
  tick: number
  /** Seconds of simulated time elapsed. */
  elapsed: number
  nodes: Record<string, NodeState>
  edges: Record<string, EdgeState>
  metrics: SimMetrics
  events: SimEvent[]
}

export type EventSeverity = 'info' | 'warn' | 'error' | 'critical' | 'success'

export interface SimEvent {
  id: string
  tick: number
  severity: EventSeverity
  /** Short machine-ish source, e.g. "alb/prod" or "scheduler". */
  source: string
  message: string
  nodeId?: string
}

/** An active fault injected into the graph. */
export interface ActiveIncident {
  id: string
  nodeId: string
  /** Matches a `FailureMode.id` from the catalog when it came from one. */
  modeId: string
  label: string
  symptom: string
  remedy: string
  /** How much of the node's capacity is lost, 0..1. */
  capacityLoss: number
  /** Extra latency in ms. */
  latencyPenaltyMs: number
  /** Errors injected independent of capacity, 0..1. */
  errorRate: number
  startedAtTick: number
  /** Ticks until it clears on its own; undefined means it needs fixing. */
  durationTicks?: number
}

export interface SimConfig {
  /** Seconds of simulated time per tick. */
  secondsPerTick: number
  /** Deterministic seed so a scenario replays identically. */
  seed: number
  /** Multiplies every client's baseline traffic. */
  loadMultiplier: number
  /** Attacks are evaluated only when true. */
  attacksEnabled: boolean
}

export const DEFAULT_CONFIG: SimConfig = {
  secondsPerTick: 1,
  seed: 1,
  loadMultiplier: 1,
  attacksEnabled: true,
}
