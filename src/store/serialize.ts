import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { defaultProps, getResource, requireResource } from '@/catalog/registry'
import type { SimGraph } from '@/sim/types'
import type { CwEdge, CwNode, SavedDiagram } from './types'

/**
 * Turns a saved document into React Flow nodes and edges. Shared by the editor
 * and by the embedded codex canvases so both render a diagram identically.
 */
export function toFlow(diagram: SavedDiagram): { nodes: CwNode[]; edges: CwEdge[] } {
  const nodes: CwNode[] = diagram.nodes
    .filter((n) => getResource(n.defId))
    .map((n) => {
      const def = requireResource(n.defId)
      return {
        id: n.id,
        type: def.container ? 'container' : 'resource',
        position: { x: n.x, y: n.y },
        data: { defId: n.defId, label: n.label, props: { ...defaultProps(def), ...n.props } },
        ...(def.container
          ? {
              style: { width: n.w ?? def.container.size?.width ?? 320, height: n.h ?? def.container.size?.height ?? 240 },
              zIndex: -1,
            }
          : {}),
        ...(n.parentId ? { parentId: n.parentId, extent: 'parent' as const } : {}),
      }
    })

  const ids = new Set(nodes.map((n) => n.id))
  const edges: CwEdge[] = diagram.edges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: 'flow',
      data: { flow: e.flow, flows: e.flows },
    }))

  return { nodes, edges }
}

/** The shape the simulator consumes, straight from a saved document. */
export function toSimGraph(diagram: SavedDiagram): SimGraph {
  return {
    nodes: diagram.nodes
      .filter((n) => getResource(n.defId))
      .map((n) => ({ id: n.id, defId: n.defId, props: n.props, parentId: n.parentId })),
    edges: diagram.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourcePort: e.sourceHandle,
      targetPort: e.targetHandle,
      flow: e.flow,
    })),
  }
}

export function serialize(name: string, nodes: CwNode[], edges: CwEdge[]): SavedDiagram {
  return {
    version: 1,
    name,
    nodes: nodes.map((n) => ({
      id: n.id,
      defId: n.data.defId,
      label: n.data.label,
      props: n.data.props,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      w: n.width ?? n.style?.width ? Math.round(Number(n.width ?? n.style?.width)) : undefined,
      h: n.height ?? n.style?.height ? Math.round(Number(n.height ?? n.style?.height)) : undefined,
      parentId: n.parentId,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle ?? '',
      target: e.target,
      targetHandle: e.targetHandle ?? '',
      flow: e.data!.flow,
      flows: e.data!.flows,
    })),
  }
}

export function encodeShareLink(diagram: SavedDiagram): string {
  return compressToEncodedURIComponent(JSON.stringify(diagram))
}

export function decodeShareLink(encoded: string): SavedDiagram | null {
  try {
    const json = decompressFromEncodedURIComponent(encoded)
    if (!json) return null
    const parsed = JSON.parse(json) as SavedDiagram
    return parsed.version === 1 && Array.isArray(parsed.nodes) ? parsed : null
  } catch {
    return null
  }
}
