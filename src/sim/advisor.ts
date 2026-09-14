import type { PropBag, PropImpact, ResourceDef } from '@/catalog/schema/types'
import { dangerWarnings, getResource } from '@/catalog/registry'
import { buildTopology, type Topology } from './graph'
import type { SimGraph, SimNode } from './types'

export type Pillar = 'security' | 'reliability' | 'performance' | 'cost' | 'operations'
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'good'

export interface Finding {
  id: string
  pillar: Pillar
  severity: Severity
  title: string
  /** Why this matters, in the voice of someone who has been paged for it. */
  detail: string
  /** What to actually do about it. */
  fix: string
  nodeIds: string[]
  /** Codex topic to read next. */
  concept?: string
}

export const PILLAR_META: Record<Pillar, { label: string; blurb: string }> = {
  security: { label: 'Security', blurb: 'Protecting data, systems and identities' },
  reliability: { label: 'Reliability', blurb: 'Surviving failure without surprising users' },
  performance: { label: 'Performance', blurb: 'Using resources efficiently as demand changes' },
  cost: { label: 'Cost', blurb: 'Delivering the outcome at the lowest sensible price' },
  operations: { label: 'Operations', blurb: 'Running, observing and improving the system' },
}

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'good']

interface Ctx {
  graph: SimGraph
  topo: Topology
  nodes: { node: SimNode; def: ResourceDef; props: PropBag }[]
  byArchetype: Map<string, { node: SimNode; def: ResourceDef; props: PropBag }[]>
  /** True when B is reachable from A along traffic edges. */
  reaches: (a: string, b: string) => boolean
}

type Rule = (ctx: Ctx) => Finding[]

// ── Rules ───────────────────────────────────────────────────────────────────

/**
 * Property settings that dedicated rules below already explain better. Without
 * this, the same problem is reported twice with different wording.
 */
const COVERED_BY_DEDICATED_RULE = new Set(['replicas', 'backupRetention', 'versioning'])

const propDangers: Rule = (ctx) => {
  const out: Finding[] = []
  for (const { node, def, props } of ctx.nodes) {
    for (const w of dangerWarnings(def, props)) {
      if (COVERED_BY_DEDICATED_RULE.has(w.key)) continue
      const prop = (def.props ?? []).find((p) => p.key === w.key)
      out.push({
        id: `prop:${node.id}:${w.key}`,
        pillar: pillarFor(prop?.affects),
        severity: severityFor(prop?.affects),
        title: `${def.short}: ${headline(w.message)}`,
        detail: w.message,
        fix: prop?.impact ?? `Review the "${w.label}" setting on this ${def.short}.`,
        nodeIds: [node.id],
        concept: def.concepts?.[0],
      })
    }
  }
  return out
}

/** First sentence, trimmed to something that fits on one line. */
function headline(message: string): string {
  const sentence = message.split(/(?<=\.)\s/)[0] ?? message
  const trimmed = sentence.replace(/\.$/, '')
  return trimmed.length > 74 ? `${trimmed.slice(0, 71)}…` : trimmed
}

/**
 * The pillar comes from what the property says it affects, which every property
 * already declares. No second table to keep in sync.
 */
function pillarFor(affects: PropImpact[] | undefined): Pillar {
  const set = new Set(affects ?? [])
  if (set.has('security')) return 'security'
  if (set.has('availability') || set.has('durability')) return 'reliability'
  if (set.has('latency') || set.has('capacity') || set.has('scale')) return 'performance'
  if (set.has('cost')) return 'cost'
  return 'reliability'
}

function severityFor(affects: PropImpact[] | undefined): Severity {
  const set = new Set(affects ?? [])
  if (set.has('security')) return 'critical'
  if (set.has('availability') || set.has('durability')) return 'high'
  return 'medium'
}

