import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { useGame } from '@/store/gameStore'
import { formatCurrency } from '@/sim/cost'
import { ATTACK_META } from '@/sim/attacks'
import { EmptyHint, Sparkline, Stat, Tabs } from '@/ui/primitives'
import type { EventSeverity } from '@/sim/types'

type Tab = 'metrics' | 'events' | 'incidents' | 'security'

const SEVERITY_STYLE: Record<EventSeverity, { color: string; label: string }> = {
  info: { color: 'var(--color-ink-faint)', label: 'INFO' },
  success: { color: 'var(--color-signal)', label: ' OK ' },
  warn: { color: 'var(--color-ember)', label: 'WARN' },
  error: { color: 'var(--color-alarm)', label: 'ERR ' },
  critical: { color: 'var(--color-toxic)', label: 'CRIT' },
}

function fmtRps(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  return v.toFixed(0)
}

export function Observability() {
  const [tab, setTab] = useState<Tab>('metrics')
  const sim = useGame((s) => s.sim)
  const events = useGame((s) => s.events)
  const incidents = useGame((s) => s.incidents)

  const criticalCount = events.filter((e) => e.severity === 'critical' || e.severity === 'error').length
  const breaches = useMemo(
    () => Object.values(sim?.nodes ?? {}).filter((n) => n.breachedBy.length > 0),
    [sim],
  )

  return (
    <div className="flex h-full flex-col">
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        dense
        tabs={[
          { id: 'metrics', label: 'Metrics' },
          { id: 'events', label: 'Events', badge: criticalCount },
          { id: 'incidents', label: 'Incidents', badge: incidents.length },
          { id: 'security', label: 'Security', badge: breaches.length },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'metrics' && <Metrics />}
        {tab === 'events' && <EventLog />}
        {tab === 'incidents' && <Incidents />}
        {tab === 'security' && <SecurityPanel />}
      </div>
    </div>
  )
}

function Metrics() {
  const sim = useGame((s) => s.sim)
  const history = useGame((s) => s.history)

  if (!sim) {
    return <EmptyHint>Press play to start the simulation. Traffic will begin flowing and these charts will fill.</EmptyHint>
  }

  const m = sim.metrics
  const errorPct = m.errorRate * 100

  return (
    <div className="grid grid-cols-2 gap-3 p-3 lg:grid-cols-4">
      <Panel title="Throughput" value={`${fmtRps(m.totalServed)} rps`} sub={`of ${fmtRps(m.totalDemand)} requested`}>
        <Sparkline data={history.served} color="var(--color-signal)" max={Math.max(...history.demand, 1)} />
      </Panel>

      <Panel
        title="Error rate"
        value={`${errorPct.toFixed(errorPct < 10 ? 2 : 1)}%`}
        tone={errorPct > 5 ? 'bad' : errorPct > 0.5 ? 'warn' : 'good'}
        sub={errorPct > 0.1 ? `${fmtRps(m.totalDemand - m.totalServed)} failing per second` : 'within budget'}
      >
        <Sparkline data={history.errorRate} color="var(--color-alarm)" max={Math.max(0.05, ...history.errorRate)} />
      </Panel>

      <Panel
        title="Latency p95"
        value={`${m.p95LatencyMs.toFixed(0)}ms`}
        tone={m.p95LatencyMs > 800 ? 'bad' : m.p95LatencyMs > 350 ? 'warn' : 'good'}
        sub={`p50 ${m.p50LatencyMs.toFixed(0)}ms`}
      >
        <Sparkline data={history.p95} color="var(--color-flux)" />
      </Panel>

      <Panel
        title="Cost"
        value={`${formatCurrency(m.costPerHour)}/h`}
        sub={`${formatCurrency(m.costPerMonth)} per month`}
      >
        <Sparkline data={history.cost} color="var(--color-coin)" />
      </Panel>

      <div className="col-span-2 flex items-center gap-4 rounded-lg border border-line bg-raised/30 px-3 py-2.5 lg:col-span-4">
        <Stat
          label="Modelled availability"
          value={`${(m.availability * 100).toFixed(m.availability > 0.999 ? 3 : 2)}%`}
          tone={m.availability > 0.999 ? 'good' : m.availability > 0.99 ? 'warn' : 'bad'}
          sub={`${downtimeLabel(m.availability)} per month`}
        />
        <div className="h-8 w-px bg-line" />
        <Stat
          label="Compromise"
          value={m.compromise > 0 ? `${(m.compromise * 100).toFixed(0)}%` : 'none'}
          tone={m.compromise > 0 ? 'bad' : 'good'}
          sub={m.compromise > 0 ? 'hostile traffic reached a target' : 'no successful attacks'}
        />
        <div className="h-8 w-px bg-line" />
        <Stat label="Simulated time" value={`${Math.floor(sim.elapsed / 60)}m ${Math.floor(sim.elapsed % 60)}s`} sub={`tick ${sim.tick}`} />
      </div>
    </div>
  )
}

function downtimeLabel(availability: number) {
  const minutes = (1 - availability) * 43800
  if (minutes < 1) return `${(minutes * 60).toFixed(0)}s`
  if (minutes < 90) return `${minutes.toFixed(0)} min`
  return `${(minutes / 60).toFixed(1)} h`
}

function Panel({
  title, value, sub, tone = 'default', children,
}: {
  title: string
  value: string
  sub?: string
  tone?: 'default' | 'good' | 'warn' | 'bad'
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-line bg-raised/30 p-2.5">
      <Stat label={title} value={value} sub={sub} tone={tone} />
      <div className="mt-2">{children}</div>
    </div>
  )
}

function EventLog() {
  const events = useGame((s) => s.events)
  const select = useGame((s) => s.select)
  const endRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(true)

  useEffect(() => {
    if (pinned) endRef.current?.scrollIntoView({ block: 'end' })
  }, [events, pinned])

  if (events.length === 0) {
    return <EmptyHint>No events yet. Run the simulation, or inject a failure from a resource&rsquo;s Failures tab.</EmptyHint>
  }

  return (
    <div
      className="p-2 font-mono text-[11px] leading-relaxed"
      onScroll={(e) => {
        const el = e.currentTarget
        setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 40)
      }}
    >
      {events.map((e) => (
        <button
          key={e.id}
          onClick={() => e.nodeId && select(e.nodeId)}
          className="focusable flex w-full items-start gap-2 rounded px-1.5 py-0.5 text-left transition hover:bg-raised"
        >
          <span className="shrink-0 tabular-nums text-ink-faint">{String(e.tick).padStart(4, '0')}</span>
          <span className="shrink-0 font-semibold" style={{ color: SEVERITY_STYLE[e.severity].color }}>
            {SEVERITY_STYLE[e.severity].label}
          </span>
          <span className="w-[92px] shrink-0 truncate text-ink-faint">{e.source}</span>
          <span className="min-w-0 flex-1 text-ink-dim">{e.message}</span>
        </button>
      ))}
      <div ref={endRef} />
    </div>
  )
}

