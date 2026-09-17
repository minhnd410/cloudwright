import { describe, expect, it } from 'vitest'
import { useMission } from '@/store/missionStore'
import { useGame } from '@/store/gameStore'
import { diagram } from '@/scenarios/builder'
import { MISSIONS } from '@/scenarios/missions'
import { buildContext } from '@/scenarios/context'
import { review } from '@/sim/advisor'
import { run } from '@/sim/engine'
import { getResource, requireResource } from '@/catalog/registry'
import type { SimGraph } from '@/sim/types'
import type { SavedDiagram } from '@/store/types'

// jsdom is not configured for these tests; stub just enough for the mission
// store's completed-progress persistence.
const memory = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
}

function toSimGraph(diagram: SavedDiagram): SimGraph {
  return {
    nodes: diagram.nodes.map((n) => ({ id: n.id, defId: n.defId, props: n.props, parentId: n.parentId })),
    edges: diagram.edges.map((e) => ({
      id: e.id, source: e.source, target: e.target,
      sourcePort: e.sourceHandle, targetPort: e.targetHandle, flow: e.flow,
    })),
  }
}

describe('missions', () => {
  it('have unique ids and valid prerequisites', () => {
    const ids = MISSIONS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of MISSIONS) {
      if (m.requires) expect(ids, `${m.id} requires a mission that does not exist`).toContain(m.requires)
    }
  })

  it('reference only resources that exist', () => {
    for (const m of MISSIONS) {
      for (const n of m.start?.nodes ?? []) {
        expect(getResource(n.defId), `${m.id} uses unknown resource ${n.defId}`).toBeTruthy()
      }
    }
  })

  it('seed incidents that the target resource can actually suffer', () => {
    for (const m of MISSIONS) {
      for (const seed of m.startIncidents ?? []) {
        const node = m.start?.nodes.find((n) => n.id === seed.nodeId)
        expect(node, `${m.id} seeds an incident on unknown node ${seed.nodeId}`).toBeTruthy()
        const modes = requireResource(node!.defId).sim?.failureModes ?? []
        expect(modes.map((x) => x.id), `${m.id}: ${node!.defId} has no mode ${seed.modeId}`).toContain(seed.modeId)
      }
    }
  })

  it('evaluate every objective without throwing, on their own starting state', () => {
    for (const m of MISSIONS) {
      const graph = m.start ? toSimGraph(m.start) : { nodes: [], edges: [] }
      const sim = graph.nodes.length ? run(graph, 3) : null
      const ctx = buildContext(graph, sim, review(graph), [])
      for (const objective of m.objectives) {
        expect(() => objective.check(ctx), `${m.id}/${objective.id} threw`).not.toThrow()
      }
    }
  })

  it('do not start already solved', () => {
    for (const m of MISSIONS) {
      const graph = m.start ? toSimGraph(m.start) : { nodes: [], edges: [] }
      const sim = graph.nodes.length ? run(graph, 3) : null
      const ctx = buildContext(graph, sim, review(graph), [])
      const solved = m.objectives.filter((o) => o.check(ctx))
      expect(solved.length, `${m.id} starts with every objective already met`).toBeLessThan(m.objectives.length)
    }
  })

  it('give every objective a hint or a self-evident label', () => {
    for (const m of MISSIONS) {
      expect(m.objectives.length, `${m.id} has no objectives`).toBeGreaterThan(2)
      expect(m.hints.length, `${m.id} has no hints`).toBeGreaterThan(0)
      expect(m.debrief.length, `${m.id} has no debrief`).toBeGreaterThan(0)
    }
  })

  it('starting architectures actually carry traffic', () => {
    for (const m of MISSIONS) {
      if (!m.start) continue
      const state = run(toSimGraph(m.start), 3)
      expect(state.metrics.totalDemand, `${m.id} start has no traffic source`).toBeGreaterThan(0)
    }
  })
})

describe('templates', () => {
  it('build without error and carry traffic', async () => {
    const { TEMPLATES } = await import('@/scenarios/templates')
    for (const t of TEMPLATES) {
      const built = t.build()
      expect(built.nodes.length, `${t.id} is empty`).toBeGreaterThan(3)
      const state = run(toSimGraph(built), 3)
      expect(state.metrics.totalDemand, `${t.id} has no traffic`).toBeGreaterThan(0)
      expect(state.metrics.errorRate, `${t.id} fails out of the box`).toBeLessThan(0.05)
    }
  })

  it('templates score reasonably well as starting points', async () => {
    const { TEMPLATES } = await import('@/scenarios/templates')
    const { scoreFindings } = await import('@/sim/advisor')
    for (const t of TEMPLATES) {
      const { score } = scoreFindings(review(toSimGraph(t.build())))
      expect(score, `${t.id} scores only ${score}`).toBeGreaterThan(55)
    }
  })
})

describe('the mission-complete popup', () => {
  it('stays dismissed even though the sim keeps re-confirming the objectives', () => {
    // Regression for: dismissing "Mission complete" closed the popup, but the
    // simulation keeps ticking in the background — the next tick re-evaluated
    // the (unchanged, still-solved) architecture and flipped `finished` back
    // to true, so the popup unmounted and immediately remounted mid-close.
    useMission.getState().start('first-contact')
    const game = useGame.getState()
    game.load(diagram('solved', [
      { id: 'users', def: 'core.client', at: [0, 0], props: { rps: 400 } },
      { id: 'alb', def: 'aws.alb', at: [200, 0] },
      { id: 'app', def: 'aws.ec2', at: [400, 0], props: { size: 'm5.large', replicas: 3 } },
    ], [
      ['users', 'out', 'alb', 'in'],
      ['alb', 'out', 'app', 'in'],
    ]))
    for (let i = 0; i < 5; i++) game.step()
    useMission.getState().evaluate()
    expect(useMission.getState().finished).toBe(true)
    expect(useMission.getState().debriefDismissed).toBe(false)

    useMission.getState().dismissDebrief()
    expect(useMission.getState().debriefDismissed).toBe(true)

    // A background tick fires with nothing on the canvas changed.
    game.step()
    useMission.getState().evaluate()

    expect(useMission.getState().finished).toBe(true)
    expect(useMission.getState().debriefDismissed).toBe(true)
  })
})
