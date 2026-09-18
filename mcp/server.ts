import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { resolve } from 'node:path'

import {
  ALL_RESOURCES, CATEGORY_META, PROVIDER_META, RESOURCES_BY_ARCHETYPE,
  archetypeLabel, defaultProps, equivalentsOf, getResource, searchResources,
} from '../src/catalog/registry'
import { buildDiagram, explainConnection, suggestPorts } from '../src/catalog/authoring'
import { ALL_CONCEPTS, CONCEPTS, searchConcepts } from '../src/codex/concepts'
import { MISSIONS, MISSION_BY_ID } from '../src/scenarios/missions'
import { TEMPLATES } from '../src/scenarios/templates'
import { review, scoreFindings } from '../src/sim/advisor'
import { run } from '../src/sim/engine'
import { makeIncident, possibleIncidents } from '../src/sim/incidents'
import { ATTACK_META } from '../src/sim/attacks'
import { encodeShareLink, toSimGraph } from '../src/store/serialize'
import { autoLayout } from '../src/canvas/layout'
import type { ActiveIncident } from '../src/sim/types'
import type { SavedDiagram } from '../src/store/types'
import { renderScreenshot, renderVideo, resolveAppUrl } from './browser'

const DIST = resolve(process.cwd(), 'dist')

// ── Shared schemas ──────────────────────────────────────────────────────────

const nodeSchema = z.object({
  id: z.string().describe('Your identifier for this node, referenced by edges.'),
  type: z.string().describe('Catalog resource id, e.g. "aws.rds". Call list_resources for the full set.'),
  label: z.string().optional().describe('Display name. Defaults to the resource\'s short name.'),
  props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional()
    .describe('Property overrides. Call describe_resource to see keys, types and defaults.'),
  in: z.string().optional().describe('Id of a container node (VPC, subnet, cluster, node pool) this sits inside.'),
  x: z.number().optional(),
  y: z.number().optional(),
})

const edgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  fromPort: z.string().optional().describe('Omit to let the catalog choose the right port pair.'),
  toPort: z.string().optional(),
})

const diagramSpecSchema = z.object({
  name: z.string(),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema).optional(),
  layout: z.boolean().optional().describe('Arrange automatically. Defaults to true unless you supply coordinates.'),
})

const savedDiagramSchema = z.object({
  version: z.literal(1),
  name: z.string(),
  nodes: z.array(z.object({
    id: z.string(), defId: z.string(), label: z.string(),
    props: z.record(z.string(), z.unknown()),
    x: z.number(), y: z.number(),
    w: z.number().optional(), h: z.number().optional(), parentId: z.string().optional(),
  })),
  edges: z.array(z.object({
    id: z.string(), source: z.string(), target: z.string(),
    sourceHandle: z.string(), targetHandle: z.string(),
    flow: z.string(), flows: z.array(z.string()),
  })),
})

const incidentSchema = z.object({
  nodeId: z.string(),
  modeId: z.string().describe('A failure mode id from describe_resource.'),
})

const evidenceSchema = z.array(z.object({
  label: z.string().describe('Short metric label, such as "Errors" or "Demand".'),
  value: z.string().describe('Measured value shown large in the evidence panel.'),
  detail: z.string().optional().describe('Brief provenance or interpretation.'),
  tone: z.enum(['default', 'good', 'warn', 'bad']).optional(),
})).max(3).optional().describe('Up to three measured readouts shown beside the diagram.')

/** Accepts either a full saved diagram or a spec to build one from. */
const diagramInput = z.union([savedDiagramSchema, diagramSpecSchema])

function coerceDiagram(input: unknown): { diagram: SavedDiagram; warnings: string[] } {
  const candidate = input as Partial<SavedDiagram>
  if (candidate?.version === 1 && Array.isArray(candidate.nodes) && candidate.nodes.every((n) => 'defId' in n)) {
    return { diagram: candidate as SavedDiagram, warnings: [] }
  }
  const built = buildDiagram(input as Parameters<typeof buildDiagram>[0])
  if (!built.ok) throw new Error(built.errors.join('\n'))
  return { diagram: built.diagram, warnings: built.warnings }
}

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] }
}

