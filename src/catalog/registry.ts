import type {
  Archetype, Category, Port, ProviderId, PropBag, PropDef, ResourceDef,
} from './schema/types'
import { coreResources } from './providers/core'
import { awsNetwork } from './providers/aws/network'
import { awsCompute } from './providers/aws/compute'
import { awsEdge } from './providers/aws/edge'
import { awsData } from './providers/aws/data'
import { awsPlatform } from './providers/aws/platform'
import { kubernetesResources } from './providers/kubernetes'
import { azureResources } from './providers/azure'
import { gcpResources } from './providers/gcp'

export const ALL_RESOURCES: ResourceDef[] = [
  ...coreResources,
  ...awsNetwork,
  ...awsCompute,
  ...awsEdge,
  ...awsData,
  ...awsPlatform,
  ...kubernetesResources,
  ...azureResources,
  ...gcpResources,
]

// ── Indices ─────────────────────────────────────────────────────────────────

const byId = new Map<string, ResourceDef>()
for (const r of ALL_RESOURCES) byId.set(r.id, r)

export function getResource(id: string): ResourceDef | undefined {
  return byId.get(id)
}

/** Throws in development when a saved diagram references an unknown resource. */
export function requireResource(id: string): ResourceDef {
  const r = byId.get(id)
  if (!r) throw new Error(`Unknown resource definition: ${id}`)
  return r
}

export const RESOURCES_BY_PROVIDER = groupBy(ALL_RESOURCES, (r) => r.provider)
export const RESOURCES_BY_CATEGORY = groupBy(ALL_RESOURCES, (r) => r.category)
export const RESOURCES_BY_ARCHETYPE = groupBy(ALL_RESOURCES, (r) => r.archetype)

function groupBy<K extends string, T>(items: T[], key: (item: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>
  for (const item of items) {
    const k = key(item)
    ;(out[k] ??= []).push(item)
  }
  return out
}

// ── Cross-provider equivalents ("Rosetta Stone") ────────────────────────────

/**
 * Resources in other providers that play the same role. Derived from the
 * archetype so it stays correct automatically as the catalog grows.
 */
export function equivalentsOf(def: ResourceDef): ResourceDef[] {
  return (RESOURCES_BY_ARCHETYPE[def.archetype] ?? []).filter(
    (r) => r.id !== def.id && r.provider !== 'core',
  )
}

// ── Port helpers ────────────────────────────────────────────────────────────

export function getPort(def: ResourceDef, portId: string): Port | undefined {
  return def.ports.find((p) => p.id === portId)
}

export function inputPorts(def: ResourceDef): Port[] {
  return def.ports.filter((p) => p.side === 'in')
}

export function outputPorts(def: ResourceDef): Port[] {
  return def.ports.filter((p) => p.side === 'out')
}

// ── Property helpers ────────────────────────────────────────────────────────

export function defaultProps(def: ResourceDef): PropBag {
  const bag: PropBag = {}
  for (const p of def.props ?? []) bag[p.key] = p.default
  return bag
}

export function visibleProps(def: ResourceDef, props: PropBag): PropDef[] {
  return (def.props ?? []).filter((p) => !p.visibleWhen || p.visibleWhen(props))
}

/** All active danger warnings for a configured resource. */
export function dangerWarnings(def: ResourceDef, props: PropBag): { key: string; label: string; message: string }[] {
  const out: { key: string; label: string; message: string }[] = []
  for (const p of def.props ?? []) {
    if (!p.danger) continue
    if (p.visibleWhen && !p.visibleWhen(props)) continue
    const message = p.danger(props[p.key], props)
    if (message) out.push({ key: p.key, label: p.label, message })
  }
  return out
}

/** Reads a numeric hint out of a select option's `meta`, e.g. rps or hourly. */
export function optionMeta(def: ResourceDef, propKey: string, value: unknown, metaKey: string): number | undefined {
  const prop = (def.props ?? []).find((p) => p.key === propKey)
  const opt = prop?.options?.find((o) => o.value === value)
  const raw = opt?.meta?.[metaKey]
  return typeof raw === 'number' ? raw : undefined
}

// ── Search ──────────────────────────────────────────────────────────────────

export interface SearchHit {
  def: ResourceDef
  score: number
}

export function searchResources(query: string, limit = 40): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return ALL_RESOURCES.filter((r) => !r.hidden).slice(0, limit).map((def) => ({ def, score: 0 }))

  const hits: SearchHit[] = []
  for (const def of ALL_RESOURCES) {
    if (def.hidden) continue
    let score = 0
    const short = def.short.toLowerCase()
    const name = def.name.toLowerCase()
    if (short === q) score += 100
    else if (short.startsWith(q)) score += 60
    else if (short.includes(q)) score += 30
    if (name.includes(q)) score += 25
    if (def.tagline.toLowerCase().includes(q)) score += 10
    for (const k of def.keywords ?? []) {
      if (k === q) score += 50
      else if (k.startsWith(q)) score += 20
      else if (k.includes(q)) score += 8
    }
    if (def.archetype.includes(q)) score += 15
    if (def.category.includes(q)) score += 10
    if (score > 0) hits.push({ def, score })
  }
  return hits.sort((a, b) => b.score - a.score || a.def.short.localeCompare(b.def.short)).slice(0, limit)
}

// ── Development-time validation ─────────────────────────────────────────────

/** Id namespace per provider. `kubernetes` uses the shorter, conventional `k8s`. */
const ID_PREFIX: Record<ProviderId, string> = {
  aws: 'aws', azure: 'azure', gcp: 'gcp', kubernetes: 'k8s', core: 'core',
}

export interface CatalogIssue {
  resourceId: string
  message: string
}

