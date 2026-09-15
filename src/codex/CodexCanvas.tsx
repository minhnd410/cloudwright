import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { useNavigate } from 'react-router-dom'
import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { ContainerNode, ResourceNode } from '@/canvas/nodes/ResourceNode'
import { FlowEdge } from '@/canvas/edges/FlowEdge'
import { SimViewContext } from '@/canvas/simView'
import { toFlow, toSimGraph } from '@/store/serialize'
import { tick } from '@/sim/engine'
import { makeIncident } from '@/sim/incidents'
import { getResource } from '@/catalog/registry'
import { formatCurrency } from '@/sim/cost'
import type { ActiveIncident, SimState } from '@/sim/types'
import type { CwEdge, CwNode } from '@/store/types'
import { useTabs } from '@/store/tabStore'
import type { Demo } from './demos'

const nodeTypes = { resource: ResourceNode, container: ContainerNode }
const edgeTypes = { flow: FlowEdge }
const PRO_OPTIONS = { hideAttribution: true }

/**
 * A self-contained, runnable illustration.
 *
 * It owns its own simulation state rather than the editor's, so a reader can
 * play with it without disturbing whatever they have open on the canvas — and
 * the whole thing can be opened properly in one click when they want to.
 */
export function CodexCanvas({ demo, conceptTitle }: { demo: Demo; conceptTitle: string }) {
  const [variantId, setVariantId] = useState(demo.variants[0].id)
  const variant = demo.variants.find((v) => v.id === variantId) ?? demo.variants[0]

  return (
    <figure className="my-6 overflow-hidden rounded-xl border border-line bg-abyss/60">
      <figcaption className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-signal">Try it</span>
        {demo.variants.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {demo.variants.map((v) => (
              <button
                key={v.id}
                onClick={() => setVariantId(v.id)}
                className={clsx(
                  'focusable rounded-md border px-2 py-0.5 text-[11px] transition',
                  v.id === variantId
                    ? 'border-signal/60 bg-signal/12 text-signal'
                    : 'border-line text-ink-faint hover:border-line-bright hover:text-ink-dim',
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
        <VariantOpener variant={variant} title={conceptTitle} />
      </figcaption>

      {/* Keyed on the variant so switching remounts with clean state rather
          than resetting it from inside an effect. */}
      <DemoRunner key={variantId} demo={demo} variant={variant} />
    </figure>
  )
}

function DemoRunner({ demo, variant }: { demo: Demo; variant: Demo['variants'][number] }) {
  const diagram = useMemo(() => variant.build(), [variant])
  const flow = useMemo(() => toFlow(diagram), [diagram])
  const graph = useMemo(() => toSimGraph(diagram), [diagram])

  const incidents = useMemo<ActiveIncident[]>(
    () =>
      (variant.incidents ?? []).flatMap((seed) => {
        const node = diagram.nodes.find((n) => n.id === seed.nodeId)
        const mode = node ? getResource(node.defId)?.sim?.failureModes?.find((m) => m.id === seed.modeId) : undefined
        return mode ? [makeIncident(seed.nodeId, mode, 0)] : []
      }),
    [variant, diagram],
  )

  const [sim, setSim] = useState<SimState | null>(null)
  const [playing, setPlaying] = useState(demo.autoplay ?? false)
  const latest = useRef<SimState | undefined>(undefined)

  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      const next = tick({ graph, incidents, previous: latest.current })
      latest.current = next
      setSim(next)
    }, 620)
    return () => clearInterval(timer)
  }, [playing, graph, incidents])

  const view = useMemo(() => ({ sim, speed: playing ? 1 : 0, incidents }), [sim, playing, incidents])

  return (
    <>
      <div className="relative h-[360px] bg-void">
        <SimViewContext.Provider value={view}>
          <ReactFlowProvider>
            <EmbeddedFlow nodes={flow.nodes} edges={flow.edges} />
          </ReactFlowProvider>
        </SimViewContext.Provider>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-void via-void/80 to-transparent px-3 pb-2 pt-6">
          <button
            onClick={() => setPlaying((v) => !v)}
            className="pointer-events-auto focusable grid size-7 shrink-0 place-items-center rounded-lg bg-signal/15 text-signal transition hover:bg-signal/25"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z" /></svg>
            )}
          </button>
          <button
            onClick={() => {
              latest.current = undefined
              setSim(null)
            }}
            className="pointer-events-auto focusable grid size-7 shrink-0 place-items-center rounded-lg text-ink-faint transition hover:bg-raised hover:text-ink"
            aria-label="Reset"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 4v4h4" />
            </svg>
          </button>

          {sim ? (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono text-[10.5px] tabular-nums">
              <Readout label="rps" value={fmt(sim.metrics.totalServed)} />
              <Readout
                label="err"
                value={`${(sim.metrics.errorRate * 100).toFixed(1)}%`}
                tone={sim.metrics.errorRate > 0.05 ? 'bad' : sim.metrics.errorRate > 0.005 ? 'warn' : 'good'}
              />
              <Readout label="p95" value={`${sim.metrics.p95LatencyMs.toFixed(0)}ms`} />
              <Readout label="cost" value={`${formatCurrency(sim.metrics.costPerMonth)}/mo`} tone="coin" />
              {sim.metrics.compromise > 0 && <Readout label="breach" value="yes" tone="bad" />}
            </div>
          ) : (
            <span className="text-[10.5px] text-ink-faint">Press play to send traffic through it.</span>
          )}
        </div>
      </div>

      <p className="border-t border-line px-3 py-2 text-[11px] leading-relaxed text-ink-faint">
        <span className="text-ink-dim">{variant.note}</span> {demo.caption}
      </p>
    </>
  )
}

function EmbeddedFlow({ nodes, edges }: { nodes: CwNode[]; edges: CwEdge[] }) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    // Fit once the nodes have been measured, then again once the container has
    // settled — otherwise a first frame with no dimensions leaves it off-centre.
    const fit = () => void fitView({ duration: 0, padding: 0.12, maxZoom: 1.05 })
    const first = setTimeout(fit, 90)
    const second = setTimeout(fit, 400)
    window.addEventListener('resize', fit)
    return () => {
      clearTimeout(first)
      clearTimeout(second)
      window.removeEventListener('resize', fit)
    }
  }, [fitView])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      proOptions={PRO_OPTIONS}
      fitView
      fitViewOptions={{ padding: 0.14, maxZoom: 0.9 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnScroll={false}
      zoomOnScroll={false}
      preventScrolling={false}
      minZoom={0.2}
      maxZoom={1.4}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--color-line)" className="opacity-50" />
    </ReactFlow>
  )
}

function VariantOpener({ variant, title }: { variant: Demo['variants'][number]; title: string }) {
  const navigate = useNavigate()
  const open = useTabs((s) => s.open)

  return (
    <button
      onClick={() => {
        open({ ...variant.build(), name: `${title} — ${variant.label}` })
        navigate('/build')
      }}
      className="focusable ml-auto shrink-0 rounded-md border border-line px-2 py-0.5 text-[11px] text-ink-dim transition hover:border-signal/45 hover:text-signal"
    >
      Open in the canvas →
    </button>
  )
}

function fmt(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  return v.toFixed(0)
}

function Readout({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'good' | 'warn' | 'bad' | 'coin' }) {
  const colour = { default: 'text-ink-dim', good: 'text-signal', warn: 'text-ember', bad: 'text-alarm', coin: 'text-coin' }[tone]
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-[9px] uppercase tracking-wider text-ink-faint">{label}</span>
      <span className={clsx('font-semibold', colour)}>{value}</span>
    </span>
  )
}
