import clsx from 'clsx'
import type { ResourceDef } from '@/catalog/schema/types'
import { useGame } from '@/store/gameStore'
import { EmptyHint } from '@/ui/primitives'

/** Every realistic way this resource breaks, and a button to make it happen. */
export function FailureModes({ def, nodeId }: { def: ResourceDef; nodeId: string }) {
  const modes = def.sim?.failureModes ?? []
  // Select the stable array and narrow it here — a filtering selector returns a
  // new array on every render, which zustand treats as a changed snapshot.
  const incidents = useGame((s) => s.incidents)
  const active = incidents.filter((i) => i.nodeId === nodeId)
  const trigger = useGame((s) => s.triggerIncident)
  const clear = useGame((s) => s.clearIncident)

  if (modes.length === 0) {
    return <EmptyHint>No failure modes modelled for {def.short} yet. Managed services fail in fewer interesting ways.</EmptyHint>
  }

  return (
    <div className="space-y-2 p-3">
      <p className="text-[11px] leading-relaxed text-ink-faint">
        Inject a fault and watch it propagate. Read the symptom, diagnose it from the graph and the event log,
        then fix the architecture — not the incident.
      </p>
      {modes.map((mode) => {
        const live = active.find((i) => i.modeId === mode.id)
        return (
          <div
            key={mode.id}
            className={clsx(
              'rounded-lg border p-2.5 transition-colors',
              live ? 'border-alarm/45 bg-alarm/6' : 'border-line bg-raised/40',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <h5 className="text-[12px] font-medium text-ink">{mode.label}</h5>
              <button
                onClick={() => (live ? clear(live.id) : trigger(nodeId, mode.id))}
                className={clsx(
                  'focusable shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition',
                  live
                    ? 'bg-signal/15 text-signal hover:bg-signal/25'
                    : 'bg-raised text-ink-faint hover:bg-alarm/15 hover:text-alarm',
                )}
              >
                {live ? 'resolve' : 'inject'}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-dim">
              <span className="text-ink-faint">Symptom — </span>{mode.symptom}
            </p>
            {live && (
              <p className="mt-1.5 rounded border-l-2 border-signal/50 bg-signal/5 py-1 pl-2 pr-1.5 text-[11px] leading-relaxed text-ink-dim">
                <span className="font-medium text-signal">Fix — </span>{mode.remedy}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