/**
 * Structural checks that would otherwise fail silently at runtime. Run by the
 * test suite and, in development, on module load.
 */
export function validateCatalog(): CatalogIssue[] {
  const issues: CatalogIssue[] = []
  const seen = new Set<string>()

  for (const def of ALL_RESOURCES) {
    if (seen.has(def.id)) issues.push({ resourceId: def.id, message: 'duplicate resource id' })
    seen.add(def.id)

    const prefix = ID_PREFIX[def.provider]
    if (!def.id.startsWith(`${prefix}.`)) {
      issues.push({ resourceId: def.id, message: `id must start with "${prefix}."` })
    }

    const portIds = new Set<string>()
    for (const port of def.ports) {
      if (portIds.has(port.id)) issues.push({ resourceId: def.id, message: `duplicate port id "${port.id}"` })
      portIds.add(port.id)
      if (port.flows.length === 0) issues.push({ resourceId: def.id, message: `port "${port.id}" carries no flows` })
    }

    const propKeys = new Set<string>()
    for (const prop of def.props ?? []) {
      if (propKeys.has(prop.key)) issues.push({ resourceId: def.id, message: `duplicate prop key "${prop.key}"` })
      propKeys.add(prop.key)

      if (prop.type === 'select') {
        if (!prop.options?.length) {
          issues.push({ resourceId: def.id, message: `select prop "${prop.key}" has no options` })
        } else if (!prop.options.some((o) => o.value === prop.default)) {
          issues.push({ resourceId: def.id, message: `select prop "${prop.key}" default "${String(prop.default)}" is not an option` })
        }
      }

      if (prop.type === 'multiselect') {
        if (!Array.isArray(prop.default)) {
          issues.push({ resourceId: def.id, message: `multiselect prop "${prop.key}" default must be an array` })
        }
      }

      if (prop.type === 'number' && typeof prop.default !== 'number') {
        issues.push({ resourceId: def.id, message: `number prop "${prop.key}" default must be a number` })
      }

      if (prop.type === 'boolean' && typeof prop.default !== 'boolean') {
        issues.push({ resourceId: def.id, message: `boolean prop "${prop.key}" default must be a boolean` })
      }
    }

    // Cost functions must survive the default configuration.
    if (def.cost) {
      const bag = defaultProps(def)
      for (const [name, fn] of Object.entries(def.cost)) {
        if (typeof fn !== 'function') continue
        try {
          const v = (fn as (p: PropBag) => number)(bag)
          if (!Number.isFinite(v)) issues.push({ resourceId: def.id, message: `cost.${name} returned a non-finite value` })
        } catch (err) {
          issues.push({ resourceId: def.id, message: `cost.${name} threw: ${String(err)}` })
        }
      }
    }
  }

  return issues
}

// ── Display metadata ────────────────────────────────────────────────────────

export const PROVIDER_META: Record<ProviderId, { label: string; short: string; color: string }> = {
  aws: { label: 'Amazon Web Services', short: 'AWS', color: 'var(--color-aws)' },
  azure: { label: 'Microsoft Azure', short: 'Azure', color: 'var(--color-azure)' },
  gcp: { label: 'Google Cloud', short: 'GCP', color: 'var(--color-gcp)' },
  kubernetes: { label: 'Kubernetes', short: 'K8s', color: 'var(--color-k8s)' },
  core: { label: 'Universal', short: 'Core', color: 'var(--color-core)' },
}

export const CATEGORY_META: Record<Category, { label: string; blurb: string }> = {
  traffic: { label: 'Traffic & Actors', blurb: 'Where requests — and attacks — come from' },
  edge: { label: 'Edge & Delivery', blurb: 'DNS, CDN, load balancing, API front doors' },
  compute: { label: 'Compute', blurb: 'Machines, containers and functions that run your code' },
  kubernetes: { label: 'Kubernetes', blurb: 'Clusters, workloads and the objects around them' },
  database: { label: 'Databases', blurb: 'Relational, key-value and in-memory stores' },
  storage: { label: 'Storage', blurb: 'Objects, volumes and file shares' },
  messaging: { label: 'Messaging', blurb: 'Queues and streams that decouple services' },
  network: { label: 'Networking', blurb: 'Networks, subnets, gateways and private links' },
  security: { label: 'Security & Identity', blurb: 'Firewalls, WAFs, roles, secrets and keys' },
  operations: { label: 'Operations', blurb: 'Monitoring, registries and delivery pipelines' },
}

export const ARCHETYPE_LABEL: Partial<Record<Archetype, string>> = {
  'load-balancer-l7': 'Layer 7 load balancer',
  'load-balancer-l4': 'Layer 4 load balancer',
  'relational-db': 'Relational database',
  'nosql-db': 'NoSQL database',
  'object-store': 'Object storage',
  'block-storage': 'Block storage',
  'file-storage': 'File storage',
  'serverless-function': 'Serverless function',
  'container-service': 'Container service',
  'k8s-cluster': 'Kubernetes cluster',
  'k8s-nodepool': 'Kubernetes node pool',
  'k8s-workload': 'Kubernetes workload',
  'k8s-service': 'Kubernetes Service',
  'k8s-ingress': 'Kubernetes Ingress',
  'k8s-config': 'Kubernetes configuration',
  'internet-gateway': 'Internet gateway',
  'private-link': 'Private endpoint',
  'ddos-shield': 'DDoS protection',
  'api-gateway': 'API gateway',
  'dns-zone': 'DNS zone',
  'data-warehouse': 'Data warehouse',
  'vm-scale-set': 'VM scale set',
  'availability-zone': 'Availability zone',
  'service-mesh': 'Service mesh',
}

export function archetypeLabel(a: Archetype): string {
  return ARCHETYPE_LABEL[a] ?? a.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}
