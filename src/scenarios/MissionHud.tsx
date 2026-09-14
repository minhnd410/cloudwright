import { useState } from 'react'
import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { MISSION_BY_ID } from './missions'
import { useMission } from '@/store/missionStore'
import { conceptLabel } from '@/codex/labels'

/** The objective tracker that floats over the canvas during a mission. */
export function MissionHud() {
  const activeId = useMission((s) => s.activeId)
  const done = useMission((s) => s.done)
  const finished = useMission((s) => s.finished)
  const hintsShown = useMission((s) => s.hintsShown)
  const revealHint = useMission((s) => s.revealHint)
  const abandon = useMission((s) => s.abandon)
  const dismissDebrief = useMission((s) => s.dismissDebrief)
  const [collapsed, setCollapsed] = useState(false)
  const [briefOpen, setBriefOpen] = useState(true)

  if (!activeId) return null
  const mission = MISSION_BY_ID[activeId]
  if (!mission) return null

  const progress = done.length / mission.objectives.length

  if (finished) {
    return (
      <div className="absolute inset-0 z-50 grid place-items-center bg-void/75 p-6 backdrop-blur-sm">
        <div
          className="w-full max-w-lg rounded-2xl border border-signal/35 bg-deep p-6 shadow-2xl"
          style={{ animation: 'var(--animate-float-in)' }}
        >
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-full bg-signal/15 text-signal">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12.5 4.5 4.5L19 7" />
              </svg>
            </span>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-signal">Mission complete</div>
              <h2 className="text-lg font-semibold text-ink">{mission.title}</h2>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {mission.debrief.map((p, i) => (
              <p key={i} className="text-[13px] leading-relaxed text-ink-dim">{p}</p>
            ))}
          </div>

          {mission.concepts.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Go deeper</h4>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {mission.concepts.map((id) => (
                  <Link
                    key={id}
                    to={`/codex/${id}`}
                    className="focusable rounded-md border border-line bg-raised px-2 py-1 text-[11px] text-ink-dim transition hover:border-signal/45 hover:text-signal"
                  >
                    {conceptLabel(id)}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button
              onClick={dismissDebrief}
              className="focusable flex-1 rounded-lg bg-signal/15 px-3 py-2 text-[12.5px] font-medium text-signal transition hover:bg-signal/25"
            >
              Keep tinkering
            </button>
            <Link
              to="/missions"
              onClick={() => { dismissDebrief(); abandon() }}
              className="focusable flex-1 rounded-lg border border-line px-3 py-2 text-center text-[12.5px] font-medium text-ink-dim transition hover:border-line-bright hover:text-ink"
            >
              Next mission
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pointer-events-none absolute left-4 top-4 z-30 w-[300px]">
      <div className="pointer-events-auto panel overflow-hidden rounded-xl shadow-2xl">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="focusable flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-raised/60"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-signal">Mission</span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">{mission.title}</span>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-faint">
            {done.length}/{mission.objectives.length}
          </span>
          <svg
            className={clsx('shrink-0 text-ink-faint transition-transform', collapsed && '-rotate-90')}
            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        <div className="h-0.5 bg-line">
          <div className="h-full bg-signal transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
        </div>

        {!collapsed && (
          <div className="max-h-[52vh] overflow-y-auto">
            {briefOpen && (
              <div className="space-y-2 border-b border-line px-3 py-2.5">
                {mission.brief.map((p, i) => (
                  <p key={i} className="text-[11.5px] leading-relaxed text-ink-dim">{p}</p>
                ))}
                <button
                  onClick={() => setBriefOpen(false)}
                  className="focusable text-[10.5px] text-ink-faint underline decoration-dotted underline-offset-2 hover:text-signal"
                >
                  Hide brief
                </button>
              </div>
            )}
            {!briefOpen && (
              <button
                onClick={() => setBriefOpen(true)}
                className="focusable w-full border-b border-line px-3 py-1.5 text-left text-[10.5px] text-ink-faint transition hover:text-ink-dim"
              >
                Show brief
              </button>
            )}

            <ul className="space-y-1 p-2">
              {mission.objectives.map((objective) => {
                const complete = done.includes(objective.id)
                return (
                  <li key={objective.id} className="group flex items-start gap-2 rounded px-1 py-1">
                    <span
                      className={clsx(
                        'mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-full border transition-colors',
                        complete ? 'border-signal bg-signal/20 text-signal' : 'border-line-bright text-transparent',
                      )}
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 12.5 4.5 4.5L19 7" />
                      </svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className={clsx('block text-[11.5px] leading-snug transition-colors', complete ? 'text-ink-faint line-through' : 'text-ink-dim')}>
                        {objective.label}
                      </span>
                      {!complete && objective.hint && (
                        <details className="mt-0.5">
                          <summary className="focusable cursor-pointer list-none text-[10px] text-ink-faint transition hover:text-signal">
                            hint
                          </summary>
                          <p className="mt-1 rounded border-l-2 border-signal/40 bg-signal/5 py-1 pl-2 pr-1 text-[10.5px] leading-relaxed text-ink-dim">
                            {objective.hint}
                          </p>
                        </details>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>

            <div className="border-t border-line p-2">
              {mission.hints.slice(0, hintsShown).map((h, i) => (
                <p key={i} className="mb-1.5 rounded border-l-2 border-ember/40 bg-ember/5 py-1 pl-2 pr-1 text-[10.5px] leading-relaxed text-ink-dim">
                  {h}
                </p>
              ))}
              <div className="flex gap-1.5">
                {hintsShown < mission.hints.length && (
                  <button
                    onClick={revealHint}
                    className="focusable flex-1 rounded-md bg-raised px-2 py-1 text-[10.5px] text-ink-dim transition hover:bg-line hover:text-ink"
                  >
                    Need a hint? ({mission.hints.length - hintsShown} left)
                  </button>
                )}
                <button
                  onClick={abandon}
                  className="focusable rounded-md px-2 py-1 text-[10.5px] text-ink-faint transition hover:text-alarm"
                >
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
