import type { ResourceDef } from '@/catalog/schema/types'
import { getResource } from '@/catalog/registry'
import { isTrafficFlow } from '@/catalog/schema/flows'
import type { SimEdge, SimGraph } from './types'

/** Archetypes that forward the same request to one of several interchangeable backends. */
const SPLITTERS = new Set([
  'load-balancer-l7', 'load-balancer-l4', 'k8s-service', 'k8s-ingress',
  'api-gateway', 'waf', 'ddos-shield', 'internet', 'internet-gateway',
  'nat', 'firewall', 'dns-zone', 'service-mesh', 'private-link',
])

/** Archetypes that pass traffic through unchanged rather than answering it. */
export const PASS_THROUGH = new Set([
  'internet', 'internet-gateway', 'nat', 'firewall', 'waf', 'ddos-shield',
  'private-link', 'service-mesh', 'dns-zone',
])

export interface Topology {
  /** Definition for every node, resolved once. */
  defs: Map<string, ResourceDef>
  /** Outgoing traffic-carrying edges per node. */
  out: Map<string, SimEdge[]>
  /** Incoming traffic-carrying edges per node. */
  in: Map<string, SimEdge[]>
  /** All edges, including non-traffic ones (identity, telemetry…). */
  allOut: Map<string, SimEdge[]>
  allIn: Map<string, SimEdge[]>
  /** Nodes that originate legitimate traffic. */
  sources: string[]
  /** Nodes that originate hostile traffic. */
  attackers: string[]
  /** Evaluation order; safe in the presence of cycles. */
  order: string[]
  /** Containment children per parent. */
  children: Map<string, string[]>
  /** Containment parent per child. */
  parentOf: Map<string, string>
}

export function buildTopology(graph: SimGraph): Topology {
  const defs = new Map<string, ResourceDef>()
  const out = new Map<string, SimEdge[]>()
  const inc = new Map<string, SimEdge[]>()
  const allOut = new Map<string, SimEdge[]>()
  const allIn = new Map<string, SimEdge[]>()
  const children = new Map<string, string[]>()
  const parentOf = new Map<string, string>()
  const sources: string[] = []
  const attackers: string[] = []

  const live = graph.nodes.filter((n) => !n.disabled)
  const liveIds = new Set(live.map((n) => n.id))

  for (const node of live) {
    const def = getResource(node.defId)
    if (!def) continue
    defs.set(node.id, def)
    out.set(node.id, [])
    inc.set(node.id, [])
    allOut.set(node.id, [])
    allIn.set(node.id, [])
    if (def.archetype === 'client') sources.push(node.id)
    if (def.archetype === 'attacker') attackers.push(node.id)
    if (node.parentId && liveIds.has(node.parentId)) {
      const list = children.get(node.parentId) ?? []
      list.push(node.id)
      children.set(node.parentId, list)
      parentOf.set(node.id, node.parentId)
    }
  }

  for (const edge of graph.edges) {
    if (!defs.has(edge.source) || !defs.has(edge.target)) continue
    allOut.get(edge.source)!.push(edge)
    allIn.get(edge.target)!.push(edge)
    if (isTrafficFlow(edge.flow)) {
      out.get(edge.source)!.push(edge)
      inc.get(edge.target)!.push(edge)
    }
  }

  return {
    defs, out, in: inc, allOut, allIn, sources, attackers, children, parentOf,
    order: topoOrder([...defs.keys()], out),
  }
}

/**
 * Depth-first finishing order, reversed. Real architectures contain cycles
 * (a service calling back into a queue its own consumer reads), so this breaks
 * them deterministically rather than refusing to sort.
 */
function topoOrder(ids: string[], out: Map<string, SimEdge[]>): string[] {
  const state = new Map<string, 0 | 1 | 2>()
  const finished: string[] = []

  const visit = (id: string) => {
    if (state.get(id)) return
    state.set(id, 1)
    for (const e of out.get(id) ?? []) {
      if (state.get(e.target) !== 1) visit(e.target)
    }
    state.set(id, 2)
    finished.push(id)
  }

  for (const id of ids) visit(id)
  return finished.reverse()
}

/**
 * How much of a node's served traffic travels along each outgoing edge.
 *
 * This is where most of the architectural teaching lives: a load balancer
 * splits, a CDN absorbs its hit ratio, and a cache in front of a database
 * removes most of the reads that would otherwise land on it.
 */
export function fanout(
  nodeId: string,
  topo: Topology,
  hitRatio: number,
): Map<string, number> {
  const result = new Map<string, number>()
  const edges = topo.out.get(nodeId) ?? []
  if (edges.length === 0) return result

  const def = topo.defs.get(nodeId)!

  if (SPLITTERS.has(def.archetype)) {
    // Interchangeable backends: each request goes to exactly one of them.
    const share = 1 / edges.length
    for (const e of edges) result.set(e.id, share)
    return result
  }

  if (def.archetype === 'cdn') {
    // Only cache misses reach the origin.
    for (const e of edges) result.set(e.id, 1 - hitRatio)
    return result
  }

  // Compute tiers call each dependency once per request — except where a cache
  // sits alongside a database, in which case the cache absorbs most reads.
  const cacheEdges = edges.filter((e) => topo.defs.get(e.target)?.archetype === 'cache')
  const cacheAbsorb = cacheEdges.length > 0 ? 0.85 : 0

  for (const e of edges) {
    const targetDef = topo.defs.get(e.target)
    const isCacheable = targetDef && ['relational-db', 'nosql-db', 'search', 'data-warehouse', 'object-store'].includes(targetDef.archetype)
    result.set(e.id, isCacheable ? 1 - cacheAbsorb : 1)
  }
  return result
}
