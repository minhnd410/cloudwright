import { diagram } from '@/scenarios/builder'
import { TEMPLATES } from '@/scenarios/templates'
import { ALL_RESOURCES, requireResource } from '@/catalog/registry'
import { validateConnection } from '@/catalog/schema/rules'
import type { ResourceDef } from '@/catalog/schema/types'
import { autoLayout } from '@/canvas/layout'
import type { SavedDiagram } from '@/store/types'
import { CONCEPTS } from './concepts'

/**
 * A runnable illustration for a codex entry.
 *
 * Variants are the point: the same idea shown twice, with and without the thing
 * the entry is about, so the difference is something you watch rather than
 * something you are told.
 */
export interface DemoVariant {
  id: string
  label: string
  note: string
  build: () => SavedDiagram
  /** Faults to inject as soon as the variant loads. */
  incidents?: { nodeId: string; modeId: string }[]
}

export interface Demo {
  caption: string
  /** Start the simulation immediately. */
  autoplay?: boolean
  variants: DemoVariant[]
}

// ── Scene builders ──────────────────────────────────────────────────────────

const stack = (name: string, opts: {
  users?: Record<string, string | number | boolean>
  app?: Record<string, string | number | boolean>
  db?: Record<string, string | number | boolean>
  cache?: boolean
  cdn?: boolean
  waf?: Record<string, string | number | boolean>
  attacker?: Record<string, string | number | boolean>
  monitoring?: boolean
} = {}) => (): SavedDiagram => {
  const nodes: Parameters<typeof diagram>[1] = [
    { id: 'users', def: 'core.client', at: [-420, 140], props: { rps: 800, ...opts.users } },
    { id: 'net', def: 'core.internet', at: [-210, 140] },
  ]
  const edges: Parameters<typeof diagram>[2] = [['users', 'out', 'net', 'in']]

  let previous = 'net'
  let x = 20

  if (opts.cdn) {
    nodes.push({ id: 'cdn', def: 'aws.cloudfront', at: [x, 140] })
    edges.push([previous, 'out', 'cdn', 'in'])
    previous = 'cdn'
    x += 250
  }
  if (opts.waf) {
    nodes.push({ id: 'waf', def: 'aws.waf', at: [x, 140], props: opts.waf })
    edges.push([previous, previous === 'cdn' ? 'origin' : 'out', 'waf', 'in'])
    previous = 'waf'
    x += 250
  }

  nodes.push({ id: 'alb', def: 'aws.alb', at: [x, 140] })
  edges.push([previous, previous === 'cdn' ? 'origin' : 'out', 'alb', 'in'])
  x += 250

  nodes.push({ id: 'app', def: 'aws.ec2', at: [x, 140], props: { size: 'm5.large', replicas: 3, ...opts.app } })
  edges.push(['alb', 'out', 'app', 'in'])
  x += 250

  nodes.push({ id: 'db', def: 'aws.rds', at: [x, 50], props: { multiAz: true, backupRetention: 7, ...opts.db } })
  edges.push(['app', 'out', 'db', 'in'])

  if (opts.cache) {
    nodes.push({ id: 'cache', def: 'aws.elasticache', at: [x, 260] })
    edges.push(['app', 'out', 'cache', 'in'])
  }
  if (opts.monitoring) {
    nodes.push({ id: 'mon', def: 'aws.cloudwatch', at: [x - 250, 340], props: { alarmStrategy: 'symptom' } })
    edges.push(['app', 'telemetry', 'mon', 'in'])
  }
  if (opts.attacker) {
    nodes.push({ id: 'bad', def: 'core.attacker', at: [-420, 380], props: opts.attacker })
    edges.push(['bad', 'out', opts.cdn ? 'cdn' : opts.waf ? 'waf' : 'alb', 'in'])
  }

  return diagram(name, nodes, edges)
}

