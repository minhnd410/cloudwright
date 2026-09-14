import type { Edge, Node } from '@xyflow/react'
import type { Flow, PropBag } from '@/catalog/schema/types'

export interface CwNodeData extends Record<string, unknown> {
  defId: string
  /** Player-editable display name. */
  label: string
  props: PropBag
}

export interface CwEdgeData extends Record<string, unknown> {
  flow: Flow
  /** Every flow this connection could carry; the primary one is `flow`. */
  flows: Flow[]
}

export type CwNode = Node<CwNodeData>
export type CwEdge = Edge<CwEdgeData>

/** What gets written to localStorage and encoded into a share link. */
export interface SavedDiagram {
  version: 1
  name: string
  nodes: {
    id: string
    defId: string
    label: string
    props: PropBag
    x: number
    y: number
    w?: number
    h?: number
    parentId?: string
  }[]
  edges: {
    id: string
    source: string
    sourceHandle: string
    target: string
    targetHandle: string
    flow: Flow
    flows: Flow[]
  }[]
}