function resolveIncidents(diagram: SavedDiagram, requested: { nodeId: string; modeId: string }[] = []): ActiveIncident[] {
  return requested.flatMap((seed) => {
    const node = diagram.nodes.find((n) => n.id === seed.nodeId)
    const mode = node ? getResource(node.defId)?.sim?.failureModes?.find((m) => m.id === seed.modeId) : undefined
    if (!mode) throw new Error(`No failure mode "${seed.modeId}" on node "${seed.nodeId}". Call list_failure_modes.`)
    return [makeIncident(seed.nodeId, mode, 0)]
  })
}

export interface ServerOptions {
  /** Where the running app lives. Falls back to serving `dist/`. */
  appUrl?: string
  /** Disables screenshot and video tools (useful in headless CI). */
  visualsEnabled?: boolean
}

export function createCloudwrightServer(options: ServerOptions = {}) {
  const server = new McpServer({
    name: 'cloudwright',
    version: '0.2.0',
  })

  const visuals = options.visualsEnabled !== false

  // ── Discovery ─────────────────────────────────────────────────────────────

  server.registerTool(
    'list_resources',
    {
      title: 'List cloud resources',
      description:
        'Every cloud service Cloudwright models, across AWS, Azure, GCP and Kubernetes. Filter by provider, category, archetype or a search term. Start here before authoring a diagram.',
      inputSchema: {
        provider: z.enum(['aws', 'azure', 'gcp', 'kubernetes', 'core']).optional(),
        category: z.string().optional().describe(Object.keys(CATEGORY_META).join(' | ')),
        archetype: z.string().optional().describe('Provider-agnostic behaviour class, e.g. "relational-db".'),
        query: z.string().optional(),
        limit: z.number().optional(),
      },
    },
    async ({ provider, category, archetype, query, limit }) => {
      let items = query ? searchResources(query, 200).map((h) => h.def) : ALL_RESOURCES
      if (provider) items = items.filter((r) => r.provider === provider)
      if (category) items = items.filter((r) => r.category === category)
      if (archetype) items = items.filter((r) => r.archetype === archetype)

      return text({
        total: items.length,
        resources: items.slice(0, limit ?? 200).map((r) => ({
          id: r.id,
          name: r.name,
          short: r.short,
          provider: r.provider,
          category: r.category,
          archetype: r.archetype,
          tagline: r.tagline,
          isContainer: Boolean(r.container),
        })),
      })
    },
  )

  server.registerTool(
    'describe_resource',
    {
      title: 'Describe a resource',
      description:
        'Everything about one resource: its ports (what it can connect to), every property with its type, default, options and what changing it does, its failure modes, its cost model, and how to build the real thing.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const def = getResource(id)
      if (!def) throw new Error(`Unknown resource "${id}". Call list_resources.`)
      const props = defaultProps(def)

      return text({
        id: def.id,
        name: def.name,
        short: def.short,
        provider: def.provider,
        category: def.category,
        archetype: def.archetype,
        archetypeLabel: archetypeLabel(def.archetype),
        tagline: def.tagline,
        description: def.description,
        container: def.container ? { accepts: def.container.accepts, label: def.container.label } : null,
        wantsContainer: def.wantsContainer ?? null,
        ports: def.ports.map((p) => ({ id: p.id, side: p.side, label: p.label, flows: p.flows, max: p.max })),
        properties: (def.props ?? []).map((p) => ({
          key: p.key,
          label: p.label,
          type: p.type,
          default: p.default,
          unit: p.unit,
          min: p.min,
          max: p.max,
          options: p.options?.map((o) => ({ value: o.value, label: o.label, note: o.note })),
          help: p.help,
          whatChangingItDoes: p.impact,
          affects: p.affects,
          dangerousWhen: p.danger ? (p.danger(p.default, props) ?? 'Depends on the value; see help.') : null,
        })),
        simulation: def.sim ?? null,
        costNote: def.cost?.note ?? null,
        setup: def.setup ?? null,
        concepts: def.concepts ?? [],
        equivalentsInOtherClouds: equivalentsOf(def).map((e) => ({ id: e.id, provider: e.provider, short: e.short })),
      })
    },
  )

  server.registerTool(
    'list_archetypes',
    {
      title: 'List archetypes',
      description:
        'The provider-agnostic behaviour classes the simulator reasons about, each with its equivalents in every cloud. Use this to translate an architecture between providers.',
      inputSchema: {},
    },
    async () =>
      text(
        Object.entries(RESOURCES_BY_ARCHETYPE).map(([archetype, defs]) => ({
          archetype,
          label: archetypeLabel(archetype as never),
          resources: defs.map((d) => ({ id: d.id, provider: d.provider, short: d.short })),
        })),
      ),
  )

  server.registerTool(
    'suggest_ports',
    {
      title: 'How can these two connect?',
      description:
        'Every legal port pair between two resources, best first — or an explanation of why they cannot connect, which is usually worth reading.',
      inputSchema: { from: z.string(), to: z.string() },
    },
    async ({ from, to }) => {
      const suggestions = suggestPorts(from, to)
      if (suggestions.length > 0) return text({ connectable: true, options: suggestions })
      const source = getResource(from)
      const target = getResource(to)
      return text({
        connectable: false,
        why: explainConnection(
          from,
          source?.ports.find((p) => p.side === 'out')?.id ?? '',
          to,
          target?.ports.find((p) => p.side === 'in')?.id ?? '',
        ),
      })
    },
  )

  server.registerTool(
    'list_failure_modes',
    {
      title: 'List failure modes',
      description: 'Everything that can realistically break in a diagram, with the symptom and the remedy for each.',
      inputSchema: { diagram: diagramInput.optional(), resourceId: z.string().optional() },
    },
    async ({ diagram, resourceId }) => {
      if (resourceId) {
        const def = getResource(resourceId)
        if (!def) throw new Error(`Unknown resource "${resourceId}".`)
        return text({ resource: def.id, modes: def.sim?.failureModes ?? [] })
      }
      if (!diagram) throw new Error('Pass either a diagram or a resourceId.')
      const { diagram: doc } = coerceDiagram(diagram)
      return text(
        possibleIncidents(toSimGraph(doc)).map(({ nodeId, mode }) => ({
          nodeId,
          modeId: mode.id,
          label: mode.label,
          symptom: mode.symptom,
          remedy: mode.remedy,
        })),
      )
    },
  )

  server.registerTool(
    'list_attack_vectors',
    {
      title: 'List attack vectors',
      description: 'The attacks the simulator models, how each one works, and the controls that stop it.',
      inputSchema: {},
    },
    async () => text(Object.entries(ATTACK_META).map(([vector, meta]) => ({ vector, ...meta }))),
  )

  // ── Authoring ─────────────────────────────────────────────────────────────

  server.registerTool(
    'create_diagram',
    {
      title: 'Create a diagram',
      description:
        'Builds a Cloudwright diagram from a description. Ports are resolved from the catalog when omitted, the layout is computed from the dependency graph, and every connection is validated — an illegal one comes back with an explanation rather than a broken file. Returns the diagram JSON and a share URL that opens it in the app.',
      inputSchema: diagramSpecSchema.shape,
    },
    async (spec) => {
      const built = buildDiagram(spec as Parameters<typeof buildDiagram>[0])
      if (!built.ok) return text({ ok: false, errors: built.errors })
      const findings = review(toSimGraph(built.diagram))
      return text({
        ok: true,
        warnings: built.warnings,
        shareUrl: `${options.appUrl ?? 'http://localhost:5173'}/build?d=${encodeShareLink(built.diagram)}`,
        reviewScore: scoreFindings(findings).score,
        topFindings: findings.slice(0, 5).map((f) => ({ severity: f.severity, title: f.title, fix: f.fix })),
        diagram: built.diagram,
      })
    },
  )

  server.registerTool(
    'arrange_diagram',
    {
      title: 'Arrange a diagram',
      description: 'Re-lays out an existing diagram left to right by dependency depth, sizing containers to fit.',
      inputSchema: { diagram: diagramInput },
    },
    async ({ diagram }) => {
      const { diagram: doc } = coerceDiagram(diagram)
      return text(autoLayout(doc))
    },
  )

  server.registerTool(
    'validate_connection',
    {
      title: 'Validate one connection',
      description:
        'Checks whether two resources can be connected on specific ports, and explains the reasoning either way. The explanation is the same one a player sees, so it is worth reading.',
      inputSchema: { from: z.string(), fromPort: z.string(), to: z.string(), toPort: z.string() },
    },
    async ({ from, fromPort, to, toPort }) => text(explainConnection(from, fromPort, to, toPort)),
  )

  // ── Analysis ──────────────────────────────────────────────────────────────

  server.registerTool(
    'simulate',
    {
      title: 'Simulate a diagram',
      description:
        'Runs traffic through an architecture and reports what happens: throughput, error rate, latency, cost, modelled availability, and the state of every node. Optionally inject failures or vary the load first.',
      inputSchema: {
        diagram: diagramInput,
        ticks: z.number().optional().describe('Simulation ticks to run. Default 20; each is one second.'),
        incidents: z.array(incidentSchema).optional(),
        loadMultiplier: z.number().optional(),
        attacksEnabled: z.boolean().optional(),
      },
    },
    async ({ diagram, ticks, incidents, loadMultiplier, attacksEnabled }) => {
      const { diagram: doc } = coerceDiagram(diagram)
      const graph = toSimGraph(doc)
      const state = run(graph, ticks ?? 20, { loadMultiplier, attacksEnabled }, resolveIncidents(doc, incidents))

      return text({
        metrics: state.metrics,
        nodes: Object.values(state.nodes).map((n) => {
          const node = doc.nodes.find((x) => x.id === n.id)
          return {
            id: n.id,
            label: node?.label,
            type: node?.defId,
            status: n.status,
            demand: round(n.demand),
            served: round(n.served),
            capacity: Number.isFinite(n.capacity) ? round(n.capacity) : 'unmetered',
            utilisation: round(n.utilisation, 3),
            errorRate: round(n.errorRate, 4),
            latencyMs: round(n.latencyMs),
            costPerHour: round(n.costPerHour, 4),
            breachedBy: n.breachedBy,
            attackPressure: round(n.attackPressure, 3),
          }
        }),
        recentEvents: state.events.slice(-12),
      })
    },
  )

  server.registerTool(
    'review_diagram',
    {
      title: 'Review a diagram',
      description:
        'A Well-Architected-style review across security, reliability, performance, cost and operations. Every finding explains what is wrong, why it matters and what to do about it.',
      inputSchema: { diagram: diagramInput },
    },
    async ({ diagram }) => {
      const { diagram: doc } = coerceDiagram(diagram)
      const findings = review(toSimGraph(doc))
      const { score, byPillar } = scoreFindings(findings)
      return text({ score, byPillar, findings })
    },
  )

  server.registerTool(
    'compare_diagrams',
    {
      title: 'Compare two diagrams',
      description:
        'Simulates and reviews two architectures side by side. The fastest way to answer "is this change actually better?".',
      inputSchema: {
        a: diagramInput,
        b: diagramInput,
        ticks: z.number().optional(),
        labels: z.array(z.string()).optional(),
      },
    },
    async ({ a, b, ticks, labels }) => {
      const analyse = (input: unknown) => {
        const { diagram } = coerceDiagram(input)
        const graph = toSimGraph(diagram)
        const state = run(graph, ticks ?? 20)
        const findings = review(graph)
        return { name: diagram.name, metrics: state.metrics, score: scoreFindings(findings).score, findings: findings.length }
      }
      const left = analyse(a)
      const right = analyse(b)
      return text({
        [labels?.[0] ?? 'a']: left,
        [labels?.[1] ?? 'b']: right,
        delta: {
          errorRate: round(right.metrics.errorRate - left.metrics.errorRate, 4),
          p95LatencyMs: round(right.metrics.p95LatencyMs - left.metrics.p95LatencyMs),
          costPerMonth: round(right.metrics.costPerMonth - left.metrics.costPerMonth, 2),
          availability: round(right.metrics.availability - left.metrics.availability, 5),
          score: right.score - left.score,
        },
      })
    },
  )

  // ── Learning material ─────────────────────────────────────────────────────

  server.registerTool(
    'list_concepts',
    {
      title: 'List codex entries',
      description: 'The written material: networking, compute, data, reliability, security, operations and Kubernetes.',
      inputSchema: { category: z.string().optional(), query: z.string().optional() },
    },
    async ({ category, query }) => {
      let items = query ? searchConcepts(query) : ALL_CONCEPTS
      if (category) items = items.filter((c) => c.category === category)
      return text(items.map((c) => ({ id: c.id, title: c.title, category: c.category, short: c.short })))
    },
  )

  server.registerTool(
    'get_concept',
    {
      title: 'Read a codex entry',
      description: 'The full text of one entry, with its key points, code snippets and related reading.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const concept = CONCEPTS[id]
      if (!concept) throw new Error(`Unknown concept "${id}". Call list_concepts.`)
      return text(concept)
    },
  )

  server.registerTool(
    'list_missions',
    {
      title: 'List missions',
      description: 'The guided scenarios, with their objectives and difficulty.',
      inputSchema: {},
    },
    async () =>
      text(MISSIONS.map((m) => ({
        id: m.id, title: m.title, tagline: m.tagline, difficulty: m.difficulty,
        track: m.track, minutes: m.minutes, objectives: m.objectives.length, requires: m.requires ?? null,
      }))),
  )

  server.registerTool(
    'get_mission',
    {
      title: 'Read a mission',
      description: 'A mission in full: the brief, its objectives, its hints, its debrief, and its starting diagram.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const mission = MISSION_BY_ID[id]
      if (!mission) throw new Error(`Unknown mission "${id}".`)
      return text({
        id: mission.id, title: mission.title, tagline: mission.tagline,
        difficulty: mission.difficulty, track: mission.track, brief: mission.brief,
        objectives: mission.objectives.map((o) => ({ id: o.id, label: o.label, hint: o.hint })),
        hints: mission.hints, debrief: mission.debrief, concepts: mission.concepts,
        startingDiagram: mission.start ?? null,
      })
    },
  )

  server.registerTool(
    'list_templates',
    {
      title: 'List reference architectures',
      description: 'Ready-made starting points. Returns full diagrams you can modify.',
      inputSchema: { id: z.string().optional() },
    },
    async ({ id }) => {
      if (id) {
        const template = TEMPLATES.find((t) => t.id === id)
        if (!template) throw new Error(`Unknown template "${id}".`)
        return text(template.build())
      }
      return text(TEMPLATES.map((t) => ({ id: t.id, name: t.name, blurb: t.blurb })))
    },
  )

  // ── Visual ────────────────────────────────────────────────────────────────

  if (visuals) {
    server.registerTool(
      'screenshot_diagram',
      {
        title: 'Screenshot a diagram',
        description:
          'Renders a diagram in the real application and returns a PNG, plus the simulation state at that moment. Use it to check your own work, or to illustrate an answer. `title` and `subtitle` draw a caption over the canvas in the application\'s own type, so the image carries its point wherever it travels.',
        inputSchema: {
          diagram: diagramInput,
          ticks: z.number().optional().describe('Advance the simulation this many ticks before capturing.'),
          incidents: z.array(incidentSchema).optional(),
          width: z.number().optional(),
          height: z.number().optional(),
          loadMultiplier: z.number().optional(),
          theme: z.enum(['light', 'dark']).optional().describe('Colour scheme to render in. Default dark.'),
          title: z.string().optional().describe('Headline drawn over the canvas — state the claim, not the diagram\'s name.'),
          subtitle: z.string().optional().describe('One line under the title, usually the numbers that prove the claim.'),
          evidence: evidenceSchema,
        },
      },
      async ({ diagram, ticks, incidents, width, height, loadMultiplier, theme, title, subtitle, evidence }) => {
        const { diagram: doc } = coerceDiagram(diagram)
        const appUrl = await resolveAppUrl(options.appUrl, DIST)
        const { base64, snapshot } = await renderScreenshot(appUrl, {
          diagram: doc, ticks, incidents, width, height, loadMultiplier, theme, title, subtitle, evidence,
        })
        return {
          content: [
            { type: 'image' as const, data: base64, mimeType: 'image/png' },
            { type: 'text' as const, text: JSON.stringify(snapshot, null, 2) },
          ],
        }
      },
    )

    server.registerTool(
      'record_video',
      {
        title: 'Record a run as video',
        description:
          'Plays a diagram forward and encodes the result as an MP4 — traffic flowing, failures appearing, recovery happening. Use `timeline` to inject a failure part-way through so the video tells a story, and `title`/`subtitle` to caption it.',
        inputSchema: {
          diagram: diagramInput,
          frames: z.number().optional().describe('Simulation ticks to record. Default 60.'),
          fps: z.number().optional().describe('Playback frame rate. Default 12.'),
          outputPath: z.string().optional(),
          timeline: z.array(incidentSchema.extend({ atFrame: z.number() })).optional(),
          width: z.number().optional(),
          height: z.number().optional(),
          scale: z.number().optional().describe('Device pixel ratio for the recording. Defaults to 2 for retina-sized frames.'),
          loadMultiplier: z.number().optional(),
          theme: z.enum(['light', 'dark']).optional().describe('Colour scheme to render in. Default dark.'),
          title: z.string().optional().describe('Headline drawn over the canvas — state the claim, not the diagram\'s name.'),
          subtitle: z.string().optional().describe('One line under the title, usually the numbers that prove the claim.'),
          evidence: evidenceSchema,
        },
      },
      async ({ diagram, frames, fps, outputPath, timeline, width, height, scale, loadMultiplier, theme, title, subtitle, evidence }) => {
        const { diagram: doc } = coerceDiagram(diagram)
        const appUrl = await resolveAppUrl(options.appUrl, DIST)
        const result = await renderVideo(appUrl, {
          diagram: doc, frames, fps, outputPath, timeline, width, height, scale, loadMultiplier, theme, title, subtitle, evidence,
        })
        return text({
          ...result,
          note: 'Written to the local filesystem. Open it, or attach it wherever it is needed.',
        })
      },
    )
  }

  server.registerTool(
    'share_url',
    {
      title: 'Get a share URL',
      description:
        'Encodes a diagram into a URL that opens it in Cloudwright. The whole architecture travels in the link — nothing is uploaded.',
      inputSchema: { diagram: diagramInput },
    },
    async ({ diagram }) => {
      const { diagram: doc } = coerceDiagram(diagram)
      return text(`${options.appUrl ?? 'http://localhost:5173'}/build?d=${encodeShareLink(doc)}`)
    },
  )

  // ── Resources ─────────────────────────────────────────────────────────────

  server.registerResource(
    'catalog',
    'cloudwright://catalog',
    { title: 'Resource catalog', description: 'Every modelled cloud service, in full.', mimeType: 'application/json' },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(ALL_RESOURCES, null, 2) }],
    }),
  )

  server.registerResource(
    'providers',
    'cloudwright://providers',
    { title: 'Providers and categories', description: 'How the catalog is organised.', mimeType: 'application/json' },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify({ providers: PROVIDER_META, categories: CATEGORY_META }, null, 2),
      }],
    }),
  )

  server.registerResource(
    'authoring-guide',
    'cloudwright://authoring',
    { title: 'How to author a diagram', description: 'The diagram format and the rules it must satisfy.', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: AUTHORING_GUIDE }] }),
  )

  return server
}

