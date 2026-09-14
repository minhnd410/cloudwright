import type { Flow, PropBag } from '@/catalog/schema/types'
import { defaultProps, requireResource } from '@/catalog/registry'
import { pickPrimaryFlow } from '@/catalog/schema/rules'
import { getPort } from '@/catalog/registry'
import type { SavedDiagram } from '@/store/types'

export interface NodeSpec {
  id: string
  def: string
  at: [number, number]
  props?: PropBag
  in?: string
  size?: [number, number]
  label?: string
}

/** `['app', 'out', 'db', 'in']` — the flow is inferred from the ports. */
export type EdgeSpec = [source: string, sourcePort: string, target: string, targetPort: string]

/**
 * Compact authoring helper for scenario starting positions. Resolves the edge
 * flow from the catalog so mission files never restate it.
 */
export function diagram(name: string, nodes: NodeSpec[], edges: EdgeSpec[]): SavedDiagram {
  return {
    version: 1,
    name,
    nodes: nodes.map((n) => {
      const def = requireResource(n.def)
      return {
        id: n.id,
        defId: n.def,
        label: n.label ?? def.short,
        props: { ...defaultProps(def), ...n.props },
        x: n.at[0],
        y: n.at[1],
        w: n.size?.[0] ?? def.container?.size?.width,
        h: n.size?.[1] ?? def.container?.size?.height,
        parentId: n.in,
      }
    }),
    edges: edges.map(([source, sourcePort, target, targetPort], i) => {
      const sourceDef = requireResource(nodes.find((n) => n.id === source)!.def)
      const targetDef = requireResource(nodes.find((n) => n.id === target)!.def)
      const sp = getPort(sourceDef, sourcePort)
      const tp = getPort(targetDef, targetPort)
      const shared = (sp?.flows ?? []).filter((f) => (tp?.flows ?? []).includes(f))
      if (shared.length === 0) {
        throw new Error(`Scenario edge ${source}:${sourcePort} → ${target}:${targetPort} carries no shared flow`)
      }
      return {
        id: `e${i + 1}`,
        source, target,
        sourceHandle: sourcePort,
        targetHandle: targetPort,
        flow: pickPrimaryFlow(shared) as Flow,
        flows: shared,
      }
    }),
  }
}
