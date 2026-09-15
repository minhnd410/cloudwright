import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { useTabs } from '@/store/tabStore'
import { useGame } from '@/store/gameStore'

/**
 * One row of open documents. Tabs carry the diagram name, which is why there is
 * no separate name field anywhere else — the thing you are editing is labelled
 * where you switch between them.
 */
export function TabBar() {
  const tabs = useTabs((s) => s.tabs)
  const activeId = useTabs((s) => s.activeId)
  const activate = useTabs((s) => s.activate)
  const close = useTabs((s) => s.close)
  const rename = useTabs((s) => s.rename)
  const open = useTabs((s) => s.open)
  const liveName = useGame((s) => s.name)
  const nodeCount = useGame((s) => s.nodes.length)

  const [editing, setEditing] = useState<string | null>(null)

  return (
    <div className="flex h-9 shrink-0 items-stretch gap-1 border-b border-line bg-abyss/70 px-1.5">
      <div className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId
          const name = isActive ? liveName : tab.name
          const count = isActive ? nodeCount : tab.saved.nodes.length
          return (
            <div
              key={tab.id}
              className={clsx(
                'group relative flex min-w-[112px] max-w-[220px] shrink-0 items-center gap-1.5 rounded-t-lg px-2.5 transition-colors',
                isActive ? 'bg-surface text-ink' : 'text-ink-faint hover:bg-surface/50 hover:text-ink-dim',
              )}
            >
              {editing === tab.id ? (
                <TabNameInput
                  value={name}
                  onCommit={(next) => {
                    if (next.trim()) rename(tab.id, next.trim())
                    setEditing(null)
                  }}
                />
              ) : (
                <button
                  onClick={() => activate(tab.id)}
                  onDoubleClick={() => setEditing(tab.id)}
                  title={`${name} — ${count} resource${count === 1 ? '' : 's'}. Double-click to rename.`}
                  className="focusable min-w-0 flex-1 truncate py-1.5 text-left text-[12px]"
                >
                  {name || 'Untitled'}
                </button>
              )}

              <span className="shrink-0 font-mono text-[9.5px] tabular-nums text-ink-faint">{count}</span>

              <button
                onClick={() => close(tab.id)}
                title="Close tab"
                aria-label={`Close ${name}`}
                className="focusable grid size-4 shrink-0 place-items-center rounded text-ink-faint opacity-0 transition hover:bg-line hover:text-ink group-hover:opacity-100"
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>

              {isActive && <span className="absolute inset-x-0 top-0 h-0.5 rounded-full bg-signal" />}
            </div>
          )
        })}
      </div>

      <button
        onClick={() => open()}
        title="New diagram"
        aria-label="New diagram"
        className="focusable my-1 grid size-7 shrink-0 place-items-center rounded-lg text-ink-faint transition hover:bg-raised hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  )
}

function TabNameInput({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  return (
    <input
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(draft)
        if (e.key === 'Escape') onCommit(value)
      }}
      className="focusable min-w-0 flex-1 rounded bg-raised px-1 py-0.5 text-[12px] text-ink outline-none"
      aria-label="Diagram name"
    />
  )
}
