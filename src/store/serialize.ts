import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { CwEdge, CwNode, SavedDiagram } from './types'

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
