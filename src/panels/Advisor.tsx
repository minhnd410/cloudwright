import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { PILLAR_META, scoreFindings, SEVERITY_ORDER, type Finding, type Pillar, type Severity } from '@/sim/advisor'
import { useGame } from '@/store/gameStore'
import { conceptLabel } from '@/codex/labels'
import { EmptyHint, Meter } from '@/ui/primitives'

const SEVERITY_META: Record<Severity, { label: string; color: string; bg: string }> = {
  critical: { label: 'Critical', color: 'var(--color-toxic)', bg: 'color-mix(in oklab, var(--color-toxic) 12%, transparent)' },
  high: { label: 'High', color: 'var(--color-alarm)', bg: 'color-mix(in oklab, var(--color-alarm) 12%, transparent)' },
  medium: { label: 'Medium', color: 'var(--color-ember)', bg: 'color-mix(in oklab, var(--color-ember) 12%, transparent)' },
  low: { label: 'Low', color: 'var(--color-flux)', bg: 'color-mix(in oklab, var(--color-flux) 12%, transparent)' },
  good: { label: 'Good', color: 'var(--color-signal)', bg: 'color-mix(in oklab, var(--color-signal) 12%, transparent)' },
}

export function Advisor() {
  const findings = useGame((s) => s.findings)
  const nodeCount = useGame((s) => s.nodes.length)
  const select = useGame((s) => s.select)
  const [pillar, setPillar] = useState<Pillar | 'all'>('all')

  const { score, byPillar } = useMemo(() => scoreFindings(findings), [findings])
  const filtered = useMemo(
    () => (pillar === 'all' ? findings : findings.filter((f) => f.pillar === pillar)),
    [findings, pillar],
  )

  const counts = useMemo(() => {
    const c = {} as Record<Severity, number>
    for (const s of SEVERITY_ORDER) c[s] = 0
    for (const f of findings) c[f.severity]++
    return c
  }, [findings])

  if (nodeCount === 0) {
    return <EmptyHint>Build something and this panel will review it the way a senior engineer would.</EmptyHint>
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-3">
        <div className="flex items-end gap-3">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">Architecture score</div>
            <div
              className="font-mono text-[28px] font-bold leading-none tabular-nums"
              style={{ color: score >= 80 ? 'var(--color-signal)' : score >= 55 ? 'var(--color-ember)' : 'var(--color-alarm)' }}
            >
              {score}
            </div>
          </div>
          <div className="flex-1 space-y-1 pb-0.5">
            {(Object.keys(PILLAR_META) as Pillar[]).map((p) => (
              <button
                key={p}
                onClick={() => setPillar(pillar === p ? 'all' : p)}
                className="focusable flex w-full items-center gap-2 rounded px-1 py-px transition hover:bg-raised"
                title={PILLAR_META[p].blurb}
              >
                <span className={clsx('w-[58px] shrink-0 text-left text-[9.5px]', pillar === p ? 'text-ink' : 'text-ink-faint')}>
                  {PILLAR_META[p].label}
                </span>
                <Meter
                  value={byPillar[p]}
                  max={100}
                  height={3}
                  color={byPillar[p] >= 80 ? 'var(--color-signal)' : byPillar[p] >= 55 ? 'var(--color-ember)' : 'var(--color-alarm)'}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s) => (
            <span
              key={s}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
              style={{ color: SEVERITY_META[s].color, background: SEVERITY_META[s].bg }}
            >
              {counts[s]} {SEVERITY_META[s].label.toLowerCase()}
            </span>
          ))}
          {pillar !== 'all' && (
            <button onClick={() => setPillar('all')} className="focusable rounded px-1.5 py-0.5 text-[10px] text-ink-faint hover:text-ink-dim">
              show all
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5 pb-8">
        {filtered.length === 0 && (
          <EmptyHint>Nothing flagged here. Try adding traffic and running the simulation.</EmptyHint>
        )}
        <ul className="space-y-2">
          {filtered.map((f) => (
            <FindingCard key={f.id} finding={f} onSelect={() => f.nodeIds[0] && select(f.nodeIds[0])} />
          ))}
        </ul>
      </div>
    </div>
  )
}

function FindingCard({ finding, onSelect }: { finding: Finding; onSelect: () => void }) {
  const [open, setOpen] = useState(false)
  const meta = SEVERITY_META[finding.severity]


  return (
    <li
      className="overflow-hidden rounded-lg border bg-raised/40 transition-colors"
      style={{ borderColor: `color-mix(in oklab, ${meta.color} 28%, transparent)` }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="focusable flex w-full items-start gap-2 p-2.5 text-left transition hover:bg-raised/70"
      >
        <span
          className="mt-0.5 shrink-0 rounded px-1 py-px text-[8.5px] font-bold uppercase tracking-wider"
          style={{ color: meta.color, background: meta.bg }}
        >
          {meta.label}
        </span>
        <span className="min-w-0 flex-1 text-[12px] font-medium leading-snug text-ink">{finding.title}</span>
        <svg
          className={clsx('mt-1 shrink-0 text-ink-faint transition-transform', open && 'rotate-90')}
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>

      {open && (
        <div className="space-y-2 border-t border-line/70 p-2.5" style={{ animation: 'var(--animate-float-in)' }}>
          <p className="text-[11.5px] leading-relaxed text-ink-dim">{finding.detail}</p>
          {finding.fix && (
            <p className="rounded-md border-l-2 border-signal/50 bg-signal/5 py-1.5 pl-2.5 pr-2 text-[11.5px] leading-relaxed text-ink-dim">
              <span className="font-medium text-signal">Fix — </span>{finding.fix}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {finding.nodeIds.length > 0 && (
              <button
                onClick={onSelect}
                className="focusable rounded-md bg-raised px-2 py-1 text-[10.5px] text-ink-dim transition hover:bg-line hover:text-ink"
              >
                Show on canvas
              </button>
            )}
            {finding.concept && (
              <Link
                to={`/codex/${finding.concept}`}
                className="focusable rounded-md border border-line px-2 py-1 text-[10.5px] text-ink-faint transition hover:border-signal/45 hover:text-signal"
              >
                Read: {conceptLabel(finding.concept)}
              </Link>
            )}
          </div>
        </div>
      )}
    </li>
  )
}
