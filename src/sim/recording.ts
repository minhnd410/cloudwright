import type { ActiveIncident, SimState } from './types'
import type { SavedDiagram } from '@/store/types'

/**
 * A recording is the simulation's own output captured tick by tick. Because the
 * engine is deterministic and stateless between ticks, a recording is a
 * complete, replayable account of what happened — no re-simulation required,
 * and it can be shared, diffed or rendered to video.
 */

export interface RecordedFrame {
  tick: number
  elapsed: number
  state: SimState
  /** Faults active on this tick, so the replay can explain itself. */
  incidents: ActiveIncident[]
}

export interface Recording {
  version: 1
  name: string
  recordedAt: string
  /** The architecture the recording was made against. */
  diagram: SavedDiagram
  frames: RecordedFrame[]
}

export const MAX_FRAMES = 900

export function newRecording(name: string, diagram: SavedDiagram): Recording {
  return { version: 1, name, recordedAt: new Date().toISOString(), diagram, frames: [] }
}

export function appendFrame(recording: Recording, state: SimState, incidents: ActiveIncident[]): Recording {
  const frame: RecordedFrame = {
    tick: state.tick,
    elapsed: state.elapsed,
    state,
    incidents: incidents.map((i) => ({ ...i })),
  }
  const frames = [...recording.frames, frame]
  return { ...recording, frames: frames.length > MAX_FRAMES ? frames.slice(frames.length - MAX_FRAMES) : frames }
}

/** Moments worth jumping to: status changes, incidents and breaches. */
export interface Milestone {
  index: number
  tick: number
  severity: 'info' | 'warn' | 'error' | 'critical' | 'success'
  label: string
}

export function milestonesOf(recording: Recording): Milestone[] {
  const out: Milestone[] = []
  const seen = new Set<string>()

  recording.frames.forEach((frame, index) => {
    for (const event of frame.state.events) {
      if (event.severity === 'info') continue
      const key = `${event.severity}:${event.message}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ index, tick: frame.tick, severity: event.severity, label: event.message })
    }
  })

  return out.slice(0, 40)
}

export function parseRecording(text: string): Recording | { error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { error: 'That file is not valid JSON.' }
  }
  const recording = parsed as Partial<Recording>
  if (recording?.version !== 1 || !Array.isArray(recording.frames)) {
    return { error: 'Unrecognised format — expected a Cloudwright recording with "version": 1.' }
  }
  if (recording.frames.length === 0) return { error: 'That recording has no frames.' }
  return recording as Recording
}

export function summarise(recording: Recording) {
  const frames = recording.frames
  const peakError = Math.max(...frames.map((f) => f.state.metrics.errorRate), 0)
  const peakLatency = Math.max(...frames.map((f) => f.state.metrics.p95LatencyMs), 0)
  const incidentIds = new Set(frames.flatMap((f) => f.incidents.map((i) => i.id)))
  const breached = new Set(
    frames.flatMap((f) => Object.values(f.state.nodes).filter((n) => n.breachedBy.length > 0).map((n) => n.id)),
  )
  return {
    frames: frames.length,
    seconds: frames.length > 0 ? frames[frames.length - 1].elapsed : 0,
    peakErrorRate: peakError,
    peakLatencyMs: peakLatency,
    incidents: incidentIds.size,
    compromisedNodes: breached.size,
  }
}