const k8sScene = (name: string, workload: Record<string, string | number | boolean>, extras: { netpol?: boolean } = {}) => (): SavedDiagram => {
  const nodes: Parameters<typeof diagram>[1] = [
    { id: 'users', def: 'core.client', at: [-400, 190], props: { rps: 700 } },
    { id: 'net', def: 'core.internet', at: [-190, 190] },
    { id: 'cluster', def: 'k8s.cluster', at: [40, -30], size: [820, 520], props: { rbac: 'scoped' } },
    { id: 'ingress', def: 'k8s.ingress', at: [40, 180], in: 'cluster' },
    { id: 'svc', def: 'k8s.service', at: [240, 180], in: 'cluster' },
    { id: 'pool', def: 'k8s.nodepool', at: [430, 80], size: [340, 280], in: 'cluster', props: { nodeCount: 3, spreadZones: true } },
    { id: 'web', def: 'k8s.deployment', at: [30, 40], in: 'pool', props: workload },
    { id: 'db', def: 'aws.rds', at: [920, 200], props: { multiAz: true, backupRetention: 7 } },
  ]
  const edges: Parameters<typeof diagram>[2] = [
    ['users', 'out', 'net', 'in'],
    ['net', 'out', 'ingress', 'in'],
    ['ingress', 'out', 'svc', 'in'],
    ['svc', 'out', 'web', 'in'],
    ['web', 'out', 'db', 'in'],
  ]
  if (extras.netpol) {
    nodes.push({ id: 'netpol', def: 'k8s.networkpolicy', at: [430, 400], in: 'cluster', props: { defaultDeny: true, egressControl: true } })
    edges.push(['netpol', 'out', 'web', 'in'])
  }
  return diagram(name, nodes, edges)
}

/**
 * One shared stack against several independent ones. The fault is identical in
 * both variants; what changes is how much of the platform it reaches.
 */
const cellScene = (name: string, cells: number) => (): SavedDiagram => {
  const nodes: Parameters<typeof diagram>[1] = [
    { id: 'users', def: 'core.client', at: [-420, 220], props: { rps: 1200, region: 'global' } },
    { id: 'net', def: 'core.internet', at: [-210, 220] },
    { id: 'edge', def: 'aws.cloudfront', at: [10, 220] },
  ]
  const edges: Parameters<typeof diagram>[2] = [
    ['users', 'out', 'net', 'in'],
    ['net', 'out', 'edge', 'in'],
  ]
  for (let i = 0; i < cells; i++) {
    const y = 40 + i * 220
    const lb = `alb${i}`, app = `app${i}`, db = `db${i}`
    nodes.push(
      { id: lb, def: 'aws.alb', at: [260, y], label: cells > 1 ? `Cell ${i + 1} · ALB` : 'ALB' },
      { id: app, def: 'aws.ec2', at: [520, y], props: { size: 'm5.xlarge', replicas: Math.ceil(12 / cells) }, label: cells > 1 ? `Cell ${i + 1} · App` : 'App' },
      { id: db, def: 'aws.rds', at: [790, y], props: { multiAz: true, backupRetention: 7, size: 'db.m5.xlarge' }, label: cells > 1 ? `Cell ${i + 1} · Database` : 'Database' },
    )
    edges.push(['edge', 'origin', lb, 'in'], [lb, 'out', app, 'in'], [app, 'out', db, 'in'])
  }
  return diagram(name, nodes, edges)
}

// ── Explicit demos ──────────────────────────────────────────────────────────

