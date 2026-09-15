import { defaultProps, getPort, getResource } from './registry'
import { pickPrimaryFlow, validateConnection } from './schema/rules'
import type { Flow, PropBag, ResourceDef } from './schema/types'
import { autoLayout } from '@/canvas/layout'
import type { SavedDiagram } from '@/store/types'

/**
 * Building a diagram from a description rather than from a canvas.
 *
 * Used by the MCP server so a model can author architectures without knowing
 * port ids or pixel coordinates: ports are resolved from the catalog's own
 * rules, and the layout is computed from the dependency graph.
 */

export interface AuthoredNode {
  id: string
  /** Catalog resource id, e.g. `aws.rds`. */
  type: string
  label?: string
  props?: PropBag
  /** Id of a container node this one sits inside. */
  in?: string
  x?: number
  y?: number
}

export interface AuthoredEdge {
  from: string
  to: string
  /** Optional; resolved from the catalog when omitted. */
  fromPort?: string
  toPort?: string
}

export interface AuthorSpec {
  name: string
  nodes: AuthoredNode[]
  edges?: AuthoredEdge[]
  /** Arrange automatically. Defaults to true when no coordinates are given. */
  layout?: boolean
}

export type AuthorResult =
  | { ok: true; diagram: SavedDiagram; warnings: string[] }
  | { ok: false; errors: string[] }

export interface PortSuggestion {
  fromPort: string
  toPort: string
  flow: Flow
  description: string
}

/** Every legal way two resources can be connected, best first. */
export function suggestPorts(sourceDefId: string, targetDefId: string): PortSuggestion[] {
  const source = getResource(sourceDefId)
  const target = getResource(targetDefId)
  if (!source || !target) return []

  const out: PortSuggestion[] = []
  for (const sourcePort of source.ports.filter((p) => p.side === 'out')) {
    for (const targetPort of target.ports.filter((p) => p.side === 'in')) {
      const verdict = validateConnection({ source, sourcePort, target, targetPort })
      if (!verdict.ok) continue
      out.push({
        fromPort: sourcePort.id,
        toPort: targetPort.id,
        flow: verdict.primary,
        description: `${source.short} "${sourcePort.label}" → ${target.short} "${targetPort.label}" carrying ${verdict.primary}`,
      })
    }
  }

  // Request traffic first: it is nearly always what the author meant.
  const priority = (s: PortSuggestion) => (['http', 'grpc', 'sql', 'nosql', 'cache', 'queue', 'stream', 'object'].includes(s.flow) ? 0 : 1)
  return out.sort((a, b) => priority(a) - priority(b))
}

/** Why a connection was refused, phrased for whoever tried to make it. */
export function explainConnection(sourceDefId: string, sourcePortId: string, targetDefId: string, targetPortId: string): string {
  const source = getResource(sourceDefId)
  const target = getResource(targetDefId)
  if (!source) return `Unknown resource: ${sourceDefId}`
  if (!target) return `Unknown resource: ${targetDefId}`
  const sourcePort = getPort(source, sourcePortId)
  const targetPort = getPort(target, targetPortId)
  if (!sourcePort) return `${source.short} has no port "${sourcePortId}". Its ports are: ${portList(source)}`
  if (!targetPort) return `${target.short} has no port "${targetPortId}". Its ports are: ${portList(target)}`

  const verdict = validateConnection({ source, sourcePort, target, targetPort })
  if (verdict.ok) return `Valid, carrying ${verdict.primary}.`
  return `${verdict.reason} ${verdict.teach}${verdict.hint ? ` Hint: ${verdict.hint}` : ''}`
}

function portList(def: ResourceDef): string {
  return def.ports.map((p) => `${p.id} (${p.side}, ${p.flows.join('/')})`).join('; ')
}