function round(value: number, places = 1): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

const AUTHORING_GUIDE = `# Authoring a Cloudwright diagram

Call \`create_diagram\` with nodes and edges. You do not need coordinates or port
ids — both are resolved for you.

\`\`\`json
{
  "name": "Three-tier web service",
  "nodes": [
    { "id": "users", "type": "core.client", "props": { "rps": 800 } },
    { "id": "cdn",   "type": "aws.cloudfront" },
    { "id": "alb",   "type": "aws.alb" },
    { "id": "app",   "type": "aws.ec2", "props": { "size": "m5.large", "replicas": 3 } },
    { "id": "db",    "type": "aws.rds", "props": { "multiAz": true, "backupRetention": 14 } }
  ],
  "edges": [
    { "from": "users", "to": "cdn" },
    { "from": "cdn",   "to": "alb" },
    { "from": "alb",   "to": "app" },
    { "from": "app",   "to": "db" }
  ]
}
\`\`\`

## Rules worth knowing

- **Connections are validated against how the services actually behave.** The
  public internet cannot reach a database; a load balancer cannot front one. A
  refusal comes back with the reason, which is usually the answer to the design
  question you were really asking.
- **Traffic starts at a \`core.client\` node.** Without one, nothing flows and
  every metric reads zero.
- **Containers nest.** Put a subnet \`in\` a VPC, an instance \`in\` a subnet, a
  Deployment \`in\` a node pool. Use \`describe_resource\` to see what a container
  accepts.
- **Properties are where the lessons are.** Every one carries \`help\` (what it
  is) and \`whatChangingItDoes\` (what you will see change). Read them before
  guessing at values.

## A good working order

1. \`list_resources\` — find the pieces.
2. \`suggest_ports\` — if you are unsure two things can connect.
3. \`create_diagram\` — build it; read the warnings.
4. \`simulate\` — see whether it actually serves the traffic.
5. \`review_diagram\` — see what a senior engineer would say about it.
6. \`screenshot_diagram\` or \`record_video\` — look at your own work.
7. \`share_url\` — hand the human a link they can open and edit.
`
