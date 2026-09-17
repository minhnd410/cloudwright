import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { MISSIONS } from '@/scenarios/missions'
import { DIFFICULTY_META, TRACK_META, type Track } from '@/scenarios/types'
import { useMission } from '@/store/missionStore'
import { PageShell } from './PageShell'

export function MissionsPage() {
  const navigate = useNavigate()
  const completed = useMission((s) => s.completed)
  const isUnlocked = useMission((s) => s.isUnlocked)
  const start = useMission((s) => s.start)

  const byTrack = useMemo(() => {
    const map = new Map<Track, typeof MISSIONS>()
    for (const m of MISSIONS) {
      const list = map.get(m.track) ?? []
      list.push(m)
      map.set(m.track, list)
    }
    return [...map.entries()]
  }, [])

  const launch = (id: string) => {
    start(id)
    navigate('/build')
  }

  return (
    <PageShell
      eyebrow="Missions"
      title="Fifteen scenarios, each one a real problem"
      lede={`Every mission drops you into a situation somebody has actually been paged for. Fix it on the canvas, and the debrief tells you what the lesson was. ${completed.length} of ${MISSIONS.length} complete.`}
    >
      <div className="space-y-10">
        {byTrack.map(([track, missions]) => (
          <section key={track}>
            <div className="mb-3 flex items-baseline gap-3">
              <h2 className="text-[15px] font-semibold text-ink">{TRACK_META[track].label}</h2>
              <p className="text-[12px] text-ink-faint">{TRACK_META[track].blurb}</p>
            </div>
            <ul className="grid gap-3 md:grid-cols-2">
              {missions.map((mission) => {
                const done = completed.includes(mission.id)
                const unlocked = isUnlocked(mission)
                const diff = DIFFICULTY_META[mission.difficulty]
                return (
                  <li key={mission.id}>
                    <button
                      onClick={() => unlocked && launch(mission.id)}
                      disabled={!unlocked}
                      className={clsx(
                        'focusable group h-full w-full rounded-xl border p-4 text-left transition',
                        unlocked
                          ? 'border-line bg-surface/60 hover:border-signal/40 hover:bg-surface'
                          : 'cursor-not-allowed border-line/60 bg-surface/25 opacity-55',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <h3 className={clsx('flex-1 text-[14px] font-semibold leading-snug', unlocked ? 'text-ink group-hover:text-signal' : 'text-ink-dim')}>
                          {mission.title}
                        </h3>
                        {done && (
                          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-signal/15 text-signal">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m5 12.5 4.5 4.5L19 7" />
                            </svg>
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-faint">{mission.tagline}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                          className="rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider"
                          style={{ color: diff.color, background: `color-mix(in oklab, ${diff.color} 13%, transparent)` }}
                        >
                          {diff.label}
                        </span>
                        <span className="text-[10.5px] text-ink-faint">{mission.objectives.length} objectives</span>
                        <span className="text-[10.5px] text-ink-faint">~{mission.minutes} min</span>
                        {!unlocked && mission.requires && (
                          <span className="text-[10.5px] text-ember">
                            needs “{MISSIONS.find((m) => m.id === mission.requires)?.title}”
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </PageShell>
  )
}