const databaseExposure: Rule = (ctx) => {
  const out: Finding[] = []
  const internetIds = ctx.nodes.filter((n) => n.def.archetype === 'internet' || n.def.archetype === 'client').map((n) => n.node.id)
  for (const entry of ctx.nodes) {
    if (!['relational-db', 'nosql-db', 'cache', 'object-store'].includes(entry.def.archetype)) continue
    const parent = ctx.topo.parentOf.get(entry.node.id)
    const parentDef = parent ? ctx.topo.defs.get(parent) : undefined
    const inPublicSubnet = parentDef?.archetype === 'subnet' && parentDef && (ctx.nodes.find((n) => n.node.id === parent)?.props.tier === 'public')

    if (inPublicSubnet) {
      out.push({
        id: `db-public-subnet:${entry.node.id}`,
        pillar: 'security',
        severity: 'critical',
        title: `${entry.def.short} is in a public subnet`,
        detail:
          'A public subnet has a default route to an internet gateway, so anything in it can be given a public address and reached from outside. Data stores belong in a private or isolated subnet with no route to the internet at all.',
        fix: 'Move it into a private or isolated subnet and reach it only from the application tier.',
        nodeIds: [entry.node.id],
        concept: 'public-vs-private-subnet',
      })
    }

    const directlyExposed = internetIds.some((src) =>
      (ctx.topo.out.get(src) ?? []).some((e) => e.target === entry.node.id),
    )
    if (directlyExposed) {
      out.push({
        id: `db-direct:${entry.node.id}`,
        pillar: 'security',
        severity: 'critical',
        title: `${entry.def.short} is reachable directly from the internet`,
        detail:
          'There is a path from the public internet straight into a data store. Automated scanners find newly exposed databases within minutes, and unauthenticated data stores are drained routinely.',
        fix: 'Put an application tier in between, and remove any public endpoint on the data store.',
        nodeIds: [entry.node.id],
        concept: 'trust-boundary',
      })
    }
  }
  return out
}

const singlePointsOfFailure: Rule = (ctx) => {
  const out: Finding[] = []
  for (const { node, def, props } of ctx.nodes) {
    if (['client', 'attacker', 'internet'].includes(def.archetype)) continue
    const replicas = Number(props.replicas ?? props.nodeCount ?? props.minReplicas ?? 0)
    if (replicas === 1) {
      out.push({
        id: `spof:${node.id}`,
        pillar: 'reliability',
        severity: 'high',
        title: `${def.short} runs a single instance`,
        detail:
          'With one instance, every restart, patch, deploy and hardware fault is a full outage of this tier. Going from one to two is the single largest availability improvement available anywhere in an architecture — everything after that is headroom.',
        fix: 'Raise the instance count to at least two, spread across availability zones.',
        nodeIds: [node.id],
        concept: 'redundancy',
      })
    }
  }
  return out
}

const noLoadBalancerInFront: Rule = (ctx) => {
  const out: Finding[] = []
  for (const { node, def } of ctx.nodes) {
    if (!['vm', 'container-service', 'k8s-workload'].includes(def.archetype)) continue
    const upstream = ctx.topo.in.get(node.id) ?? []
    const frontedByLb = upstream.some((e) => {
      const d = ctx.topo.defs.get(e.source)
      return d && ['load-balancer-l7', 'load-balancer-l4', 'api-gateway', 'k8s-service', 'k8s-ingress', 'cdn'].includes(d.archetype)
    })
    const publicUpstream = upstream.some((e) => {
      const d = ctx.topo.defs.get(e.source)
      return d && ['internet', 'client'].includes(d.archetype)
    })
    if (publicUpstream && !frontedByLb) {
      out.push({
        id: `no-lb:${node.id}`,
        pillar: 'reliability',
        severity: 'high',
        title: `${def.short} takes public traffic with nothing in front of it`,
        detail:
          'Without a load balancer there are no health checks, no TLS termination, no stable address and no way to take an instance out of rotation. A deploy becomes an outage and a sick instance keeps receiving requests.',
        fix: 'Put a load balancer, ingress or API gateway in front and keep the compute private.',
        nodeIds: [node.id],
        concept: 'load-balancing',
      })
    }
  }
  return out
}

const missingWaf: Rule = (ctx) => {
  const entry = ctx.nodes.filter((n) => ['load-balancer-l7', 'api-gateway', 'k8s-ingress'].includes(n.def.archetype))
  if (entry.length === 0) return []
  const hasWaf = ctx.nodes.some((n) => n.def.archetype === 'waf' || n.props.wafEnabled === true || n.props.cloudArmor === true || n.props.wafMode === 'prevention')
  if (hasWaf) return []
  return [{
    id: 'no-waf',
    pillar: 'security',
    severity: 'medium',
    title: 'No web application firewall on the public entry point',
    detail:
      'Requests reach your application without any inspection. A WAF blocks the well-known injection and scripting payloads and, with a rate-based rule, stops one address from hammering your login endpoint — all before the request costs you any compute.',
    fix: 'Attach a WAF to the load balancer or CDN. Start it in count or preview mode and tune before enforcing.',
    nodeIds: entry.map((e) => e.node.id),
    concept: 'waf',
  }]
}