const DEMOS: Record<string, Demo> = {
  'cell-based-architecture': {
    caption: 'The same database fault, once against a shared stack and once against three cells. Watch how much of the platform it takes with it.',
    autoplay: true,
    variants: [
      {
        id: 'shared',
        label: 'One shared stack',
        note: 'Every customer is served by the same database, so its lock contention is everyone\'s.',
        build: cellScene('One shared stack', 1),
        incidents: [{ nodeId: 'db0', modeId: 'long-lock' }],
      },
      {
        id: 'cells',
        label: 'Three cells',
        note: 'Each cell has its own database and shares nothing behind the router. The fault is contained to a third of the customers.',
        build: cellScene('Three cells', 3),
        incidents: [{ nodeId: 'db0', modeId: 'long-lock' }],
      },
    ],
  },
  caching: {
    caption: 'Watch the database demand figure. The cache absorbs most reads before they ever arrive.',
    autoplay: true,
    variants: [
      { id: 'without', label: 'No cache', note: 'Every read reaches the database.', build: stack('Reads without a cache', { users: { rps: 2000 } }) },
      { id: 'with', label: 'With a cache', note: 'A cache in front removes roughly 85% of reads.', build: stack('Reads with a cache', { users: { rps: 2000 }, cache: true }) },
    ],
  },
  cdn: {
    caption: 'The origin tier is the same in both. Only the edge changes — and so does everything downstream of it.',
    autoplay: true,
    variants: [
      { id: 'origin', label: 'Straight to the origin', note: 'Every request travels to your region and back.', build: stack('Origin only', { users: { rps: 3000, region: 'global' } }) },
      { id: 'cdn', label: 'Behind a CDN', note: 'Cache hits are served at the edge; the origin sees a fraction.', build: stack('Behind a CDN', { users: { rps: 3000, region: 'global' }, cdn: true }) },
    ],
  },
  'ddos-mitigation': {
    caption: 'The same flood, twice. The edge decides whether it is an incident or a statistic.',
    autoplay: true,
    variants: [
      { id: 'open', label: 'Undefended', note: 'The flood lands directly on the load balancer.', build: stack('Undefended', { attacker: { vector: 'volumetric-ddos', intensity: 8 } }) },
      { id: 'edge', label: 'CDN and WAF', note: 'Absorbed at the edge; a rate limit handles what gets through.', build: stack('Defended at the edge', { cdn: true, waf: { mode: 'block', rateLimit: 2000 }, attacker: { vector: 'volumetric-ddos', intensity: 8 } }) },
    ],
  },
  waf: {
    caption: 'Open the Security tab after running this. It shows exactly which vector reached what.',
    autoplay: true,
    variants: [
      { id: 'none', label: 'No WAF', note: 'The injection attempt reaches the database.', build: stack('No WAF', { attacker: { vector: 'sql-injection', intensity: 7 } }) },
      { id: 'count', label: 'WAF in count mode', note: 'It observes and reports, but lets the request through.', build: stack('WAF observing', { waf: { mode: 'count', rateLimit: 2000 }, attacker: { vector: 'sql-injection', intensity: 7 } }) },
      { id: 'block', label: 'WAF blocking', note: 'Now it is stopped before it reaches your code.', build: stack('WAF blocking', { waf: { mode: 'block', rateLimit: 2000 }, attacker: { vector: 'sql-injection', intensity: 7 } }) },
    ],
  },
  'sql-injection': {
    caption: 'A WAF buys you time. Parameterised queries are the fix — the game models the layer, not the code.',
    autoplay: true,
    variants: [
      { id: 'exposed', label: 'Nothing in the way', note: 'The payload reaches the database.', build: stack('Exposed', { attacker: { vector: 'sql-injection', intensity: 7 } }) },
      { id: 'waf', label: 'WAF blocking', note: 'Caught at the edge.', build: stack('WAF blocking', { waf: { mode: 'block', rateLimit: 2000 }, attacker: { vector: 'sql-injection', intensity: 7 } }) },
    ],
  },
  probes: {
    caption: 'Both run the same workload. Only the liveness probe differs — and it decides whether a database blip is a wobble or an outage.',
    autoplay: true,
    variants: [
      {
        id: 'deep',
        label: 'Liveness checks the database',
        note: 'One dependency blip restarts every replica at once.',
        build: k8sScene('Deep liveness probe', { replicas: 3, livenessProbe: 'deep', readinessProbe: true, memLimit: 1024, antiAffinity: true }),
        incidents: [{ nodeId: 'web', modeId: 'crashloop' }],
      },
      {
        id: 'shallow',
        label: 'Liveness stays shallow',
        note: 'Readiness takes Pods out of rotation; nothing restarts.',
        build: k8sScene('Shallow liveness probe', { replicas: 3, livenessProbe: 'http', readinessProbe: true, memLimit: 1024, antiAffinity: true }),
      },
    ],
  },
  'resource-requests-limits': {
    caption: 'Memory limits are a hard ceiling. Watch the replica count when the limit is too tight.',
    autoplay: true,
    variants: [
      {
        id: 'tight',
        label: 'Memory limit too low',
        note: 'The container is OOM-killed and restarts in a loop.',
        build: k8sScene('Tight memory limit', { replicas: 3, memLimit: 256, memRequest: 256, cpuRequest: 250, livenessProbe: 'http', readinessProbe: true }),
        incidents: [{ nodeId: 'web', modeId: 'oomkill' }],
      },
      {
        id: 'sized',
        label: 'Sized for the workload',
        note: 'Same workload, room to run.',
        build: k8sScene('Correctly sized', { replicas: 3, memLimit: 1024, memRequest: 512, cpuRequest: 250, livenessProbe: 'http', readinessProbe: true }),
      },
    ],
  },
  redundancy: {
    caption: 'One instance versus four. Inject the host failure on each and compare what the users see.',
    variants: [
      {
        id: 'single',
        label: 'One instance',
        note: 'A host failure is a complete outage.',
        build: stack('Single instance', { app: { replicas: 1 } }),
        incidents: [{ nodeId: 'app', modeId: 'host-failure' }],
      },
      {
        id: 'redundant',
        label: 'Four instances',
        note: 'The same failure costs a quarter of the capacity.',
        build: stack('Four instances', { app: { replicas: 4 } }),
        incidents: [{ nodeId: 'app', modeId: 'host-failure' }],
      },
    ],
  },
  'availability-math': {
    caption: 'Availability in the metrics panel is the product of every component carrying traffic. Add and remove redundancy and watch the number move.',
    variants: [
      { id: 'fragile', label: 'No redundancy', note: 'Single instance, single-AZ database.', build: stack('Fragile', { app: { replicas: 1 }, db: { multiAz: false } }) },
      { id: 'solid', label: 'Redundant', note: 'Several instances, a Multi-AZ database.', build: stack('Redundant', { app: { replicas: 4, zones: 'multi' }, db: { multiAz: true } }) },
    ],
  },
  'capacity-planning': {
    caption: 'The database caps this system. Try scaling the application tier and watch the error rate refuse to move.',
    autoplay: true,
    variants: [
      { id: 'bottleneck', label: 'Database bound', note: 'Traffic exceeds what the database can serve.', build: stack('Database bound', { users: { rps: 4000 }, app: { replicas: 8 } }) },
      { id: 'relieved', label: 'Cache added', note: 'The bottleneck moves; now the tier sizes matter again.', build: stack('Cache added', { users: { rps: 4000 }, app: { replicas: 8 }, cache: true }) },
    ],
  },
  'latency-budget': {
    caption: 'Change the audience distance on the Users node and watch p95 move before your code runs at all.',
    autoplay: true,
    variants: [
      { id: 'far', label: 'Worldwide audience', note: 'Distance alone consumes most of the budget.', build: stack('Global, no CDN', { users: { rps: 900, region: 'global' } }) },
      { id: 'edge', label: 'Served from the edge', note: 'The expensive round trips happen near the user.', build: stack('Global, with a CDN', { users: { rps: 900, region: 'global' }, cdn: true }) },
    ],
  },
  'network-segmentation': {
    caption: 'One compromised workload, two clusters. The NetworkPolicy decides how far it gets.',
    autoplay: true,
    variants: [
      { id: 'flat', label: 'Flat cluster', note: 'Every Pod can reach every other Pod.', build: k8sScene('Flat network', { replicas: 3, livenessProbe: 'http', readinessProbe: true, memLimit: 1024 }) },
      { id: 'segmented', label: 'Default-deny policy', note: 'Traffic is denied unless a rule allows it.', build: k8sScene('Segmented', { replicas: 3, livenessProbe: 'http', readinessProbe: true, memLimit: 1024 }, { netpol: true }) },
    ],
  },
  observability: {
    caption: 'Run this, then inject a failure from the Incidents tab. The event log is the difference between knowing and guessing.',
    autoplay: true,
    variants: [
      { id: 'blind', label: 'Nothing collecting', note: 'The Review panel will say so.', build: stack('No observability') },
      { id: 'instrumented', label: 'Metrics and alarms', note: 'Symptom-based alerting attached.', build: stack('Instrumented', { monitoring: true }) },
    ],
  },
  'kubernetes-networking': {
    caption: 'Traffic enters through the Ingress, resolves through the Service, and lands on whichever Pods are ready.',
    autoplay: true,
    variants: [
      { id: 'path', label: 'Ingress to Pod', note: 'Hover the Service and read what endpoints mean.', build: k8sScene('Kubernetes path', { replicas: 4, livenessProbe: 'http', readinessProbe: true, memLimit: 1024, antiAffinity: true }) },
    ],
  },
  'lateral-movement': {
    caption: 'The Security tab shows residual pressure at each hop. Segmentation is what makes the numbers fall.',
    autoplay: true,
    variants: [
      { id: 'flat', label: 'Flat cluster', note: 'One foothold reaches everything.', build: k8sScene('Flat', { replicas: 3, livenessProbe: 'http', readinessProbe: true, memLimit: 1024 }) },
      { id: 'contained', label: 'Segmented', note: 'A default-deny policy contains it.', build: k8sScene('Contained', { replicas: 3, livenessProbe: 'http', readinessProbe: true, memLimit: 1024 }, { netpol: true }) },
    ],
  },
}

