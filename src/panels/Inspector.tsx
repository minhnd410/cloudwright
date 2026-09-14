import { useState } from 'react'
import { getResource, PROVIDER_META } from '@/catalog/registry'
import { FLOW_META } from '@/catalog/schema/flows'
import { useGame } from '@/store/gameStore'
import { ResourceIcon } from '@/ui/ResourceIcon'
import { EmptyHint, Stat, Tabs } from '@/ui/primitives'
import { PropertyEditor } from './inspector/PropertyEditor'
import { SetupGuide } from './inspector/SetupGuide'
import { FailureModes } from './inspector/FailureModes'
import { Explain } from './inspector/Explain'
import { currentSummary } from './inspector/impact'

type Tab = 'configure' | 'explain' | 'build' | 'failures'

export function Inspector() {
  const nodeId = useGame((s) => s.selectedNodeId)

  const node = useGame((s) => s.nodes.find((n) => n.id === s.selectedNodeId))
  const edge = useGame((s) => s.edges.find((e) => e.id === s.selectedEdgeId))
  const state = useGame((s) => (nodeId ? s.sim?.nodes[nodeId] : undefined))
  const setProp = useGame((s) => s.setProp)
  const rename = useGame((s) => s.renameNode)
  const remove = useGame((s) => s.removeNodes)

  // Selecting a different resource starts you on Configure, without an effect:
  // the chosen tab is remembered against the node it was chosen for.
  const [tabFor, setTabFor] = useState<{ nodeId: string | null; tab: Tab }>({ nodeId: null, tab: 'configure' })
  const tab: Tab = tabFor.nodeId === nodeId ? tabFor.tab : 'configure'
  const setTab = (next: Tab) => setTabFor({ nodeId, tab: next })

  if (edge && !node) return <EdgeInspector edgeId={edge.id} />
  if (!node) {
    return (
      <EmptyHint>
        Select a resource to configure it, read what it does, and see how you would build the real thing.
      </EmptyHint>
    )
  }

  const def = getResource(node.data.defId)
  if (!def) return <EmptyHint>This node references an unknown resource.</EmptyHint>

  const provider = PROVIDER_META[def.provider]
  const summary = currentSummary(def, node.data.props, state?.served ?? 0)
  const failureCount = def.sim?.failureModes?.length ?? 0
  // A `cost` block that only carries a note ("Pods do not bill directly") is
  // not a price; showing $0.000/h for it is worse than showing nothing.
  const hasPricing = Boolean(
    def.cost && (def.cost.hourly || def.cost.perMillionRequests || def.cost.perGbEgress || def.cost.perGbMonth),
  )

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-line p-3">
        <div className="flex items-start gap-2.5">
          <span
            className="mt-0.5 shrink-0 rounded-lg p-2"
            style={{ background: `color-mix(in oklab, ${provider.color} 13%, transparent)`, color: provider.color }}
          >
            <ResourceIcon icon={def.icon} archetype={def.archetype} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <input
              value={node.data.label}
              onChange={(e) => rename(node.id, e.target.value)}
              className="focusable -mx-1 w-full rounded bg-transparent px-1 text-[14px] font-semibold text-ink outline-none transition hover:bg-raised"
              aria-label="Resource name"
            />
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
              <span style={{ color: provider.color }}>{provider.label}</span>
              <span className="text-ink-faint">·</span>
              <span className="truncate text-ink-faint">{def.name}</span>
            </div>
          </div>
          <button
            onClick={() => remove([node.id])}
            title="Delete resource"
            className="focusable shrink-0 rounded p-1.5 text-ink-faint transition hover:bg-alarm/15 hover:text-alarm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13M9 7V4h6v3" />
            </svg>
          </button>
        </div>

        {/* Live numbers */}
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
          <Stat label="Capacity" value={summary.fmtRps(summary.capacity)} sub="requests per second" />
          <Stat
            label="Latency"
            value={state ? `${state.latencyMs.toFixed(0)}ms` : summary.fmtMs(summary.latency)}
            sub={state ? 'end to end' : 'added by this hop'}
            tone={state && state.latencyMs > 400 ? 'warn' : 'default'}
          />
          <Stat
            label="Availability"
            value={summary.fmtNines(summary.availability)}
            sub={`${downtimeLabel(summary.availability)} per month`}
            tone={summary.availability < 0.99 ? 'warn' : 'good'}
          />
          {hasPricing ? (
            <Stat
              label="Cost"
              value={summary.fmtUsd(summary.cost)}
              sub={`${summary.fmtUsd(summary.cost * 730).replace('/h', '')} per month`}
            />
          ) : (
            <Stat label="Cost" value="—" sub="no direct charge" />
          )}
        </div>

        {state && state.demand > 0 && (
          <div className="mt-2.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.min(state.utilisation * 100, 100)}%`,
                  background: state.utilisation > 1 ? 'var(--color-alarm)' : state.utilisation > 0.85 ? 'var(--color-ember)' : 'var(--color-signal)',
                }}
              />
            </div>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-faint">
              {(state.utilisation * 100).toFixed(0)}% used
            </span>
          </div>
        )}
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        dense
        tabs={[
          { id: 'configure', label: 'Configure' },
          { id: 'explain', label: 'Explain' },
          { id: 'build', label: 'Build it' },
          { id: 'failures', label: 'Failures', badge: failureCount },
        ]}
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        {tab === 'configure' && (
          <PropertyEditor
            def={def}
            props={node.data.props}
            servedRps={state?.served ?? 0}
            onChange={(key, value) => setProp(node.id, key, value)}
          />
        )}
        {tab === 'explain' && <Explain def={def} />}
        {tab === 'build' && <SetupGuide def={def} />}
        {tab === 'failures' && <FailureModes def={def} nodeId={node.id} />}
      </div>
    </div>
  )
}