const noCdn: Rule = (ctx) => {
  const clients = ctx.byArchetype.get('client') ?? []
  const global = clients.some((c) => c.props.region === 'global' || c.props.region === 'continent')
  const hasCdn = ctx.nodes.some((n) => n.def.archetype === 'cdn' || n.props.cdn === true)
  if (!global || hasCdn) return []
  return [{
    id: 'no-cdn',
    pillar: 'performance',
    severity: 'medium',
    title: 'Distant users with no CDN',
    detail:
      'Your audience is far from your infrastructure. Distance is latency no amount of optimisation removes — light in fibre takes roughly 70ms to cross an ocean each way, before your code runs at all. A CDN terminates the connection near the user and serves cached responses without the round trip.',
    fix: 'Put a CDN in front, and cache aggressively with fingerprinted asset filenames.',
    nodeIds: clients.map((c) => c.node.id),
    concept: 'cdn',
  }]
}

const noObservability: Rule = (ctx) => {
  const hasMonitoring = ctx.nodes.some((n) => ['monitoring', 'logging', 'tracing', 'alerting'].includes(n.def.archetype))
  const workloads = ctx.nodes.filter((n) => ['vm', 'container-service', 'serverless-function', 'k8s-workload'].includes(n.def.archetype))
  if (hasMonitoring || workloads.length === 0) return []
  return [{
    id: 'no-observability',
    pillar: 'operations',
    severity: 'high',
    title: 'Nothing is collecting metrics or logs',
    detail:
      'When this breaks — and it will — you will have no idea what happened. Observability is not a nice-to-have you add later; it is the difference between a fifteen-minute incident and a three-hour one.',
    fix: 'Add a monitoring service, connect your workloads to it, and alarm on symptoms users can feel rather than on CPU.',
    nodeIds: workloads.map((w) => w.node.id),
    concept: 'observability',
  }]
}

const noBackups: Rule = (ctx) => {
  const out: Finding[] = []
  for (const { node, def, props } of ctx.nodes) {
    if (!['relational-db', 'nosql-db', 'object-store', 'block-storage'].includes(def.archetype)) continue
    const retention = Number(props.backupRetention ?? -1)
    const versioning = props.versioning === true || props.softDelete === true || props.pitr === true
    if (retention === 0 || (retention < 0 && !versioning && def.archetype !== 'cache')) {
      out.push({
        id: `no-backup:${node.id}`,
        pillar: 'reliability',
        severity: 'high',
        title: `${def.short} has no recovery point`,
        detail:
          'There is no way back from a bad migration, an accidental delete, or ransomware. Backups are not for hardware failure — the provider handles that — they are for the mistakes and the attacks.',
        fix: 'Enable backups, versioning or point-in-time recovery, and practise a restore so you know how long it takes.',
        nodeIds: [node.id],
        concept: 'rpo-rto',
      })
    }
  }
  return out
}

const singleNat: Rule = (ctx) => {
  const nats = ctx.byArchetype.get('nat') ?? []
  return nats
    .filter((n) => n.props.perAz === false)
    .map((n) => ({
      id: `single-nat:${n.node.id}`,
      pillar: 'reliability' as const,
      severity: 'medium' as const,
      title: 'A single NAT gateway serves every zone',
      detail:
        'A NAT gateway lives in one availability zone. If that zone fails, outbound internet stops for your entire private tier — package pulls, API calls, everything — even though your compute is spread across zones.',
      fix: 'Deploy one NAT gateway per availability zone and route each private subnet to its local one.',
      nodeIds: [n.node.id],
      concept: 'availability-zones',
    }))
}

const orphanNodes: Rule = (ctx) => {
  const out: Finding[] = []
  for (const { node, def } of ctx.nodes) {
    if (['attacker', 'client'].includes(def.archetype)) continue
    if (def.container) continue
    const degree = (ctx.topo.allIn.get(node.id)?.length ?? 0) + (ctx.topo.allOut.get(node.id)?.length ?? 0)
    if (degree === 0) {
      out.push({
        id: `orphan:${node.id}`,
        pillar: 'cost',
        severity: 'low',
        title: `${def.short} is connected to nothing`,
        detail: 'It is on the canvas and, in a real account, it would be on the bill. Unused resources are a surprisingly large share of most cloud spend.',
        fix: 'Connect it to the architecture, or remove it.',
        nodeIds: [node.id],
      })
    }
  }
  return out
}

