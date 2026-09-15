# Cloudwright

**Build the cloud. Break it. Defend it.**

A free-form canvas where you assemble real cloud architectures, watch traffic move through
them, inject the failures and attacks that happen in production, and find out what actually
breaks — before it breaks somewhere that matters.

Everything runs in the browser. No backend, no accounts, no data leaves the machine.

---

## What it does

**A canvas that refuses to lie.** Drag a line from the public internet to a database and it
will not connect — and it will tell you why, in terms of route tables, wire protocols and the
incidents that follow. Every rejected connection is a lesson.

**A simulation that models the trade-offs.** Requests flow from clients through your graph.
Latency climbs non-linearly with utilisation. Caches absorb reads, queues absorb spikes,
CDNs absorb both. Scaling a tier that is not the bottleneck changes nothing except the bill —
and you can watch that happen.

**Failures you can inject.** OOM kills, zone outages, cache stampedes, certificate expiry,
hot partitions, connection exhaustion. Each one is a real failure mode taken from the resource
it belongs to, with the symptom you would see and the remedy that fixes it.

**Attacks with real defences.** Volumetric and application-layer DDoS, SQL injection, SSRF,
credential stuffing, lateral movement, exfiltration, ransomware. Each walks your graph and is
blunted — or not — by the controls it meets, including how you configured them.

**A live architecture review.** A Well-Architected-style analysis runs continuously across
five pillars and explains every finding the way a senior engineer would.

**How to build it for real.** Every resource carries the console steps, the CLI commands, the
Terraform, the official docs, and the operational gotchas that catch people.

**One idea, three clouds.** Every service maps to a provider-agnostic archetype, so the AWS,
Azure and GCP equivalents sit side by side. Learn the shape once; it transfers.

**A campaign and a codex.** Ten missions built around problems people have actually been paged
for, and 105 codex entries covering networking, compute, data, reliability, security,
operations and Kubernetes. Every entry carries a *runnable* illustration — usually the same
architecture twice, with and without the thing the entry is about, so the difference is
something you watch rather than something you are told.

**Record and replay.** Capture a run tick by tick, then scrub through it. Incidents and
breaches are marked on the track, so an outage can be examined a second at a time. Recordings
export to JSON and can be rendered to video through the MCP server.

