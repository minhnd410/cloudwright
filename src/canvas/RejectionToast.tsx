import { useEffect } from 'react'
import { useGame } from '@/store/gameStore'

/**
 * When a connection is refused, this is the teaching moment. It explains what
 * the player tried, why it does not work in reality, and what to do instead.
 */
export function RejectionToast() {
  const rejected = useGame((s) => s.rejected)
  const dismiss = useGame((s) => s.dismissRejection)

  useEffect(() => {
    if (!rejected) return
    const timer = setTimeout(dismiss, 11000)
    return () => clearTimeout(timer)
  }, [rejected, dismiss])

  if (!rejected) return null
  const { verdict, sourceLabel, targetLabel } = rejected

  return (
    <div
      className="pointer-events-auto absolute bottom-6 left-1/2 z-40 w-[min(520px,calc(100%-3rem))] -translate-x-1/2 rounded-xl border border-alarm/40 bg-deep/97 p-4 shadow-2xl backdrop-blur-xl"
      style={{ animation: 'var(--animate-float-in)' }}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-alarm/15 text-alarm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 8v5M12 17h.01" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            {sourceLabel} ⇸ {targetLabel}
          </div>
          <h3 className="mt-1 text-sm font-semibold text-ink">{verdict.reason}</h3>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-dim">{verdict.teach}</p>
          {verdict.hint && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-signal/8 px-2.5 py-1.5 text-[12px] text-signal">
              <span className="font-semibold">Try:</span>
              <span className="text-ink-dim">{verdict.hint}</span>
            </p>
          )}
        </div>
        <button
          onClick={dismiss}
          className="focusable shrink-0 rounded p-1 text-ink-faint transition hover:bg-raised hover:text-ink"
          aria-label="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