function downtimeLabel(availability: number) {
  const minutes = (1 - availability) * 43800
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))}s`
  if (minutes < 90) return `${minutes.toFixed(0)} min`
  return `${(minutes / 60).toFixed(1)} h`
}

function EdgeInspector({ edgeId }: { edgeId: string }) {
  const edge = useGame((s) => s.edges.find((e) => e.id === edgeId))
  const state = useGame((s) => s.sim?.edges[edgeId])
  const nodes = useGame((s) => s.nodes)
  const removeEdge = useGame((s) => s.onEdgesChange)

  if (!edge?.data) return <EmptyHint>Select a connection.</EmptyHint>
  const meta = FLOW_META[edge.data.flow]
  const source = nodes.find((n) => n.id === edge.source)
  const target = nodes.find((n) => n.id === edge.target)

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ background: meta.color }} />
              <h2 className="text-[14px] font-semibold text-ink">{meta.label}</h2>
              <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[9px] text-ink-faint">OSI L{meta.osi}</span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-ink-faint">
              {source?.data.label} → {target?.data.label}
              {meta.port ? `  :${meta.port}` : ''}
            </p>
          </div>
          <button
            onClick={() => removeEdge([{ id: edgeId, type: 'remove' }])}
            title="Delete connection"
            className="focusable shrink-0 rounded p-1.5 text-ink-faint transition hover:bg-alarm/15 hover:text-alarm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13M9 7V4h6v3" />
            </svg>
          </button>
        </div>

        {state?.active && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="Throughput" value={`${state.throughput < 1000 ? state.throughput.toFixed(0) : `${(state.throughput / 1000).toFixed(1)}k`}`} sub="req/s" />
            <Stat label="Errors" value={`${(state.errorRate * 100).toFixed(1)}%`} tone={state.errorRate > 0.05 ? 'bad' : 'good'} />
            <Stat label="Hostile" value={`${(state.attackShare * 100).toFixed(0)}%`} tone={state.attackShare > 0.1 ? 'bad' : 'default'} />
          </div>
        )}
      </div>

      <div className="space-y-4 overflow-y-auto p-3">
        <p className="text-[12px] leading-relaxed text-ink-dim">{meta.blurb}</p>
        {edge.data.flows.length > 1 && (
          <div>
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
              Also possible on this link
            </h4>
            <ul className="mt-2 space-y-1">
              {edge.data.flows.filter((f) => f !== edge.data!.flow).map((f) => (
                <li key={f} className="flex items-center gap-2 text-[11.5px] text-ink-dim">
                  <span className="size-1.5 rounded-full" style={{ background: FLOW_META[f].color }} />
                  {FLOW_META[f].label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
