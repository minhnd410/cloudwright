import { useState } from 'react'
import clsx from 'clsx'
import { Link, useNavigate } from 'react-router-dom'
import { useGame, type SimSpeed } from '@/store/gameStore'
import { SHORTCUTS } from './useSimLoop'
import { formatCurrency } from '@/sim/cost'
import { serialize, encodeShareLink } from '@/store/serialize'
import { Logo } from '@/ui/Logo'

export function TopBar() {
  const name = useGame((s) => s.name)
  const setName = useGame((s) => s.setName)
  const speed = useGame((s) => s.speed)
  const setSpeed = useGame((s) => s.setSpeed)
  const resetSim = useGame((s) => s.resetSim)
  const sim = useGame((s) => s.sim)
  const score = useGame((s) => s.score)
  const loadMultiplier = useGame((s) => s.loadMultiplier)
  const setLoadMultiplier = useGame((s) => s.setLoadMultiplier)

  const metrics = sim?.metrics
  const errorPct = (metrics?.errorRate ?? 0) * 100

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-abyss/90 px-3 backdrop-blur-xl">
      <Link to="/" className="focusable flex shrink-0 items-center gap-2 rounded pr-1" title="Cloudwright home">
        <Logo size={22} />
        <span className="hidden text-[13px] font-semibold tracking-tight text-ink sm:block">Cloudwright</span>
      </Link>

      <div className="h-5 w-px bg-line" />

      <HistoryButtons />

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="focusable min-w-0 max-w-[220px] flex-1 rounded bg-transparent px-1.5 py-1 text-[12.5px] text-ink-dim outline-none transition hover:bg-raised focus:bg-raised sm:flex-none"
        aria-label="Diagram name"
      />

      {/* Transport */}
      <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-line bg-raised/60 p-0.5">
        <TransportButton
          active={speed === 0}
          onClick={() => setSpeed(0)}
          label="Pause (space)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        </TransportButton>
        {([1, 2, 4] as SimSpeed[]).map((s) => (
          <TransportButton key={s} active={speed === s} onClick={() => setSpeed(s)} label={`${s}× speed`}>
            <span className="font-mono text-[11px] font-semibold">{s}×</span>
          </TransportButton>
        ))}
        <button
          onClick={resetSim}
          title="Reset simulation (r)"
          className="focusable ml-0.5 grid size-7 place-items-center rounded-md text-ink-faint transition hover:bg-line hover:text-ink"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 4v4h4" />
          </svg>
        </button>
      </div>

      {/* Load multiplier */}
      <div className="hidden shrink-0 items-center gap-1.5 md:flex" title="Multiply all client traffic">
        <span className="text-[10px] uppercase tracking-wider text-ink-faint">Load</span>
        <input
          type="range" min={0.25} max={20} step={0.25}
          value={loadMultiplier}
          onChange={(e) => setLoadMultiplier(Number(e.target.value))}
          className="focusable h-1 w-20 cursor-pointer appearance-none rounded-full bg-line
            [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-flux"
        />
        <span className="w-8 font-mono text-[10.5px] tabular-nums text-ink-dim">{loadMultiplier}×</span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        {metrics && (
          <div className="hidden items-center gap-3 font-mono text-[11px] tabular-nums lg:flex">
            <Readout label="rps" value={fmt(metrics.totalServed)} />
            <Readout
              label="err"
              value={`${errorPct.toFixed(errorPct < 10 ? 1 : 0)}%`}
              tone={errorPct > 5 ? 'bad' : errorPct > 0.5 ? 'warn' : 'good'}
            />
            <Readout
              label="p95"
              value={`${metrics.p95LatencyMs.toFixed(0)}ms`}
              tone={metrics.p95LatencyMs > 800 ? 'bad' : metrics.p95LatencyMs > 350 ? 'warn' : 'default'}
            />
            <Readout label="cost" value={`${formatCurrency(metrics.costPerMonth)}/mo`} tone="coin" />
          </div>
        )}

        <div
          className="hidden items-center gap-1.5 rounded-lg border border-line bg-raised/60 px-2 py-1 sm:flex"
          title="Architecture review score"
        >
          <span className="text-[9.5px] uppercase tracking-wider text-ink-faint">Score</span>
          <span
            className="font-mono text-[13px] font-bold tabular-nums"
            style={{ color: score >= 80 ? 'var(--color-signal)' : score >= 55 ? 'var(--color-ember)' : 'var(--color-alarm)' }}
          >
            {score}
          </span>
        </div>

        <ShortcutsHelp />
        <NavLinks />
      </div>
    </header>
  )
}

