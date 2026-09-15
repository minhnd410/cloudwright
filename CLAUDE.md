# Working on Cloudwright

A browser game for learning cloud infrastructure: build architectures on a canvas,
simulate traffic and failure through them, and see what breaks. No backend — it runs
entirely in the browser and deploys as static files.

## Orientation

```bash
npm install
npm run dev                  # http://localhost:5173
npm run dev -- --enable-mcp  # …plus an MCP endpoint at /mcp
npm run check                # typecheck + lint + tests — run this before every commit
npm run build                # dist/ (app) and dist-mcp/ (MCP server)
```

`npm run check` must be green before you commit. It is fast (a few seconds) and the
tests are the only thing standing between a catalog edit and a broken simulation.

## The two ideas everything rests on

**Archetypes.** The simulator never reasons about `aws.ec2` versus `azure.vm` versus
`gcp.compute-engine`. It reasons about the archetype `vm`. That keeps `src/sim/`
small, makes every newly added resource work on the day it is added, and gives the
cross-provider comparison for free. If you find yourself special-casing a provider
inside `src/sim/`, that is a sign the behaviour belongs on the archetype instead.

**The catalog is the single source of truth.** One `ResourceDef` supplies the palette
entry, the canvas node, the ports and connection rules, the property editor, the cost
model, the failure modes, the security profile and the "how to build this for real"
guide. Nothing is duplicated, so nothing can drift.

## Layout

```
src/
  catalog/      Every cloud service, as data. The largest and most valuable part.
    schema/     Types, connection rules, flow metadata, reusable property presets
    providers/  aws/ azure/ gcp/ kubernetes/ core/ — one file per provider area
    registry.ts Indices, search, cross-provider equivalents, dev-time validation
    authoring.ts Build a diagram from a description; resolve ports; explain refusals
  sim/          The engine. Pure, deterministic, no React, no DOM.
    graph.ts    Topology, evaluation order, traffic fan-out
    capacity.ts Configuration → capacity, latency, availability, cache hit ratio
    engine.ts   One tick: demand forward, latency and errors backward
    attacks.ts  Attack propagation and what each control actually stops
    advisor.ts  The five-pillar architecture review
    incidents.ts Failure injection and chaos mode
    recording.ts Tick-by-tick capture for replay
  canvas/       React Flow integration: nodes, animated edges, drag-and-drop, layout
  panels/       Palette, inspector, review, observability, replay transport
  codex/        The written material, its interactive widgets, and runnable demos
  scenarios/    Missions, reference templates, objective evaluation
  store/        Zustand stores — document, tabs, panels — and serialisation
  pages/        Landing, missions, codex
mcp/            MCP server: tools, transports, browser rendering, standalone server
tests/          Catalog validation, engine behaviour, mission solvability, authoring
```

## House style

The code is written to be read. A few things worth matching:

- **Comments explain *why*, never *what*.** If a line needs a comment to say what it
  does, rename something instead. Most functions need no comment; the ones that do
  are usually guarding against a non-obvious failure.
- **Prose in the catalog and codex is the product.** It is written for a competent
  engineer who does not yet know this particular thing. Plain language, no
  exclamation marks, no "simply" or "just", no marketing. State the trade-off.
- **British spelling** in user-facing text (`utilisation`, `behaviour`, `analyse`).
- **Every property needs `help` and `impact`.** `help` says what the setting is;
  `impact` says what visibly changes when you move it. The second is where the
  teaching happens.
- **Use `danger` for the production footguns.** It feeds the node warning badge, the
  inspector and the architecture review at once.

## Colour and theming

There is one palette, defined as CSS custom properties in `src/styles.css`. Dark is
the base `@theme` block; `:root[data-theme='light']` redefines the same variable
names, so components use `bg-surface` and `text-ink-dim` and never a `dark:` variant.
An inline script in `index.html` stamps `data-theme` before the first paint — a React
effect would flash a full screen of the wrong colour.

- **Never write a hex literal in a component.** Add a token instead. Every light value
  was checked to clear 4.5:1 against the canvas ground; a stray literal will not be.
- **SVG presentation attributes do not substitute `var()`** in every browser. Apply
  colours through `style={{ fill }}` / `style={{ stroke }}`, or by class. This is why
  the minimap colours nodes with `nodeClassName` and why its `maskColor` is one of the
  two literals in the codebase (`CanvasControls.tsx`, commented).
- `--cw-glow` and `--cw-lift` exist because depth reads differently on each ground: a
  coloured glow is energy on black and a smudge on paper. Compose both; each theme
  zeroes the one it does not want.

## Adding things

### A cloud service

Add one `ResourceDef` to the right file under `src/catalog/providers/`, and export it
from that file's array. That is the whole change — the palette, canvas, inspector,
simulation, cost model and advisor all pick it up. `npm test` validates the structure,
including that every select default is a real option and every cost function returns a
finite number.

Never rename an `id`: saved diagrams and share links reference it.

### A codex entry

Add a `Concept` to the right file in `src/codex/topics/` and export it. Reference it
from a resource's `concepts` array or another entry's `related`. Tests fail on dangling
links. Set `widget` to attach an interactive explainer, and add an entry to `DEMOS` in
`src/codex/demos.ts` for a runnable illustration — two variants, with and without the
thing the entry is about, so the difference is something you watch.

### A mission

Add a `Mission` to `src/scenarios/missions.ts`, using the `diagram()` helper for the
starting architecture — it resolves edge flows from the catalog, so a nonsensical
connection throws at build time rather than shipping.

**Then add a solution to `tests/solvable.test.ts`.** That test proves the mission can
actually be completed, which is impossible to notice by hand once objectives get
interesting. It has already caught three missions that were unwinnable.

### An MCP tool

Add it in `mcp/server.ts` with a zod `inputSchema` and a description written for a
model that has never seen this app. Prefer returning structured JSON. `npm run build:mcp`
rebuilds; `tests/mcp.test.ts` asserts registration, because a malformed schema
otherwise only fails at connect time.

## Things that have bitten before

- **Zustand selectors must return stable references.** `useGame((s) => s.incidents.filter(…))`
  creates a new array every render and sends React into an infinite loop. Select the
  array, filter outside.
- **Spreading a partial config lets an explicit `undefined` overwrite a default.** This
  once turned the traffic rate into `NaN` and produced `null` metrics over MCP.
- **`backdrop-filter` makes an element the containing block for fixed-position
  descendants.** A `fixed inset-0` click-catcher inside the toolbar only covers the
  toolbar. Use a document-level `mousedown` listener instead.
- **Node sizes change once traffic arrives** (a telemetry strip appears), so anything
  that frames the canvas must re-fit *after* the first tick, not before.
- **The engine is the arbiter, not your intuition.** When a test asserting "scaling the
  app tier helps" fails, check whether the database was the bottleneck first. Several
  of the best lessons in the game are emergent behaviours found this way.

## Accuracy

Costs, capacities and latencies are simplified teaching figures chosen to make
trade-offs visible — never quotes, and labelled as such in the UI. Service behaviour,
failure modes and remediation advice aim to be correct; if you are unsure about a
detail, look it up rather than guessing. The value of this project is that the content
is trustworthy.

## Deployment

Cloudflare Pages, static, from `dist/`. `public/_redirects` gives the SPA its
client-side routing fallback and `public/_headers` sets security headers and immutable
caching — both are copied into `dist/` by the build.

`docker compose up --build` runs the app and the MCP server together on port 8080.
