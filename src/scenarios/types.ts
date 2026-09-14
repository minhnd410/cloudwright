import type { Archetype, PropBag, PropValue } from '@/catalog/schema/types'
import type { Finding } from '@/sim/advisor'
import type { ActiveIncident, SimGraph, SimState } from '@/sim/types'
import type { SavedDiagram } from '@/store/types'

export type Difficulty = 'intro' | 'easy' | 'medium' | 'hard' | 'expert'
export type Track = 'foundations' | 'reliability' | 'security' | 'kubernetes' | 'cost'

export interface MissionContext {
  graph: SimGraph
  sim: SimState | null
  findings: Finding[]
  incidents: ActiveIncident[]
  /** Is there at least one node of this archetype? */
  has: (archetype: Archetype) => boolean
  /** How many nodes of this archetype? */
  count: (archetype: Archetype) => number
  /** Is there a specific catalog resource on the canvas? */
  hasResource: (defId: string) => boolean
  /** Does traffic reach `to` from `from`, following connections? */
  reaches: (from: Archetype, to: Archetype) => boolean
  /** Do all nodes of this archetype satisfy the predicate? (vacuously true if none) */
  every: (archetype: Archetype, predicate: (props: PropBag) => boolean) => boolean
  /** Does any node of this archetype satisfy the predicate? */
  some: (archetype: Archetype, predicate: (props: PropBag) => boolean) => boolean
  /** Shorthand for `some(archetype, p => p[key] === value)`. */
  prop: (archetype: Archetype, key: string, value: PropValue) => boolean
  /** Is this node nested inside a container of the given archetype (with optional props)? */
  insideA: (child: Archetype, parent: Archetype, predicate?: (props: PropBag) => boolean) => boolean
  /** No advisor finding matching the predicate is present. */
  noFinding: (predicate: (f: Finding) => boolean) => boolean
  /** Live simulation metric, or 0 when not running. */
  metric: (key: 'errorRate' | 'p95LatencyMs' | 'costPerHour' | 'costPerMonth' | 'availability' | 'totalServed' | 'totalDemand' | 'compromise') => number
  /** Has the simulation run at least this many ticks? */
  ranFor: (ticks: number) => boolean
}

export interface Objective {
  id: string
  label: string
  check: (ctx: MissionContext) => boolean
  /** Shown when the player asks for help on this objective. */
  hint?: string
  /** Optional — an objective that must stay true, not just become true once. */
  sustained?: boolean
}

export interface Mission {
  id: string
  title: string
  tagline: string
  difficulty: Difficulty
  track: Track
  /** Ordered id of the mission that should be completed first. */
  requires?: string
  /** The scenario, in the voice of someone handing you a problem. */
  brief: string[]
  /** Pre-built starting architecture, if any. */
  start?: SavedDiagram
  /** Faults active from the first tick. */
  startIncidents?: { nodeId: string; modeId: string }[]
  objectives: Objective[]
  /** Progressive hints, revealed one at a time. */
  hints: string[]
  /** Shown on completion — the lesson, stated plainly. */
  debrief: string[]
  concepts: string[]
  /** Roughly how long this takes. */
  minutes: number
}

export const DIFFICULTY_META: Record<Difficulty, { label: string; color: string }> = {
  intro: { label: 'Intro', color: 'var(--color-signal)' },
  easy: { label: 'Easy', color: 'var(--color-flux)' },
  medium: { label: 'Medium', color: 'var(--color-ember)' },
  hard: { label: 'Hard', color: 'var(--color-alarm)' },
  expert: { label: 'Expert', color: 'var(--color-toxic)' },
}

export const TRACK_META: Record<Track, { label: string; blurb: string }> = {
  foundations: { label: 'Foundations', blurb: 'How requests actually reach your code' },
  reliability: { label: 'Reliability', blurb: 'Surviving failure without surprising users' },
  security: { label: 'Security', blurb: 'Attacks, and the controls that stop them' },
  kubernetes: { label: 'Kubernetes', blurb: 'Scheduling, probes and the control loop' },
  cost: { label: 'Cost', blurb: 'The same outcome for less money' },
}
