import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Link, useNavigate } from 'react-router-dom'
import { useGame, type SimSpeed } from '@/store/gameStore'
import { useTabs } from '@/store/tabStore'
import { PANEL_META, useUi, type PanelId } from '@/store/uiStore'
import { THEME_META, useTheme, type ThemePref } from '@/store/themeStore'
import { formatCurrency } from '@/sim/cost'
import { serialize, encodeShareLink } from '@/store/serialize'
import { downloadJson, downloadRecording, parseDiagram, pickJsonFile } from '@/store/files'
import { parseRecording } from '@/sim/recording'
import { Logo } from '@/ui/Logo'
import { Menu } from '@/ui/Menu'
import { ThemeToggle } from '@/ui/ThemeToggle'
import { SHORTCUTS } from './useSimLoop'

export function TopBar() {
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
    <header className="relative z-50 flex h-12 shrink-0 items-center gap-2 border-b border-line bg-abyss/90 px-2.5 backdrop-blur-xl">
      <Link to="/" className="focusable flex shrink-0 items-center gap-2 rounded pr-1" title="Cloudwright home">
        <Logo size={22} />
        <span className="hidden text-[13px] font-semibold tracking-tight text-ink xl:block">Cloudwright</span>
      </Link>

      <FileMenu />
      <ViewMenu />

      <div className="h-5 w-px shrink-0 bg-line" />

      <HistoryButtons />

      <div className="h-5 w-px shrink-0 bg-line" />

      <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-line bg-raised/60 p-0.5">
        <TransportButton active={speed === 0} onClick={() => setSpeed(0)} label="Pause (space)">
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
        <RecordButton />
      </div>

      <div className="hidden shrink-0 items-center gap-1.5 xl:flex" title="Multiply all client traffic">
        <span className="text-[10px] uppercase tracking-wider text-ink-faint">Load</span>
        <input
          type="range" min={0.25} max={20} step={0.25}
          value={loadMultiplier}
          onChange={(e) => setLoadMultiplier(Number(e.target.value))}
          aria-label="Traffic multiplier"
          className="focusable h-1 w-16 cursor-pointer appearance-none rounded-full bg-line
            [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-flux"
        />
        <span className="w-7 font-mono text-[10.5px] tabular-nums text-ink-dim">{loadMultiplier}×</span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2.5">
        {metrics && (
          <div className="hidden items-center gap-3 font-mono text-[11px] tabular-nums lg:flex">
            <Readout label="rps" value={fmt(metrics.totalServed)} />
            <Readout label="err" value={`${errorPct.toFixed(errorPct < 10 ? 1 : 0)}%`} tone={errorPct > 5 ? 'bad' : errorPct > 0.5 ? 'warn' : 'good'} />
            <Readout label="p95" value={`${metrics.p95LatencyMs.toFixed(0)}ms`} tone={metrics.p95LatencyMs > 800 ? 'bad' : metrics.p95LatencyMs > 350 ? 'warn' : 'default'} />
            <Readout label="cost" value={`${formatCurrency(metrics.costPerMonth)}/mo`} tone="coin" />
          </div>
        )}

        <div className="hidden items-center gap-1.5 rounded-lg border border-line bg-raised/60 px-2 py-1 sm:flex" title="Architecture review score">
          <span className="text-[9.5px] uppercase tracking-wider text-ink-faint">Score</span>
          <span
            className="font-mono text-[13px] font-bold tabular-nums"
            style={{ color: score >= 80 ? 'var(--color-signal)' : score >= 55 ? 'var(--color-ember)' : 'var(--color-alarm)' }}
          >
            {score}
          </span>
        </div>

        <ThemeToggle />
        <ShortcutsHelp />
        <NavLinks />
      </div>
    </header>
  )
}

// ── Menus ───────────────────────────────────────────────────────────────────

