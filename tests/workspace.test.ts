import { beforeEach, describe, expect, it } from 'vitest'
import { parseDiagram, diagramToJson } from '@/store/files'
import { useGame } from '@/store/gameStore'
import { useTabs } from '@/store/tabStore'
import { TEMPLATES } from '@/scenarios/templates'
import { appendFrame, milestonesOf, newRecording, parseRecording, summarise } from '@/sim/recording'
import { run } from '@/sim/engine'
import type { SimGraph } from '@/sim/types'
import type { SavedDiagram } from '@/store/types'

function toSimGraph(d: SavedDiagram): SimGraph {
  return {
    nodes: d.nodes.map((n) => ({ id: n.id, defId: n.defId, props: n.props, parentId: n.parentId })),
    edges: d.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourcePort: e.sourceHandle, targetPort: e.targetHandle, flow: e.flow })),
  }
}

// jsdom is not configured for these tests; stub just enough for persistence.
const memory = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
}

describe('JSON import and export', () => {
  it('round-trips a template exactly', () => {
    const original = TEMPLATES[0].build()
    const parsed = parseDiagram(diagramToJson(original))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.unknown).toEqual([])
    expect(parsed.diagram.nodes.length).toBe(original.nodes.length)
    expect(parsed.diagram.edges.length).toBe(original.edges.length)
    // And the imported copy still simulates the same way.
    expect(run(toSimGraph(parsed.diagram), 3).metrics.totalDemand)
      .toBe(run(toSimGraph(original), 3).metrics.totalDemand)
  })

  it('rejects files that are not diagrams', () => {
    expect(parseDiagram('not json').ok).toBe(false)
    expect(parseDiagram('{"version":9}').ok).toBe(false)
    expect(parseDiagram('{"version":1}').ok).toBe(false)
  })

  it('reports resources this build does not know', () => {
    const result = parseDiagram(JSON.stringify({
      version: 1, name: 'From the future',
      nodes: [{ id: 'a', defId: 'aws.quantum-mesh', label: 'Q', props: {}, x: 0, y: 0 }],
      edges: [],
    }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.unknown).toEqual(['aws.quantum-mesh'])
  })
})

describe('tabs', () => {
  beforeEach(() => {
    memory.clear()
    useTabs.setState({ tabs: [], activeId: '' })
    useGame.getState().clear()
  })

  it('opens documents into separate tabs and keeps them independent', () => {
    const first = useTabs.getState().open(TEMPLATES[0].build())
    const firstCount = useGame.getState().nodes.length
    expect(firstCount).toBeGreaterThan(3)

    const second = useTabs.getState().open(TEMPLATES[1].build())
    expect(useGame.getState().nodes.length).not.toBe(0)
    expect(useTabs.getState().tabs).toHaveLength(2)
    expect(useTabs.getState().activeId).toBe(second)

    useTabs.getState().activate(first)
    expect(useGame.getState().nodes.length).toBe(firstCount)
  })

  it('carries edits back into the tab when switching away', () => {
    const first = useTabs.getState().open(TEMPLATES[0].build())
    const second = useTabs.getState().open()

    useTabs.getState().activate(first)
    const target = useGame.getState().nodes[0]
    useGame.getState().renameNode(target.id, 'Renamed on purpose')

    useTabs.getState().activate(second)
    useTabs.getState().activate(first)
    expect(useGame.getState().nodes[0].data.label).toBe('Renamed on purpose')
  })

  it('always leaves one document open', () => {
    const only = useTabs.getState().open(TEMPLATES[0].build())
    useTabs.getState().close(only)
    expect(useTabs.getState().tabs).toHaveLength(1)
    expect(useGame.getState().nodes).toHaveLength(0)
  })

  it('never persists an empty workspace over a real one', () => {
    useTabs.getState().open(TEMPLATES[0].build())
    useTabs.getState().persist()
    const saved = memory.get('cloudwright:workspace:v1')
    useTabs.setState({ tabs: [], activeId: '' })
    useTabs.getState().persist()
    expect(memory.get('cloudwright:workspace:v1')).toBe(saved)
  })

  it('restores a saved workspace', () => {
    useTabs.getState().open(TEMPLATES[2].build())
    const expected = useGame.getState().nodes.length
    useTabs.getState().syncActive()
    useTabs.getState().persist()

    useTabs.setState({ tabs: [], activeId: '' })
    useGame.getState().clear()
    expect(useTabs.getState().restore()).toBe(true)
    expect(useGame.getState().nodes.length).toBe(expected)
  })
})

describe('recordings', () => {
  it('capture frames and summarise a run', () => {
    const diagram = TEMPLATES[0].build()
    let recording = newRecording('Test run', diagram)
    const graph = toSimGraph(diagram)
    let state = run(graph, 1)
    for (let i = 0; i < 12; i++) {
      state = run(graph, 1)
      recording = appendFrame(recording, state, [])
    }
    expect(recording.frames).toHaveLength(12)
    const stats = summarise(recording)
    expect(stats.frames).toBe(12)
    expect(stats.peakLatencyMs).toBeGreaterThan(0)
  })

  it('round-trip through JSON and keep their milestones', () => {
    const diagram = TEMPLATES[0].build()
    let recording = newRecording('Test run', diagram)
    const graph = toSimGraph(diagram)
    let previous
    for (let i = 0; i < 6; i++) {
      previous = run(graph, i + 1)
      recording = appendFrame(recording, previous, [])
    }
    const parsed = parseRecording(JSON.stringify(recording))
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.frames).toHaveLength(6)
    expect(milestonesOf(parsed)).toBeInstanceOf(Array)
  })

  it('reject malformed recordings', () => {
    expect('error' in parseRecording('nope')).toBe(true)
    expect('error' in parseRecording('{"version":1,"frames":[]}')).toBe(true)
  })
})