const misplacedResources: Rule = (ctx) => {
  const out: Finding[] = []
  for (const { node, def } of ctx.nodes) {
    if (!def.wantsContainer?.length) continue
    const parent = ctx.topo.parentOf.get(node.id)
    const parentDef = parent ? ctx.topo.defs.get(parent) : undefined
    const ok = parentDef && def.wantsContainer.includes(parentDef.archetype)
    if (!ok) {
      out.push({
        id: `unplaced:${node.id}`,
        pillar: 'security',
        severity: 'low',
        title: `${def.short} is not inside a network`,
        detail:
          'In a real account every resource of this kind lives inside a network boundary that controls what can reach it. Placing it on the canvas without one means there is no segmentation to reason about.',
        fix: `Drop it inside a ${def.wantsContainer.map(labelFor).join(' or ')}.`,
        nodeIds: [node.id],
        concept: 'network-isolation',
      })
    }
  }
  return out
}

function labelFor(archetype: string): string {
  return archetype.replace(/-/g, ' ')
}

const goodPractices: Rule = (ctx) => {
  const out: Finding[] = []
  const praise = (id: string, title: string, detail: string, nodeIds: string[]) =>
    out.push({ id, pillar: 'security', severity: 'good', title, detail, fix: '', nodeIds })

  const netpol = ctx.byArchetype.get('firewall')?.filter((n) => n.props.defaultDeny === true) ?? []
  if (netpol.length) {
    praise('good:netpol', 'Default-deny network policy in place',
      'Traffic is denied unless a rule allows it. This is the control that turns one compromised workload into a contained incident rather than a cluster-wide one.',
      netpol.map((n) => n.node.id))
  }

  const cdns = ctx.byArchetype.get('cdn') ?? []
  if (cdns.length) {
    praise('good:cdn', 'Traffic served through a CDN',
      'Users are served close to where they are, and volumetric attacks land on the edge network rather than on your origin.',
      cdns.map((n) => n.node.id))
  }

  const multiAz = ctx.nodes.filter((n) => n.props.multiAz === true || n.props.highAvailability === true || n.props.zoneRedundant === true)
  if (multiAz.length) {
    praise('good:multi-az', 'Zone-redundant components',
      'Losing an entire datacentre is an incident these components survive, rather than an outage they cause.',
      multiAz.map((n) => n.node.id))
  }

  return out
}

const RULES: Rule[] = [
  propDangers, databaseExposure, singlePointsOfFailure, noLoadBalancerInFront,
  missingWaf, noCdn, noObservability, noBackups, singleNat, orphanNodes,
  misplacedResources, goodPractices,
]

// ── Entry point ─────────────────────────────────────────────────────────────

export function review(graph: SimGraph): Finding[] {
  const topo = buildTopology(graph)
  const nodes = graph.nodes
    .filter((n) => !n.disabled)
    .map((node) => ({ node, def: getResource(node.defId)!, props: node.props }))
    .filter((n) => Boolean(n.def))

  const byArchetype = new Map<string, typeof nodes>()
  for (const n of nodes) {
    const list = byArchetype.get(n.def.archetype) ?? []
    list.push(n)
    byArchetype.set(n.def.archetype, list)
  }

  const reachCache = new Map<string, Set<string>>()
  const reaches = (a: string, b: string) => {
    let set = reachCache.get(a)
    if (!set) {
      set = new Set<string>()
      const stack = [a]
      while (stack.length) {
        const cur = stack.pop()!
        for (const e of topo.out.get(cur) ?? []) {
          if (set.has(e.target)) continue
          set.add(e.target)
          stack.push(e.target)
        }
      }
      reachCache.set(a, set)
    }
    return set.has(b)
  }

  const ctx: Ctx = { graph, topo, nodes, byArchetype, reaches }
  const findings = RULES.flatMap((rule) => rule(ctx))

  const seen = new Set<string>()
  return findings
    .filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)))
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
}

/** 0–100 architecture score, weighted by severity. */
export function scoreFindings(findings: Finding[]): { score: number; byPillar: Record<Pillar, number> } {
  const weights: Record<Severity, number> = { critical: 22, high: 12, medium: 6, low: 2, good: 0 }
  const byPillar = { security: 100, reliability: 100, performance: 100, cost: 100, operations: 100 } as Record<Pillar, number>

  for (const f of findings) {
    if (f.severity === 'good') continue
    byPillar[f.pillar] = Math.max(0, byPillar[f.pillar] - weights[f.severity])
  }

  const values = Object.values(byPillar)
  const score = Math.round(values.reduce((a, b) => a + b, 0) / values.length)
  return { score, byPillar }
}