function FileMenu() {
  const open = useTabs((s) => s.open)
  const duplicate = useTabs((s) => s.duplicate)
  const close = useTabs((s) => s.close)
  const activeId = useTabs((s) => s.activeId)
  const tabCount = useTabs((s) => s.tabs.length)
  const clear = useGame((s) => s.clear)
  const replay = useGame((s) => s.replay)
  const loadReplay = useGame((s) => s.loadReplay)
  const [notice, setNotice] = useState<string | null>(null)
  const recordingReady = Boolean(replay)

  const exportRecording = () => {
    if (!replay) return
    downloadRecording(replay.recording)
  }

  const importRecording = async () => {
    const file = await pickJsonFile()
    if (!file) return
    const parsed = parseRecording(file.text)
    if ('error' in parsed) {
      setNotice(parsed.error)
      setTimeout(() => setNotice(null), 6000)
      return
    }
    open(parsed.diagram)
    loadReplay(parsed)
  }

  const exportJson = () => {
    const { name, nodes, edges } = useGame.getState()
    downloadJson(serialize(name, nodes, edges))
  }

  const importJson = async () => {
    const file = await pickJsonFile()
    if (!file) return
    const result = parseDiagram(file.text)
    if (!result.ok) {
      setNotice(result.error)
      setTimeout(() => setNotice(null), 6000)
      return
    }
    open(result.diagram)
    if (result.unknown.length > 0) {
      setNotice(`Imported. ${result.unknown.length} unknown resource${result.unknown.length === 1 ? '' : 's'} were skipped: ${result.unknown.join(', ')}`)
      setTimeout(() => setNotice(null), 8000)
    }
  }

  const copyShareLink = () => {
    const { name, nodes, edges } = useGame.getState()
    const url = `${window.location.origin}/build?d=${encodeShareLink(serialize(name, nodes, edges))}`
    void navigator.clipboard?.writeText(url).then(
      () => {
        setNotice('Share link copied to the clipboard.')
        setTimeout(() => setNotice(null), 3000)
      },
      () => setNotice('Could not access the clipboard.'),
    )
  }

  return (
    <>
      <Menu
        label="File"
        width={264}
        items={[
          { id: 'new', label: 'New diagram', hint: 'Opens in a new tab', onSelect: () => open() },
          { id: 'dup', label: 'Duplicate this diagram', onSelect: () => duplicate(activeId) },
          { id: 'import', label: 'Import JSON…', hint: 'Open a .cloudwright.json file', separated: true, onSelect: () => void importJson() },
          { id: 'export', label: 'Export JSON', hint: 'Download this diagram', onSelect: exportJson },
          { id: 'share', label: 'Copy share link', hint: 'The whole diagram, encoded in a URL', onSelect: copyShareLink },
          { id: 'rec-export', label: 'Export recording', hint: recordingReady ? 'Download the loaded replay' : 'Record a run first', separated: true, disabled: !recordingReady, onSelect: exportRecording },
          { id: 'rec-import', label: 'Import recording…', hint: 'Open a .cwrec.json file and replay it', onSelect: () => void importRecording() },
          { id: 'clear', label: 'Clear the canvas', separated: true, onSelect: clear },
          { id: 'close', label: 'Close tab', danger: true, disabled: tabCount <= 1, onSelect: () => close(activeId) },
        ]}
      />
      {notice && (
        <div
          className="pointer-events-none absolute left-1/2 top-14 z-[90] max-w-md -translate-x-1/2 rounded-lg border border-line bg-deep px-3 py-2 text-[12px] text-ink-dim shadow-2xl"
          style={{ animation: 'var(--animate-float-in)' }}
          role="status"
        >
          {notice}
        </div>
      )}
    </>
  )
}