// ── Lookup ──────────────────────────────────────────────────────────────────

/** Concept categories mapped to the reference architecture that suits them. */
const TEMPLATE_FOR_CATEGORY: Record<string, string> = {
  networking: 'three-tier',
  compute: 'three-tier',
  data: 'three-tier',
  reliability: 'three-tier',
  security: 'three-tier',
  operations: 'three-tier',
  platform: 'kubernetes',
  kubernetes: 'kubernetes',
}

/**
 * Every entry gets something runnable. Where a purpose-built scene exists it is
 * used; otherwise the reader gets the reference architecture closest to the
 * subject, which is still a far better starting point than a blank canvas.
 */
export function demoFor(conceptId: string): Demo | null {
  const explicit = DEMOS[conceptId]
  if (explicit) return explicit

  const concept = CONCEPTS[conceptId]
  if (!concept) return null

  const templateId = TEMPLATE_FOR_CATEGORY[concept.category] ?? 'three-tier'
  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0]
  const teaches = ALL_RESOURCES.filter((r) => r.concepts?.includes(conceptId)).slice(0, 4)

  return {
    caption: teaches.length
      ? `A working architecture to try this on. ${teaches.map((r) => r.short).join(', ')} ${teaches.length === 1 ? 'is' : 'are'} where this idea shows up.`
      : 'A working architecture to try this on.',
    autoplay: true,
    variants: [{ id: 'reference', label: template.name, note: template.blurb, build: template.build }],
  }
}

