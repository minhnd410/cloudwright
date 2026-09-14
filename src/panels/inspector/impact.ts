import type { PropBag, PropDef, ResourceDef } from '@/catalog/schema/types'
import { deriveProfile } from '@/sim/capacity'
import { nodeCostPerHour } from '@/sim/cost'

export interface ImpactDelta {
  key: 'capacity' | 'cost' | 'latency' | 'availability'
  label: string
  before: number
  after: number
  /** Positive means the change improved things. */
  better: boolean
  format: (v: number) => string
}

const fmtRps = (v: number) => (!Number.isFinite(v) ? '∞' : v >= 1000 ? `${(v / 1000).toFixed(1)}k rps` : `${v.toFixed(0)} rps`)
const fmtMs = (v: number) => `${v.toFixed(0)}ms`
const fmtUsd = (v: number) => (v >= 1 ? `$${v.toFixed(2)}/h` : `$${v.toFixed(3)}/h`)
const fmtNines = (v: number) => {
  // Nothing is 100% available, and rounding to it would be a lie.
  if (v >= 0.99999) return '99.999%+'
  const pct = v * 100
  if (pct >= 99.9) return `${pct.toFixed(3)}%`
  if (pct >= 99) return `${pct.toFixed(2)}%`
  return `${pct.toFixed(1)}%`
}

/**
 * What actually changes when a property moves. Runs the same derivation the
 * simulator uses, so the preview can never drift from the behaviour.
 */
export function computeImpact(
  def: ResourceDef,
  before: PropBag,
  after: PropBag,
  servedRps: number,
): ImpactDelta[] {
  const a = deriveProfile(def, before)
  const b = deriveProfile(def, after)
  const costA = nodeCostPerHour(def, before, servedRps)
  const costB = nodeCostPerHour(def, after, servedRps)

  const deltas: ImpactDelta[] = []
  const eps = 1e-6

  if (Math.abs(a.capacity - b.capacity) > eps && Number.isFinite(a.capacity) && Number.isFinite(b.capacity)) {
    deltas.push({ key: 'capacity', label: 'Capacity', before: a.capacity, after: b.capacity, better: b.capacity > a.capacity, format: fmtRps })
  }
  if (Math.abs(a.baseLatencyMs - b.baseLatencyMs) > eps) {
    deltas.push({ key: 'latency', label: 'Base latency', before: a.baseLatencyMs, after: b.baseLatencyMs, better: b.baseLatencyMs < a.baseLatencyMs, format: fmtMs })
  }
  if (Math.abs(a.availability - b.availability) > 1e-5) {
    deltas.push({ key: 'availability', label: 'Availability', before: a.availability, after: b.availability, better: b.availability > a.availability, format: fmtNines })
  }
  if (Math.abs(costA - costB) > 1e-4) {
    deltas.push({ key: 'cost', label: 'Cost', before: costA, after: costB, better: costB < costA, format: fmtUsd })
  }
  return deltas
}

/** The at-a-glance numbers for the current configuration. */
export function currentSummary(def: ResourceDef, props: PropBag, servedRps: number) {
  const profile = deriveProfile(def, props)
  return {
    capacity: profile.capacity,
    latency: profile.baseLatencyMs,
    availability: profile.availability,
    cost: nodeCostPerHour(def, props, servedRps),
    replicas: profile.replicas,
    fmtRps, fmtMs, fmtUsd, fmtNines,
  }
}

export function affectedBy(prop: PropDef): string[] {
  return prop.affects ?? []
}
