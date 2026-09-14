import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useReactFlow } from '@xyflow/react'
import {
  ALL_RESOURCES, CATEGORY_META, PROVIDER_META, searchResources,
} from '@/catalog/registry'
import { CATEGORIES, PROVIDERS, type Category, type ProviderId, type ResourceDef } from '@/catalog/schema/types'
import { ResourceIcon } from '@/ui/ResourceIcon'
import { useGame } from '@/store/gameStore'

export function Palette() {
  const [query, setQuery] = useState('')
  const [providers, setProviders] = useState<Set<ProviderId>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<Category>>(new Set())
  const addNode = useGame((s) => s.addNode)
  const nodeCount = useGame((s) => s.nodes.length)
  const { screenToFlowPosition } = useReactFlow()

  const results = useMemo(() => {
    const base = query.trim() ? searchResources(query).map((h) => h.def) : ALL_RESOURCES.filter((r) => !r.hidden)
    return providers.size ? base.filter((r) => providers.has(r.provider) || r.provider === 'core') : base
  }, [query, providers])

  const grouped = useMemo(() => {
    const map = new Map<Category, ResourceDef[]>()
    for (const cat of CATEGORIES) map.set(cat, [])
    for (const def of results) map.get(def.category)!.push(def)
    for (const list of map.values()) list.sort((a, b) => a.provider.localeCompare(b.provider) || a.short.localeCompare(b.short))
    return [...map.entries()].filter(([, list]) => list.length > 0)
  }, [results])

  const toggleProvider = (p: ProviderId) =>
    setProviders((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })

  // Lay successive quick-adds out on a short diagonal so they never stack.
  const quickAdd = (def: ResourceDef) => {
    const centre = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    const step = nodeCount % 6
    addNode(def.id, { x: centre.x - 94 + step * 46, y: centre.y - 30 + step * 34 })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="border-b border-line p-2.5">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
            width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search services, e.g. redis, waf, ingress…"
            className="focusable w-full rounded-lg border border-line bg-raised py-1.5 pl-8 pr-2.5 text-[12px] text-ink placeholder:text-ink-faint transition hover:border-line-bright"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {PROVIDERS.filter((p) => p !== 'core').map((p) => {
            const on = providers.has(p)
            const meta = PROVIDER_META[p]
            return (
              <button
                key={p}
                onClick={() => toggleProvider(p)}
                className={clsx(
                  'focusable rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition',
                  on ? 'border-transparent' : 'border-line text-ink-faint hover:text-ink-dim',
                )}
                style={on ? { background: `color-mix(in oklab, ${meta.color} 18%, transparent)`, color: meta.color } : undefined}
              >
                {meta.short}
              </button>
            )
          })}
          {providers.size > 0 && (
            <button
              onClick={() => setProviders(new Set())}
              className="focusable rounded-md px-1.5 py-0.5 text-[10px] text-ink-faint transition hover:text-ink-dim"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {/* Groups */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {grouped.length === 0 && (
          <p className="px-3 py-10 text-center text-[11.5px] text-ink-faint">
            Nothing matches “{query}”.
          </p>
        )}
        {grouped.map(([category, defs]) => {
          const isCollapsed = collapsed.has(category)
          const meta = CATEGORY_META[category]
          return (
            <section key={category}>
              <button
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev)
                    if (next.has(category)) next.delete(category)
                    else next.add(category)
                    return next
                  })
                }
                className="focusable sticky top-0 z-10 flex w-full items-center gap-1.5 bg-surface/95 px-3 py-2 backdrop-blur"
              >
                <svg
                  className={clsx('shrink-0 text-ink-faint transition-transform', isCollapsed && '-rotate-90')}
                  width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-dim">{meta.label}</span>
                <span className="ml-auto text-[10px] tabular-nums text-ink-faint">{defs.length}</span>
              </button>
              {!isCollapsed && (
                <ul className="space-y-0.5 px-1.5 pb-1">
                  {defs.map((def) => (
                    <PaletteItem key={def.id} def={def} onAdd={() => quickAdd(def)} />
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function PaletteItem({ def, onAdd }: { def: ResourceDef; onAdd: () => void }) {
  const provider = PROVIDER_META[def.provider]
  return (
    <li>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/cloudwright', def.id)
          e.dataTransfer.effectAllowed = 'copy'
        }}
        onDoubleClick={onAdd}
        title={`${def.name} — ${def.tagline}\n\nDrag onto the canvas, or double-click to add.`}
        className="group flex cursor-grab items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-raised active:cursor-grabbing"
      >
        <span
          className="grid size-7 shrink-0 place-items-center rounded-md transition-transform group-hover:scale-105"
          style={{ background: `color-mix(in oklab, ${provider.color} 13%, transparent)`, color: provider.color }}
        >
          <ResourceIcon icon={def.icon} archetype={def.archetype} size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12px] font-medium text-ink">{def.short}</span>
            <span className="shrink-0 text-[9px] font-medium uppercase tracking-wider" style={{ color: provider.color }}>
              {provider.short}
            </span>
          </div>
          <div className="truncate text-[10.5px] leading-tight text-ink-faint">{def.tagline}</div>
        </div>
        <button
          onClick={onAdd}
          aria-label={`Add ${def.short}`}
          className="focusable shrink-0 rounded p-1 text-ink-faint opacity-0 transition hover:bg-line hover:text-ink group-hover:opacity-100"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </li>
  )
}