**An MCP server.** Point a model at Cloudwright and it can read the whole catalog, author and
validate architectures, simulate them, review them, and look at screenshots and video of its
own work. See [Driving it from a model](#driving-it-from-a-model).

---

## Running it

```bash
npm install
npm run dev                  # http://localhost:5173
npm run dev -- --enable-mcp  # …and an MCP endpoint at /mcp
```

```bash
npm run check    # typecheck + lint + tests
npm run build    # production build into dist/ (and the MCP server into dist-mcp/)
```

### Working in it

Diagrams open in **tabs** — the tab carries the name, and double-clicking one renames it.
**File** handles new, duplicate, JSON import and export, share links and recordings; **View**
shows and hides the three panels. A hidden panel leaves a labelled strip behind, so it is
always obvious both that something is hidden and what it was.

| | |
| --- | --- |
| `Space` | Play or pause |
| `R` / `X` | Reset the simulation / break something at random |
| `⌘Z` `⇧⌘Z` | Undo, redo |
| `⌘D` | Duplicate the selected resource |
| `⌘1` `⌘2` `⌘3` | Palette, inspector, telemetry |

Everything is stored locally. A diagram can also be shared as a URL — the whole architecture is
compressed into the link, so nothing is uploaded anywhere.

## Driving it from a model

Cloudwright ships an MCP server that exposes the catalog, the simulator, the reviewer and the
renderer. A model can design an architecture, find out whether it actually serves the traffic,
read what a senior engineer would say about it, and then *look at a screenshot of its own work*.

```bash
npm run build          # builds the app and the MCP server
npm run mcp            # stdio, for a desktop MCP client
```

```json
{
  "mcpServers": {
    "cloudwright": {
      "command": "node",
      "args": ["/absolute/path/to/cloudwright/dist-mcp/stdio.mjs"]
    }
  }
}
```

Or over HTTP while developing:

```bash
npm run dev -- --enable-mcp   # streamable HTTP at http://localhost:5173/mcp
```

### What it exposes

| Tool | What it does |
| --- | --- |
| `list_resources` · `describe_resource` | The catalog, including every property with its default, its options, and what changing it does |
| `list_archetypes` | The same service across all four providers — the translation table |
| `suggest_ports` · `validate_connection` | Whether two resources can connect, and the reasoning either way |
| `create_diagram` | Builds an architecture from a description. Ports are resolved and the layout computed, so no port ids or coordinates are needed |
| `arrange_diagram` | Re-lays out an existing diagram by dependency depth |
| `simulate` | Runs traffic through it: throughput, errors, latency, cost, availability, per-node state |
| `review_diagram` | The five-pillar architecture review |
| `compare_diagrams` | Two architectures side by side with the deltas — "is this change actually better?" |
| `screenshot_diagram` | A PNG rendered by the real application, plus the simulation state at that moment |
| `record_video` | An MP4 of a run, with failures injected on a timeline so the video tells a story |
| `list_failure_modes` · `list_attack_vectors` | Everything that can break, and every attack modelled |
| `list_concepts` · `get_concept` · `list_missions` · `get_mission` · `list_templates` | The written material and the scenarios |
| `share_url` | A link that opens the diagram in the app |

Resources: `cloudwright://catalog`, `cloudwright://providers`, `cloudwright://authoring`.

An illegal connection does not produce a broken file — it comes back with the explanation a
player would see, which is usually the answer to the design question that was really being
asked:

> The public internet cannot reach a database directly. A database speaks SQL on a private
> port, not HTTP… Hint: route through a load balancer → compute tier → database.

**Screenshots and video** drive a real browser. They need a Chromium-based browser
(`CLOUDWRIGHT_BROWSER` overrides the search) and, for video, `ffmpeg`. If no dev server is
running they serve `dist/` themselves, so a plain checkout works after `npm run build`.

## Deploying to Cloudflare Pages

**Via Git (recommended).** Connect the repository in the Cloudflare dashboard and set:

| Setting | Value |
| --- | --- |
| Framework preset | None (or Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |

`public/_redirects` sends every path to `index.html` so client-side routing works on a hard
refresh, and `public/_headers` sets the security headers and immutable caching for hashed
assets. Both are copied into `dist` by the build.

**Via direct upload.**

```bash
npx wrangler pages project create cloudwright --production-branch main
npm run deploy
```

---

## How it is put together

```
src/
  catalog/      Every cloud service, as data. One file per provider area.
    schema/     Types, connection rules, flow metadata, reusable property presets
    providers/  aws · azure · gcp · kubernetes · core
    registry.ts Indices, search, cross-provider equivalents, dev-time validation
  sim/          The engine. Pure, deterministic, no React.
    graph.ts    Topology, evaluation order, traffic fan-out
    capacity.ts Configuration → capacity, latency, availability, cache hit ratio
    engine.ts   One tick: demand forward, latency and errors backward
    attacks.ts  Attack propagation and what each control actually stops
    advisor.ts  The architecture review
    incidents.ts Failure injection and chaos mode
  canvas/       React Flow integration: nodes, animated edges, drag-and-drop, layout
  panels/       Palette, inspector, review, observability
  codex/        The written material and its interactive widgets
  scenarios/    Missions, reference templates, objective evaluation
  store/        Zustand stores — document, tabs, panels — and serialisation
  pages/        Landing, missions, codex
mcp/            The MCP server: tools, transports, and browser rendering
scripts/        The dev launcher that understands --enable-mcp
tests/          Catalog validation, engine behaviour, mission solvability, authoring
```

### The two ideas that hold it together

**Archetypes.** The simulator never reasons about `aws.ec2` versus `azure.vm` versus
`gcp.compute-engine`. It reasons about the archetype `vm`. That keeps the engine small, makes
every new resource work on the day it is added, and gives the cross-provider comparison for
free.

**The catalog is the single source of truth.** One `ResourceDef` supplies the palette entry,
the node, the ports, the connection rules, the property editor, the cost model, the failure
modes, the security profile and the build guide. Nothing is duplicated, so nothing can drift.

---

## Adding to it

### A new cloud service

Add one `ResourceDef` to the right file under `src/catalog/providers/`, and export it from that
file's array. That is the whole change — the palette, canvas, inspector, simulation, cost model
and advisor all pick it up. `npm test` validates the structure.

```ts
const myService: ResourceDef = {
  id: 'aws.my-service',          // never rename: saved diagrams reference it
  provider: 'aws',
  name: 'My Service',
  short: 'MyService',            // shown on the node
  archetype: 'queue',            // how the simulator treats it
  category: 'messaging',         // where it sits in the palette
  tagline: 'One line for the palette',
  description: 'A paragraph explaining it in plain language.',
  ports: [inPort('in', 'Messages in', ['queue']), outPort('out', 'Messages out', ['queue'])],
  props: [/* each with help, impact, and a danger predicate where it matters */],
  sim: { capacity: 10000, latencyMs: 12, failureModes: [/* … */] },
  cost: { perMillionRequests: () => 0.4 },
  setup: { console: [], snippets: [], docs: [], gotchas: [] },
  concepts: ['async-messaging'],
}
```

Two rules worth keeping:

- **Every property needs `help` and `impact`.** `help` says what the setting is; `impact` says
  what visibly changes when you move it. The inspector shows both, and the second is where the
  teaching happens.
- **Use `danger` for the production footguns.** It feeds the node warning badge, the inspector
  and the architecture review at once.

### A new codex entry

Add a `Concept` to the right file in `src/codex/topics/` and export it. Reference it from a
resource's `concepts` array or another entry's `related`. Tests fail on dangling links, so the
two stay in sync. Set `widget` to attach one of the interactive explainers.

### A new codex demo

Add an entry to `DEMOS` in `src/codex/demos.ts`, keyed by concept id. Give it two variants —
with and without the thing the entry is about — and the article gets a runnable comparison.
Entries with no explicit demo fall back to the reference architecture closest to their subject,
so nothing is ever left without something to press play on.

### A new mission

Add a `Mission` to `src/scenarios/missions.ts`. Use the `diagram()` helper for the starting
architecture — it resolves edge flows from the catalog, so a nonsensical connection throws at
build time rather than shipping.

Then add a solution to `tests/solvable.test.ts`. That test proves the mission can actually be
completed, which is the one thing that is impossible to notice by hand once objectives get
interesting.

---

## Accuracy

Costs, capacities and latencies are simplified teaching figures chosen to make trade-offs
visible — not quotes. Always check the provider's own calculator before spending money.
Service behaviour, failure modes and remediation advice aim to be accurate; corrections are
welcome.

Cloudwright is not affiliated with Amazon, Microsoft, Google or the CNCF. Resource icons are
original geometric drawings, not the providers' trademarked icon sets.
