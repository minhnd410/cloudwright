import { useGame } from '@/store/gameStore'
import { useTabs } from '@/store/tabStore'
import { useUi } from '@/store/uiStore'
import { getResource } from '@/catalog/registry'
import { makeIncident } from '@/sim/incidents'
import type { SavedDiagram } from '@/store/types'

/**
 * A small scripting surface on `window`.
 *
 * It exists so the MCP server (and the test suite) can drive the real
 * application deterministically — load a diagram, advance an exact number of
 * ticks, read the result — instead of clicking buttons and hoping. Everything
 * it exposes is something the UI can already do.
 */
export interface CloudwrightBridge {
  readonly version: 1
  ready: boolean
  loadDiagram(diagram: SavedDiagram, options?: { newTab?: boolean }): void
  setChromeless(on: boolean): void
  /** Re-runs fit-to-view, e.g. after the layout has changed size. */
  refit(): void
  /** Runs exactly `count` simulation ticks, synchronously. */
  step(count?: number): void
  reset(): void
  injectIncident(nodeId: string, modeId: string): boolean
  clearIncidents(): void
  setLoadMultiplier(multiplier: number): void
  setAttacksEnabled(on: boolean): void
  /** Metrics, per-node state and findings, as plain JSON. */
  snapshot(): unknown
}

export function installBridge() {
  const bridge: CloudwrightBridge = {
    version: 1,
    ready: true,

    loadDiagram(diagram, options) {
      if (options?.newTab === false) useGame.getState().load(diagram)
      else useTabs.getState().open(diagram)
    },

    setChromeless(on) {
      useUi.getState().setChromeless(on)
    },

    refit() {
      useGame.setState((s) => ({ fitSignal: s.fitSignal + 1 }))
    },

    step(count = 1) {
      const game = useGame.getState()
      for (let i = 0; i < count; i++) game.step()
    },

    reset() {
      useGame.getState().resetSim()
    },

    injectIncident(nodeId, modeId) {
      const node = useGame.getState().nodes.find((n) => n.id === nodeId)
      if (!node) return false
      const mode = getResource(node.data.defId)?.sim?.failureModes?.find((m) => m.id === modeId)
      if (!mode) return false
      const tick = useGame.getState().sim?.tick ?? 0
      const incident = makeIncident(nodeId, mode, tick)
      useGame.setState((s) => ({ incidents: [...s.incidents.filter((i) => i.id !== incident.id), incident] }))
      return true
    },

    clearIncidents() {
      useGame.setState({ incidents: [] })
    },

    setLoadMultiplier(multiplier) {
      useGame.getState().setLoadMultiplier(multiplier)
    },

    setAttacksEnabled(on) {
      useGame.getState().setAttacksEnabled(on)
    },

    snapshot() {
      const { sim, findings, score, incidents, nodes, name } = useGame.getState()
      return {
        name,
        score,
        tick: sim?.tick ?? 0,
        metrics: sim?.metrics ?? null,
        incidents: incidents.map((i) => ({ id: i.id, nodeId: i.nodeId, label: i.label })),
        findings: findings.map((f) => ({ id: f.id, severity: f.severity, pillar: f.pillar, title: f.title })),
        nodes: nodes.map((n) => {
          const state = sim?.nodes[n.id]
          return {
            id: n.id,
            label: n.data.label,
            type: n.data.defId,
            status: state?.status ?? 'idle',
            demand: state?.demand ?? 0,
            served: state?.served ?? 0,
            errorRate: state?.errorRate ?? 0,
            latencyMs: state?.latencyMs ?? 0,
            costPerHour: state?.costPerHour ?? 0,
            breachedBy: state?.breachedBy ?? [],
          }
        }),
      }
    },
  }

  ;(window as unknown as { __cloudwright: CloudwrightBridge }).__cloudwright = bridge
}
