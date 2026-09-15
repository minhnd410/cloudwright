import { useEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'

export interface MenuItem {
  id: string
  label: string
  hint?: string
  shortcut?: string
  onSelect?: () => void
  /** Renders a checkmark column and reflects state. */
  checked?: boolean
  disabled?: boolean
  danger?: boolean
  /** Draws a divider above this item. */
  separated?: boolean
}

/**
 * A small dropdown used for the File and View menus. Deliberately plain: it
 * closes on outside click, on Escape, and on selection, and it keeps focus
 * behaviour predictable for keyboard users.
 */
export function Menu({
  label, icon, items, align = 'left', width = 240,
}: {
  label: string
  icon?: ReactNode
  items: MenuItem[]
  align?: 'left' | 'right'
  width?: number
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

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
    <div ref={root} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={clsx(
          'focusable flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-medium transition',
          open ? 'bg-raised text-ink' : 'text-ink-dim hover:bg-raised hover:text-ink',
        )}
      >
        {icon}
        {label}
        <svg
          className={clsx('transition-transform', open && 'rotate-180')}
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className={clsx('panel absolute top-9 z-[80] rounded-xl p-1 shadow-2xl', align === 'right' ? 'right-0' : 'left-0')}
          style={{ width, animation: 'var(--animate-float-in)' }}
        >
          {items.map((item) => (
            <div key={item.id}>
              {item.separated && <div className="my-1 h-px bg-line" />}
              <button
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  item.onSelect?.()
                  setOpen(false)
                }}
                className={clsx(
                  'focusable flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition',
                  item.disabled
                    ? 'cursor-not-allowed opacity-35'
                    : item.danger
                      ? 'text-ink-dim hover:bg-alarm/12 hover:text-alarm'
                      : 'text-ink-dim hover:bg-raised hover:text-ink',
                )}
              >
                {item.checked !== undefined && (
                  <span className={clsx('grid size-3.5 shrink-0 place-items-center', item.checked ? 'text-signal' : 'text-transparent')}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 12.5 4.5 4.5L19 7" />
                    </svg>
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px]">{item.label}</span>
                  {item.hint && <span className="block truncate text-[10.5px] text-ink-faint">{item.hint}</span>}
                </span>
                {item.shortcut && (
                  <kbd className="shrink-0 rounded border border-line bg-raised px-1 py-px font-mono text-[9px] text-ink-faint">
                    {item.shortcut}
                  </kbd>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
