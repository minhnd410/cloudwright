import { useState } from 'react'
import clsx from 'clsx'
import type { ResourceDef } from '@/catalog/schema/types'
import { CodeBlock } from '@/ui/primitives'

/** "How would I actually build this?" — the bridge from the game to a terminal. */
export function SetupGuide({ def }: { def: ResourceDef }) {
  const [snippet, setSnippet] = useState(0)
  const setup = def.setup

  if (!setup) {
    return (
      <p className="px-3 py-8 text-center text-[11.5px] leading-relaxed text-ink-faint">
        No build guide written for {def.short} yet.
      </p>
    )
  }

  return (
    <div className="space-y-4 p-3">
      {setup.console && setup.console.length > 0 && (
        <section>
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">In the console</h4>
          <ol className="mt-2 space-y-2">
            {setup.console.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-[11.5px] leading-relaxed text-ink-dim">
                <span className="mt-px grid size-4 shrink-0 place-items-center rounded-full bg-raised font-mono text-[9px] text-ink-faint">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>
      )}

      {setup.snippets && setup.snippets.length > 0 && (
        <section>
          <div className="flex flex-wrap gap-1">
            {setup.snippets.map((s, i) => (
              <button
                key={s.label}
                onClick={() => setSnippet(i)}
                className={clsx(
                  'focusable rounded-md px-2 py-1 text-[10.5px] font-medium transition',
                  snippet === i ? 'bg-signal/14 text-signal' : 'text-ink-faint hover:bg-raised hover:text-ink-dim',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="mt-2">
            <CodeBlock code={setup.snippets[snippet]?.code ?? ''} lang={setup.snippets[snippet]?.lang} />
          </div>
        </section>
      )}

      {setup.gotchas && setup.gotchas.length > 0 && (
        <section>
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            Things that bite people
          </h4>
          <ul className="mt-2 space-y-2">
            {setup.gotchas.map((g, i) => (
              <li key={i} className="flex gap-2 rounded-lg border-l-2 border-ember/50 bg-ember/5 py-1.5 pl-2.5 pr-2 text-[11.5px] leading-relaxed text-ink-dim">
                {g}
              </li>
            ))}
          </ul>
        </section>
      )}

      {setup.docs && setup.docs.length > 0 && (
        <section>
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Official documentation</h4>
          <ul className="mt-2 space-y-1">
            {setup.docs.map((d) => (
              <li key={d.url}>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="focusable inline-flex items-center gap-1.5 text-[11.5px] text-flux transition hover:underline"
                >
                  {d.label}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 4h6v6M20 4l-9 9M17 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5" />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
