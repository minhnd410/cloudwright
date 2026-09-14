import { TEMPLATES } from '@/scenarios/templates'
import { useGame } from '@/store/gameStore'

export function CanvasEmptyState() {
  const load = useGame((s) => s.load)

  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-y-auto p-8">
      <div className="max-w-xl text-center">
        <svg
          width="52" height="52" viewBox="0 0 24 24" fill="none" className="mx-auto text-line-bright"
          stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
        >
          <rect x="2.5" y="4" width="19" height="16" rx="2.5" strokeDasharray="3 3" />
          <circle cx="8" cy="12" r="2" />
          <circle cx="16" cy="12" r="2" />
          <path d="M10 12h4" />
        </svg>

        <h2 className="mt-4 text-balance text-[17px] font-semibold text-ink-dim">
          Drag a resource from the palette to begin
        </h2>
        <p className="mt-2 text-balance text-[13px] leading-relaxed text-ink-faint">
          Start with <span className="text-ink-dim">Users</span>, add a load balancer and some compute,
          then press play and watch the requests move. Connections that make no sense in reality will
          refuse to form — and tell you why.
        </p>

        <div className="pointer-events-auto mt-7">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Or start from a reference architecture
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {TEMPLATES.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => load(t.build())}
                  className="focusable group h-full w-full rounded-xl border border-line bg-surface/70 p-3 text-left transition hover:border-signal/45 hover:bg-surface"
                >
                  <div className="text-[12.5px] font-medium text-ink transition-colors group-hover:text-signal">
                    {t.name}
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed text-ink-faint">{t.blurb}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