function Incidents() {
  const incidents = useGame((s) => s.incidents)
  const nodes = useGame((s) => s.nodes)
  const clear = useGame((s) => s.clearIncident)
  const clearAll = useGame((s) => s.clearAllIncidents)
  const randomIncident = useGame((s) => s.randomIncident)
  const chaos = useGame((s) => s.chaosMode)
  const toggleChaos = useGame((s) => s.toggleChaos)
  const select = useGame((s) => s.select)

  return (
    <div className="p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={randomIncident}
          className="focusable rounded-lg border border-line bg-raised px-2.5 py-1.5 text-[11px] font-medium text-ink-dim transition hover:border-alarm/50 hover:text-alarm"
        >
          Break something random
        </button>
        <button
          onClick={toggleChaos}
          className={clsx(
            'focusable rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition',
            chaos ? 'border-alarm/60 bg-alarm/12 text-alarm' : 'border-line bg-raised text-ink-dim hover:text-ink',
          )}
        >
          Chaos mode {chaos ? 'on' : 'off'}
        </button>
        {incidents.length > 0 && (
          <button
            onClick={clearAll}
            className="focusable rounded-lg px-2.5 py-1.5 text-[11px] text-ink-faint transition hover:text-signal"
          >
            Resolve all
          </button>
        )}
      </div>

      {incidents.length === 0 ? (
        <p className="mt-4 text-[11.5px] leading-relaxed text-ink-faint">
          Nothing is broken. Inject a specific failure from a resource&rsquo;s Failures tab, break something at random,
          or turn on chaos mode and let the simulation surprise you.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {incidents.map((inc) => {
            const node = nodes.find((n) => n.id === inc.nodeId)
            return (
              <li key={inc.id} className="rounded-lg border border-alarm/35 bg-alarm/6 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-[12px] font-semibold text-ink">
                      {inc.label}
                      <button
                        onClick={() => select(inc.nodeId)}
                        className="focusable ml-2 rounded bg-raised px-1.5 py-px text-[10px] font-normal text-ink-faint transition hover:text-ink"
                      >
                        {node?.data.label ?? inc.nodeId}
                      </button>
                    </h4>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-dim">{inc.symptom}</p>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
                      <span className="text-signal">Remedy — </span>{inc.remedy}
                    </p>
                  </div>
                  <button
                    onClick={() => clear(inc.id)}
                    className="focusable shrink-0 rounded-md bg-signal/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-signal transition hover:bg-signal/22"
                  >
                    resolve
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function SecurityPanel() {
  const sim = useGame((s) => s.sim)
  const nodes = useGame((s) => s.nodes)
  const select = useGame((s) => s.select)
  const attacksEnabled = useGame((s) => s.attacksEnabled)
  const setAttacksEnabled = useGame((s) => s.setAttacksEnabled)

  const breached = Object.values(sim?.nodes ?? {}).filter((n) => n.breachedBy.length > 0)
  const underPressure = Object.values(sim?.nodes ?? {})
    .filter((n) => n.attackPressure > 0.02 && n.breachedBy.length === 0)
    .sort((a, b) => b.attackPressure - a.attackPressure)

  return (
    <div className="p-3">
      <label className="flex items-center gap-2 text-[11px] text-ink-dim">
        <input
          type="checkbox"
          checked={attacksEnabled}
          onChange={(e) => setAttacksEnabled(e.target.checked)}
          className="focusable accent-toxic"
        />
        Evaluate attacks during simulation
      </label>

      {breached.length === 0 && underPressure.length === 0 && (
        <p className="mt-4 text-[11.5px] leading-relaxed text-ink-faint">
          No hostile traffic in the graph. Drop a <span className="text-toxic">Threat Actor</span> onto the canvas,
          choose an attack vector, and connect it to your entry point to see which of your controls actually stop it.
        </p>
      )}

      {breached.length > 0 && (
        <div className="mt-3">
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-toxic">Successful attacks</h4>
          <ul className="mt-2 space-y-2">
            {breached.map((n) => {
              const node = nodes.find((x) => x.id === n.id)
              return n.breachedBy.map((vector) => {
                const meta = ATTACK_META[vector]
                return (
                  <li key={`${n.id}:${vector}`} className="rounded-lg border border-toxic/35 bg-toxic/6 p-2.5">
                    <div className="flex items-center gap-2">
                      <h5 className="text-[12px] font-semibold text-ink">{meta.label}</h5>
                      <button
                        onClick={() => select(n.id)}
                        className="focusable rounded bg-raised px-1.5 py-px text-[10px] text-ink-faint transition hover:text-ink"
                      >
                        reached {node?.data.label}
                      </button>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-ink-dim">{meta.how}</p>
                    <div className="mt-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">What would stop it</div>
                      <ul className="mt-1 space-y-0.5">
                        {meta.defences.map((d, i) => (
                          <li key={i} className="flex gap-1.5 text-[11px] leading-relaxed text-ink-dim">
                            <span className="text-signal">{i + 1}.</span>
                            {d}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                )
              })
            })}
          </ul>
        </div>
      )}

      {underPressure.length > 0 && (
        <div className="mt-4">
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            Under pressure but holding
          </h4>
          <ul className="mt-2 space-y-1">
            {underPressure.slice(0, 8).map((n) => {
              const node = nodes.find((x) => x.id === n.id)
              return (
                <li key={n.id} className="flex items-center gap-2 text-[11px]">
                  <button onClick={() => select(n.id)} className="focusable w-32 shrink-0 truncate text-left text-ink-dim hover:text-ink">
                    {node?.data.label}
                  </button>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-toxic/70" style={{ width: `${n.attackPressure * 100}%` }} />
                  </div>
                  <span className="w-9 shrink-0 text-right font-mono text-[10px] tabular-nums text-ink-faint">
                    {(n.attackPressure * 100).toFixed(0)}%
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-[10.5px] leading-relaxed text-ink-faint">
            Residual attack strength after your controls. Anything above roughly 22% breaches a vulnerable target.
          </p>
        </div>
      )}
    </div>
  )
}
