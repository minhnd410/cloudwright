import { getResource } from '@/catalog/registry'
import { isTrafficFlow } from '@/catalog/schema/flows'
import type { SavedDiagram } from '@/store/types'

const NODE_W = 188
const NODE_H = 96
const GAP_X = 52
const GAP_Y = 46
const COLUMN_GAP = 110
const ROW_GAP = 70
const PAD = 26
const HEADER = 44

interface Size { w: number; h: number }

/**
 * Arranges a diagram left to right by dependency depth.
 *
 * Sources sit on the left; everything they reach moves one column right.
 * Containers are laid out from the inside out, so a subnet is sized by what it
 * holds before the VPC is sized by the subnets. It exists so that an author — a
 * person clicking Arrange, or a model calling the MCP server — never has to
 * think in pixels.
 */
export function autoLayout(diagram: SavedDiagram): SavedDiagram {
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]))
  const children = new Map<string, string[]>()
  const roots: string[] = []

  for (const node of diagram.nodes) {
    if (node.parentId && byId.has(node.parentId)) {
      children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id])
    } else {
      roots.push(node.id)
    }
  }

  const positions = new Map<string, { x: number; y: number }>()
  const sizes = new Map<string, Size>()

  /**
   * Lays out a container's children and returns the size it needs. Recursive,
   * so the innermost containers are sized first.
   */
  const sizeOf = (id: string): Size => {
    const cached = sizes.get(id)
    if (cached) return cached

    const kids = children.get(id) ?? []
    if (kids.length === 0) {
      const node = byId.get(id)!
      const isContainer = Boolean(getResource(node.defId)?.container)
      const size = isContainer ? { w: 260, h: 170 } : { w: NODE_W, h: NODE_H }
      sizes.set(id, size)
      return size
    }

    const kidSizes = kids.map((kid) => sizeOf(kid))
    const columns = Math.max(1, Math.round(Math.sqrt(kids.length)))

    // Column widths and row heights come from the widest and tallest members,
    // so a container holding other containers still fits everything.
    const colWidths: number[] = []
    const rowHeights: number[] = []
    kids.forEach((_, i) => {
      const col = i % columns
      const row = Math.floor(i / columns)
      colWidths[col] = Math.max(colWidths[col] ?? 0, kidSizes[i].w)
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, kidSizes[i].h)
    })

    kids.forEach((kid, i) => {
      const col = i % columns
      const row = Math.floor(i / columns)
      const x = PAD + colWidths.slice(0, col).reduce((a, b) => a + b + GAP_X, 0)
      const y = HEADER + rowHeights.slice(0, row).reduce((a, b) => a + b + GAP_Y, 0)
      positions.set(kid, { x, y })
    })

    const size = {
      w: PAD * 2 + colWidths.reduce((a, b) => a + b, 0) + GAP_X * (colWidths.length - 1),
      h: HEADER + PAD + rowHeights.reduce((a, b) => a + b, 0) + GAP_Y * (rowHeights.length - 1),
    }
    sizes.set(id, size)
    return size
  }

  for (const root of roots) sizeOf(root)

  // Depth from the traffic sources, following only request-carrying edges.
  const out = new Map<string, string[]>()
  for (const edge of diagram.edges) {
    if (!isTrafficFlow(edge.flow)) continue
    out.set(edge.source, [...(out.get(edge.source) ?? []), edge.target])
  }

  const depth = new Map<string, number>()
  const seeds = diagram.nodes
    .filter((n) => ['client', 'attacker'].includes(getResource(n.defId)?.archetype ?? ''))
    .map((n) => n.id)
  for (const seed of (seeds.length > 0 ? seeds : roots.slice(0, 1))) depth.set(seed, 0)

  const queue = [...depth.keys()]
  let guard = 0
  while (queue.length && guard++ < 10000) {
    const current = queue.shift()!
    const next = (depth.get(current) ?? 0) + 1
    for (const target of out.get(current) ?? []) {
      if ((depth.get(target) ?? -1) >= next) continue
      depth.set(target, next)
      queue.push(target)
    }
  }

  let deepest = 0
  for (const d of depth.values()) deepest = Math.max(deepest, d)

  /** A container sits at the shallowest depth of anything inside it. */
  const columnOf = (id: string): number => {
    const own = depth.get(id)
    const inner = descendants(id, children).map((c) => depth.get(c)).filter((d): d is number => d !== undefined)
    if (inner.length > 0) return Math.min(...inner, own ?? Infinity)
    return own ?? deepest + 1
  }

  const byColumn = new Map<number, string[]>()
  for (const id of roots) {
    const column = columnOf(id)
    byColumn.set(column, [...(byColumn.get(column) ?? []), id])
  }

  let x = 0
  for (const column of [...byColumn.keys()].sort((a, b) => a - b)) {
    const ids = byColumn.get(column)!
    const columnSizes = ids.map((id) => sizes.get(id) ?? { w: NODE_W, h: NODE_H })
    const totalHeight = columnSizes.reduce((a, s) => a + s.h, 0) + ROW_GAP * (ids.length - 1)

    let y = -totalHeight / 2
    ids.forEach((id, i) => {
      positions.set(id, { x, y })
      y += columnSizes[i].h + ROW_GAP
    })
    x += Math.max(...columnSizes.map((s) => s.w)) + COLUMN_GAP
  }

  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => {
      const position = positions.get(node.id)
      const size = children.has(node.id) ? sizes.get(node.id) : undefined
      return {
        ...node,
        x: Math.round(position?.x ?? node.x),
        y: Math.round(position?.y ?? node.y),
        w: size ? Math.round(size.w) : node.w,
        h: size ? Math.round(size.h) : node.h,
      }
    }),
  }
}

function descendants(id: string, children: Map<string, string[]>): string[] {
  const out: string[] = []
  const stack = [...(children.get(id) ?? [])]
  while (stack.length) {
    const current = stack.pop()!
    out.push(current)
    stack.push(...(children.get(current) ?? []))
  }
  return out
}
