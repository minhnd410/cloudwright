import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { useGame } from '@/store/gameStore'
import { milestonesOf, summarise, type Milestone } from '@/sim/recording'

const SEVERITY_COLOUR: Record<Milestone['severity'], string> = {
  info: 'var(--color-ink-faint)',
  success: 'var(--color-signal)',
  warn: 'var(--color-ember)',
  error: 'var(--color-alarm)',
  critical: 'var(--color-toxic)',
}

/**
 * The transport for a recorded run. Scrubbing moves through recorded frames
 * rather than re-simulating, so an incident can be examined a tick at a time
 * and the moments that matter are marked on the track.
 */
export function ReplayBar() {
  const replay = useGame((s) => s.replay)
  const seek = useGame((s) => s.seekReplay)
  const setPlaying = useGame((s) => s.setReplayPlaying)
  const advance = useGame((s) => s.advanceReplay)
  const exitReplay = useGame((s) => s.exitReplay)
  const [speed, setSpeed] = useState(1)
  const track = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!replay?.playing) return
    const timer = setInterval(advance, 420 / speed)
    return () => clearInterval(timer)
  }, [replay?.playing, speed, advance])

  const loaded = replay?.recording
  const milestones = useMemo(() => (loaded ? milestonesOf(loaded) : []), [loaded])
  const stats = useMemo(() => (loaded ? summarise(loaded) : null), [loaded])

  if (!replay || !stats) return null

  const total = replay.recording.frames.length
  const frame = replay.recording.frames[replay.index]
  const progress = total > 1 ? replay.index / (total - 1) : 0

  return (
    <div
      className="panel absolute bottom-4 left-1/2 z-40 w-[min(760px,calc(100%-6rem))] -translate-x-1/2 rounded-xl px-3 py-2.5 shadow-2xl"
      style={{ animation: 'var(--animate-float-in)' }}
    >
      <div className="flex items-center gap-2.5">
        <span className="shrink-0 rounded bg-toxic/15 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-toxic">
          Replay
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">{replay.recording.name}</span>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-faint">
          {frame.elapsed.toFixed(0)}s · tick {frame.tick} of {total}
        </span>
        <button
          onClick={exitReplay}
          className="focusable shrink-0 rounded-md px-2 py-0.5 text-[10.5px] text-ink-faint transition hover:bg-raised hover:text-ink"
        >
          Exit replay
        </button>
      </div>

      {/* Track */}
      <div
        ref={track}
        className="relative mt-2.5 h-7 cursor-pointer"
        onClick={(e) => {
          const rect = track.current?.getBoundingClientRect()
          if (!rect) return
          seek(Math.round(((e.clientX - rect.left) / rect.width) * (total - 1)))
        }}
        role="slider"
        aria-label="Replay position"
        aria-valuemin={0}
        aria-valuemax={total - 1}
        aria-valuenow={replay.index}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') seek(replay.index - 1)
          if (e.key === 'ArrowRight') seek(replay.index + 1)
        }}
      >
        <div className="absolute inset-x-0 top-3 h-1 rounded-full bg-line">
          <div className="h-full rounded-full bg-signal/70" style={{ width: `${progress * 100}%` }} />
        </div>
        {milestones.map((m) => (
          <button
            key={`${m.index}:${m.label}`}
            onClick={(e) => {
              e.stopPropagation()
              seek(m.index)
            }}
            title={`${m.label} (tick ${m.tick})`}
            className="focusable absolute top-1.5 size-1.5 -translate-x-1/2 rounded-full transition hover:scale-150"
            style={{ left: `${(m.index / Math.max(total - 1, 1)) * 100}%`, background: SEVERITY_COLOUR[m.severity] }}
          />
        ))}
        <div
          className="pointer-events-none absolute top-1 size-3 -translate-x-1/2 rounded-full border-2 border-deep bg-signal shadow"
          style={{ left: `${progress * 100}%` }}
        />
      </div>

      <div className="mt-1 flex items-center gap-2">
        <button
          onClick={() => seek(0)}
          title="Back to the start"
          className="focusable grid size-7 place-items-center rounded-md text-ink-faint transition hover:bg-raised hover:text-ink"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14l-11-7z" /></svg>
        </button>
        <button
          onClick={() => setPlaying(!replay.playing)}
          title={replay.playing ? 'Pause' : 'Play'}
          className="focusable grid size-7 place-items-center rounded-md bg-signal/15 text-signal transition hover:bg-signal/25"
        >
          {replay.playing ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z" /></svg>
          )}
        </button>
        <button
          onClick={() => seek(replay.index - 1)}
          title="Previous tick"
          className="focusable grid size-7 place-items-center rounded-md text-ink-faint transition hover:bg-raised hover:text-ink"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <button
          onClick={() => seek(replay.index + 1)}
          title="Next tick"
          className="focusable grid size-7 place-items-center rounded-md text-ink-faint transition hover:bg-raised hover:text-ink"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>

        <div className="ml-1 flex items-center gap-0.5">
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={clsx(
                'focusable rounded px-1.5 py-0.5 font-mono text-[10px] transition',
                speed === s ? 'bg-signal/15 text-signal' : 'text-ink-faint hover:text-ink',
              )}
            >
              {s}×
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3 font-mono text-[10px] tabular-nums text-ink-faint">
          <span>peak err {(stats.peakErrorRate * 100).toFixed(1)}%</span>
          <span>peak p95 {stats.peakLatencyMs.toFixed(0)}ms</span>
          {stats.incidents > 0 && <span className="text-alarm">{stats.incidents} incident{stats.incidents === 1 ? '' : 's'}</span>}
          {stats.compromisedNodes > 0 && <span className="text-toxic">{stats.compromisedNodes} breached</span>}
        </div>
      </div>
    </div>
  )
}