function HistoryButtons() {
  const undo = useGame((s) => s.undo)
  const redo = useGame((s) => s.redo)
  const canUndo = useGame((s) => s.canUndo)
  const canRedo = useGame((s) => s.canRedo)

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        onClick={undo}
        disabled={!canUndo}
        title="Undo (⌘Z)"
        aria-label="Undo"
        className="focusable grid size-7 place-items-center rounded-md text-ink-faint transition enabled:hover:bg-raised enabled:hover:text-ink disabled:opacity-30"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8h11a6 6 0 0 1 0 12h-4" /><path d="m7 4-4 4 4 4" />
        </svg>
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        title="Redo (⇧⌘Z)"
        aria-label="Redo"
        className="focusable grid size-7 place-items-center rounded-md text-ink-faint transition enabled:hover:bg-raised enabled:hover:text-ink disabled:opacity-30"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 8H10a6 6 0 0 0 0 12h4" /><path d="m17 4 4 4-4 4" />
        </svg>
      </button>
    </div>
  )
}

function ShortcutsHelp() {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Keyboard shortcuts"
        aria-label="Keyboard shortcuts"
        aria-expanded={open}
        className="focusable grid size-7 place-items-center rounded-md text-ink-faint transition hover:bg-raised hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2.5" />
          <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
        </svg>
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-hidden onClick={() => setOpen(false)} tabIndex={-1} />
          <div
            className="panel absolute right-0 top-9 z-50 w-64 rounded-xl p-2.5 shadow-2xl"
            style={{ animation: 'var(--animate-float-in)' }}
          >
            <h3 className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
              Keyboard
            </h3>
            <ul className="space-y-0.5">
              {SHORTCUTS.map((s) => (
                <li key={s.keys} className="flex items-baseline gap-2 rounded px-1 py-0.5">
                  <kbd className="shrink-0 rounded border border-line bg-raised px-1.5 py-px font-mono text-[9.5px] text-ink-dim">
                    {s.keys}
                  </kbd>
                  <span className="text-[11px] leading-snug text-ink-faint">{s.action}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}

function fmt(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  return v.toFixed(0)
}

function Readout({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'good' | 'warn' | 'bad' | 'coin' }) {
  const colour = {
    default: 'text-ink-dim', good: 'text-signal', warn: 'text-ember', bad: 'text-alarm', coin: 'text-coin',
  }[tone]
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-[9.5px] uppercase tracking-wider text-ink-faint">{label}</span>
      <span className={clsx('font-semibold', colour)}>{value}</span>
    </span>
  )
}

function TransportButton({
  active, onClick, label, children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={clsx(
        'focusable grid size-7 place-items-center rounded-md transition',
        active ? 'bg-signal/18 text-signal' : 'text-ink-faint hover:bg-line hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

function NavLinks() {
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)

  const share = () => {
    const { name, nodes, edges } = useGame.getState()
    const encoded = encodeShareLink(serialize(name, nodes, edges))
    const url = `${window.location.origin}/build?d=${encoded}`
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <nav className="flex items-center gap-0.5">
      <button
        onClick={share}
        title="Copy a shareable link to this diagram"
        className="focusable rounded-lg px-2 py-1.5 text-[11.5px] font-medium text-ink-faint transition hover:bg-raised hover:text-ink"
      >
        {copied ? 'Copied' : 'Share'}
      </button>
      <button
        onClick={() => navigate('/missions')}
        className="focusable rounded-lg px-2 py-1.5 text-[11.5px] font-medium text-ink-faint transition hover:bg-raised hover:text-ink"
      >
        Missions
      </button>
      <button
        onClick={() => navigate('/codex')}
        className="focusable rounded-lg px-2 py-1.5 text-[11.5px] font-medium text-ink-faint transition hover:bg-raised hover:text-ink"
      >
        Codex
      </button>
    </nav>
  )
}