export function buildDiagram(spec: AuthorSpec): AuthorResult {
  const errors: string[] = []
  const warnings: string[] = []

  const seen = new Set<string>()
  for (const node of spec.nodes) {
    if (seen.has(node.id)) errors.push(`Duplicate node id "${node.id}".`)
    seen.add(node.id)
    if (!getResource(node.type)) {
      errors.push(`Unknown resource type "${node.type}" on node "${node.id}". Call list_resources to see what exists.`)
    }
  }
  for (const node of spec.nodes) {
    if (node.in && !seen.has(node.in)) errors.push(`Node "${node.id}" says it is inside "${node.in}", which does not exist.`)
    if (node.in) {
      const parent = spec.nodes.find((n) => n.id === node.in)
      const parentDef = parent ? getResource(parent.type) : undefined
      if (parentDef && !parentDef.container) {
        errors.push(`"${node.in}" is a ${parentDef.short}, which cannot contain other resources.`)
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors }

  const defOf = new Map(spec.nodes.map((n) => [n.id, getResource(n.type)!]))

  const edges: SavedDiagram['edges'] = []
  spec.edges?.forEach((edge, index) => {
    const source = defOf.get(edge.from)
    const target = defOf.get(edge.to)
    if (!source) return errors.push(`Edge ${index + 1}: no node "${edge.from}".`)
    if (!target) return errors.push(`Edge ${index + 1}: no node "${edge.to}".`)

    let fromPort = edge.fromPort
    let toPort = edge.toPort

    if (!fromPort || !toPort) {
      const suggestions = suggestPorts(source.id, target.id)
      if (suggestions.length === 0) {
        errors.push(
          `Edge ${index + 1} (${edge.from} → ${edge.to}): ${explainConnection(source.id, source.ports.find((p) => p.side === 'out')?.id ?? '', target.id, target.ports.find((p) => p.side === 'in')?.id ?? '')}`,
        )
        return
      }
      fromPort = fromPort ?? suggestions[0].fromPort
      toPort = toPort ?? suggestions[0].toPort
    }

    const sourcePort = getPort(source, fromPort)
    const targetPort = getPort(target, toPort)
    if (!sourcePort || !targetPort) {
      errors.push(`Edge ${index + 1}: ${explainConnection(source.id, fromPort, target.id, toPort)}`)
      return
    }

    const verdict = validateConnection({ source, sourcePort, target, targetPort })
    if (!verdict.ok) {
      errors.push(`Edge ${index + 1} (${edge.from} → ${edge.to}): ${verdict.reason} ${verdict.teach}`)
      return
    }

    edges.push({
      id: `e${index + 1}`,
      source: edge.from,
      target: edge.to,
      sourceHandle: fromPort,
      targetHandle: toPort,
      flow: pickPrimaryFlow(verdict.flows),
      flows: verdict.flows,
    })
  })

  if (errors.length > 0) return { ok: false, errors }

  for (const node of spec.nodes) {
    const def = defOf.get(node.id)!
    for (const key of Object.keys(node.props ?? {})) {
      if (!(def.props ?? []).some((p) => p.key === key)) {
        warnings.push(`${def.short} ("${node.id}") has no property "${key}" — it was kept but will be ignored.`)
      }
    }
    if (def.wantsContainer?.length && !node.in) {
      warnings.push(`${def.short} ("${node.id}") is usually placed inside a ${def.wantsContainer.join(' or ')}.`)
    }
  }

  const positioned = spec.nodes.some((n) => n.x !== undefined || n.y !== undefined)
  const diagram: SavedDiagram = {
    version: 1,
    name: spec.name,
    nodes: spec.nodes.map((node) => {
      const def = defOf.get(node.id)!
      return {
        id: node.id,
        defId: node.type,
        label: node.label ?? def.short,
        props: { ...defaultProps(def), ...node.props },
        x: node.x ?? 0,
        y: node.y ?? 0,
        w: def.container?.size?.width,
        h: def.container?.size?.height,
        parentId: node.in,
      }
    }),
    edges,
  }

  const shouldLayout = spec.layout ?? !positioned
  return { ok: true, diagram: shouldLayout ? autoLayout(diagram) : diagram, warnings }
}