function ViewMenu() {
  const panels = useUi((s) => s.panels)
  const toggle = useUi((s) => s.toggle)
  const showAll = useUi((s) => s.showAll)
  const pref = useTheme((s) => s.pref)
  const setPref = useTheme((s) => s.setPref)
  const hidden = (Object.keys(panels) as PanelId[]).filter((p) => !panels[p]).length

  return (
    <Menu
      label="View"
      width={260}
      icon={
        hidden > 0 ? (
          <span className="grid size-4 place-items-center rounded-full bg-ember/20 font-mono text-[9px] text-ember">{hidden}</span>
        ) : undefined
      }
      items={[
        ...(Object.keys(PANEL_META) as PanelId[]).map((id) => ({
          id,
          label: PANEL_META[id].label,
          hint: PANEL_META[id].hint,
          shortcut: PANEL_META[id].shortcut,
          checked: panels[id],
          onSelect: () => toggle(id),
        })),
        { id: 'all', label: 'Show every panel', separated: true, onSelect: showAll },
        ...(Object.keys(THEME_META) as ThemePref[]).map((id, i) => ({
          id: `theme-${id}`,
          label: `${THEME_META[id].label} theme`,
          hint: THEME_META[id].hint,
          checked: pref === id,
          separated: i === 0,
          onSelect: () => setPref(id),
        })),
      ]}
    />
  )
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function RecordButton() {
  const recording = useGame((s) => s.recording)
  const replay = useGame((s) => s.replay)
  const start = useGame((s) => s.startRecording)
  const stop = useGame((s) => s.stopRecording)
  const loadReplay = useGame((s) => s.loadReplay)

  if (replay) return null
  const frames = recording?.frames.length ?? 0

  return (
    <button
      onClick={() => {
        if (recording) {
          const finished = stop()
          if (finished) loadReplay(finished)
        } else {
          start()
        }
      }}
      title={recording ? `Stop recording (${frames} frames) and replay` : 'Record this run so it can be replayed, scrubbed and exported'}
      aria-label={recording ? 'Stop recording' : 'Start recording'}
      className={clsx(
        'focusable ml-0.5 flex h-7 items-center gap-1 rounded-md px-1.5 transition',
        recording ? 'bg-alarm/18 text-alarm' : 'text-ink-faint hover:bg-line hover:text-ink',
      )}
    >
      <span
        className={clsx('size-2.5 rounded-full', recording ? 'bg-alarm' : 'border-[1.6px] border-current')}
        style={recording ? { animation: 'var(--animate-breathe)' } : undefined}
      />
      {recording && <span className="font-mono text-[10px] tabular-nums">{frames}</span>}
    </button>
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
        onClick={undo} disabled={!canUndo} title="Undo (⌘Z)" aria-label="Undo"
        className="focusable grid size-7 place-items-center rounded-md text-ink-faint transition enabled:hover:bg-raised enabled:hover:text-ink disabled:opacity-30"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8h11a6 6 0 0 1 0 12h-4" /><path d="m7 4-4 4 4 4" />
        </svg>
      </button>
      <button
        onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)" aria-label="Redo"
        className="focusable grid size-7 place-items-center rounded-md text-ink-faint transition enabled:hover:bg-raised enabled:hover:text-ink disabled:opacity-30"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 8H10a6 6 0 0 0 0 12h4" /><path d="m17 4 4 4-4 4" />
        </svg>
      </button>
    </div>
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
      <span className="text-[9.5px] uppercase tracking-wider text-ink-faint">{label}</span>
      <span className={clsx('font-semibold', colour)}>{value}</span>
    </span>
  )
}

function TransportButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick} title={label} aria-label={label} aria-pressed={active}
      className={clsx('focusable grid size-7 place-items-center rounded-md transition', active ? 'bg-signal/18 text-signal' : 'text-ink-faint hover:bg-line hover:text-ink')}
    >
      {children}
    </button>
  )
}

function ShortcutsHelp() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  // A `fixed inset-0` click-catcher would not work here: the toolbar uses
  // backdrop-filter, which makes it the containing block for fixed children —
  // so the overlay would only cover the toolbar itself.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((v) => !v)} title="Keyboard shortcuts" aria-label="Keyboard shortcuts" aria-expanded={open}
        className="focusable grid size-7 place-items-center rounded-md text-ink-faint transition hover:bg-raised hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2.5" />
          <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
        </svg>
      </button>
      {open && (
        <div className="panel absolute right-0 top-9 z-[80] w-64 rounded-xl p-2.5 shadow-2xl" style={{ animation: 'var(--animate-float-in)' }}>
          <h3 className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Keyboard</h3>
          <ul className="space-y-0.5">
            {SHORTCUTS.map((s) => (
              <li key={s.keys} className="flex items-baseline gap-2 rounded px-1 py-0.5">
                <kbd className="shrink-0 rounded border border-line bg-raised px-1.5 py-px font-mono text-[9.5px] text-ink-dim">{s.keys}</kbd>
                <span className="text-[11px] leading-snug text-ink-faint">{s.action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function NavLinks() {
  const navigate = useNavigate()
  return (
    <nav className="flex items-center gap-0.5">
      <button onClick={() => navigate('/missions')} className="focusable rounded-lg px-2 py-1.5 text-[11.5px] font-medium text-ink-faint transition hover:bg-raised hover:text-ink">
        Missions
      </button>
      <button onClick={() => navigate('/codex')} className="focusable rounded-lg px-2 py-1.5 text-[11.5px] font-medium text-ink-faint transition hover:bg-raised hover:text-ink">
        Codex
      </button>
    </nav>
  )
}
