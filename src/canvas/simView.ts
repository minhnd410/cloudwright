import { createContext, useContext } from 'react'
import { useGame } from '@/store/gameStore'
import type { ActiveIncident, EdgeState, NodeState, SimState } from '@/sim/types'

/**
 * Where a canvas reads its simulation from.
 *
 * The editor reads the global store. An embedded canvas — a codex illustration,
 * say — provides its own state here instead, so it can run a demonstration
 * without touching the diagram the player is working on.
 */
export interface SimView {
  sim: SimState | null
  speed: number
  incidents: ActiveIncident[]
}

/**
 * Wrap an embedded canvas in `<SimViewContext value={…}>` to drive it from a
 * local simulation instead of the editor's.
 */
export const SimViewContext = createContext<SimView | null>(null)

/** True when this canvas is an embedded illustration rather than the editor. */
export function useIsEmbedded(): boolean {
  return useContext(SimViewContext) !== null
}

export function useNodeSimState(nodeId: string): NodeState | undefined {
  const local = useContext(SimViewContext)
  const global = useGame((s) => s.sim?.nodes[nodeId])
  return local ? local.sim?.nodes[nodeId] : global
}

export function useEdgeSimState(edgeId: string): EdgeState | undefined {
  const local = useContext(SimViewContext)
  const global = useGame((s) => s.sim?.edges[edgeId])
  return local ? local.sim?.edges[edgeId] : global
}

export function useSimRunning(): boolean {
  const local = useContext(SimViewContext)
  const global = useGame((s) => s.sim !== null)
  return local ? local.sim !== null : global
}

export function useSimSpeed(): number {
  const local = useContext(SimViewContext)
  const global = useGame((s) => s.speed)
  return local ? local.speed : global
}

export function useNodeIncidentCount(nodeId: string): number {
  const local = useContext(SimViewContext)
  const global = useGame((s) => s.incidents.filter((i) => i.nodeId === nodeId).length)
  return local ? local.incidents.filter((i) => i.nodeId === nodeId).length : global
}
