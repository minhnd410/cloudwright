import type { Archetype, PropBag, PropValue } from '@/catalog/schema/types'
import { getResource } from '@/catalog/registry'
import { buildTopology } from '@/sim/graph'
import type { Finding } from '@/sim/advisor'
import type { ActiveIncident, SimGraph, SimState } from '@/sim/types'
import type { MissionContext } from './types'

export function buildContext(
  graph: SimGraph,
  sim: SimState | null,
  findings: Finding[],
  incidents: ActiveIncident[],
): MissionContext {
  const topo = buildTopology(graph)
  const withDef = graph.nodes
    .map((node) => ({ node, def: getResource(node.defId) }))
    .filter((x): x is { node: (typeof graph.nodes)[number]; def: NonNullable<ReturnType<typeof getResource>> } => Boolean(x.def))

  const ofArchetype = (a: Archetype) => withDef.filter((x) => x.def.archetype === a)

  const reachSets = new Map<string, Set<string>>()
  const reachableFrom = (id: string) => {
    let set = reachSets.get(id)
    if (set) return set
    set = new Set<string>()
    const stack = [id]
    while (stack.length) {
      const cur = stack.pop()!
      for (const e of topo.out.get(cur) ?? []) {
        if (set.has(e.target)) continue
        set.add(e.target)
        stack.push(e.target)
      }
    }
    reachSets.set(id, set)
    return set
  }

  return {
    graph,
    sim,
    findings,
    incidents,

    has: (a) => ofArchetype(a).length > 0,
    count: (a) => ofArchetype(a).length,
    hasResource: (defId) => graph.nodes.some((n) => n.defId === defId),

    reaches: (from, to) => {
      const targets = new Set(ofArchetype(to).map((x) => x.node.id))
      if (targets.size === 0) return false
      return ofArchetype(from).some((x) => {
        const reach = reachableFrom(x.node.id)
        for (const t of targets) if (reach.has(t)) return true
        return false
      })
    },

    every: (a, predicate) => ofArchetype(a).every((x) => predicate(x.node.props as PropBag)),
    some: (a, predicate) => ofArchetype(a).some((x) => predicate(x.node.props as PropBag)),
    prop: (a: Archetype, key: string, value: PropValue) =>
      ofArchetype(a).some((x) => x.node.props[key] === value),

    insideA: (child, parent, predicate) =>
      ofArchetype(child).some((x) => {
        const parentId = topo.parentOf.get(x.node.id)
        if (!parentId) return false
        const parentDef = topo.defs.get(parentId)
        if (parentDef?.archetype !== parent) return false
        if (!predicate) return true
        const parentNode = graph.nodes.find((n) => n.id === parentId)
        return parentNode ? predicate(parentNode.props as PropBag) : false
      }),

    noFinding: (predicate) => !findings.some(predicate),

    metric: (key) => sim?.metrics[key] ?? 0,
    ranFor: (ticks) => (sim?.tick ?? 0) >= ticks,
  }
}