export function hasExplicitDemo(conceptId: string): boolean {
  return conceptId in DEMOS
}

// ── Per-resource starters ───────────────────────────────────────────────────


/**
 * A small, valid architecture built around one resource, so "play with this on
 * the canvas" lands you somewhere you can immediately press play — rather than
 * on an empty canvas with a name you have to find in the palette.
 *
 * Placement follows what the resource *is*: edge services go in front of the
 * stack, data and dependencies behind it, and controls attach to the tier they
 * protect. A CDN wired behind the compute would be valid and wrong.
 */

/** Sits between the internet and the load balancer. */
const FRONT_OF_STACK = new Set([
  'cdn', 'waf', 'ddos-shield', 'api-gateway', 'dns-zone',
  'load-balancer-l7', 'load-balancer-l4', 'k8s-ingress', 'internet-gateway',
])

/** Attaches to the application tier rather than carrying request traffic. */
const ATTACHES_TO_COMPUTE = new Set([
  'identity', 'secrets', 'kms', 'certificate', 'registry', 'ci-cd', 'autoscaler',
  'monitoring', 'logging', 'tracing', 'alerting', 'firewall', 'private-link', 'backup',
])

export function starterFor(defId: string): SavedDiagram {
  const def = requireResource(defId)

  const base: Parameters<typeof diagram>[1] = [
    { id: 'users', def: 'core.client', at: [-460, 140], props: { rps: 600 } },
    { id: 'net', def: 'core.internet', at: [-240, 140] },
    { id: 'alb', def: 'aws.alb', at: [20, 140] },
    { id: 'app', def: 'aws.ec2', at: [280, 140], props: { size: 'm5.large', replicas: 3 } },
  ]
  const wires: Parameters<typeof diagram>[2] = [
    ['users', 'out', 'net', 'in'],
    ['net', 'out', 'alb', 'in'],
    ['alb', 'out', 'app', 'in'],
  ]

  // Already part of the scaffold — nothing to add.
  if (['core.client', 'core.internet', 'aws.alb', 'aws.ec2'].includes(defId)) {
    return finish(`${def.short} starter`, base, wires)
  }

  const subject = { id: 'subject', def: defId, label: def.short }

  if (def.container) {
    // Containers hold things rather than connect to them; drop it beside the
    // stack so the reader can drag resources into it.
    return finish(`${def.short} starter`, [...base, { ...subject, at: [280, -180] }], wires)
  }

  if (def.archetype === 'attacker') {
    const attack = firstValidLink(def, 'subject', 'alb', requireResource('aws.alb'))
    return finish(`${def.short} starter`, [...base, { ...subject, at: [-240, 380] }], attack ? [...wires, attack] : wires)
  }

  if (FRONT_OF_STACK.has(def.archetype)) {
    // Re-route the entry path through it: internet → subject → load balancer.
    const inbound = firstValidLink(requireResource('core.internet'), 'net', 'subject', def)
    const outbound = firstValidLink(def, 'subject', 'alb', requireResource('aws.alb'))
    if (inbound && outbound) {
      return finish(
        `${def.short} starter`,
        [...base, { ...subject, at: [-110, 140] }],
        [wires[0], inbound, outbound, wires[2]],
      )
    }
  }

  if (ATTACHES_TO_COMPUTE.has(def.archetype)) {
    const attachment = firstValidLink(def, 'subject', 'app', requireResource('aws.ec2'))
      ?? firstValidLink(requireResource('aws.ec2'), 'app', 'subject', def)
    if (attachment) {
      return finish(`${def.short} starter`, [...base, { ...subject, at: [280, -60] }], [...wires, attachment])
    }
  }

  // Everything else — databases, caches, queues, storage — sits behind the app.
  const behind = firstValidLink(requireResource('aws.ec2'), 'app', 'subject', def)
  if (behind) {
    return finish(`${def.short} starter`, [...base, { ...subject, at: [540, 140] }], [...wires, behind])
  }

  return finish(`${def.short} starter`, [...base, { ...subject, at: [540, 140] }], wires)
}

function finish(name: string, nodes: Parameters<typeof diagram>[1], wires: Parameters<typeof diagram>[2]) {
  return autoLayout(diagram(name, nodes, wires))
}

/** The first legal wiring between two placed nodes, or null. */
function firstValidLink(
  source: ResourceDef,
  sourceId: string,
  targetId: string,
  target: ResourceDef,
): Parameters<typeof diagram>[2][number] | null {
  for (const out of source.ports.filter((p) => p.side === 'out')) {
    for (const inPort of target.ports.filter((p) => p.side === 'in')) {
      if (validateConnection({ source, sourcePort: out, target, targetPort: inPort }).ok) {
        return [sourceId, out.id, targetId, inPort.id]
      }
    }
  }
  return null
}
