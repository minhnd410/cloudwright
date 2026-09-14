import type { ResourceDef } from '@/catalog/schema/types'
import { archetypeLabel, equivalentsOf, PROVIDER_META } from '@/catalog/registry'
import { ResourceIcon } from '@/ui/ResourceIcon'
import { FLOW_META } from '@/catalog/schema/flows'
import { conceptLabel } from '@/codex/labels'
import { Link } from 'react-router-dom'

export function Explain({ def }: { def: ResourceDef }) {
  const equivalents = equivalentsOf(def)
  const concepts = def.concepts ?? []

  return (
    <div className="space-y-4 p-3">
      <section>
        <div className="flex items-center gap-2">
          <span className="rounded bg-raised px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wider text-ink-faint">
            {archetypeLabel(def.archetype)}
          </span>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-dim">{def.description}</p>
      </section>

      <section>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Connections it accepts</h4>
        <ul className="mt-2 space-y-1.5">
          {def.ports.map((port) => (
            <li key={port.id} className="flex items-start gap-2 text-[11px]">
              <span
                className="mt-1 shrink-0 rounded px-1 py-px text-[8.5px] font-semibold uppercase tracking-wider"
                style={{
                  color: port.side === 'in' ? 'var(--color-signal)' : 'var(--color-flux)',
                  background: `color-mix(in oklab, ${port.side === 'in' ? 'var(--color-signal)' : 'var(--color-flux)'} 12%, transparent)`,
                }}
              >
                {port.side === 'in' ? 'in' : 'out'}
              </span>
              <span className="min-w-0">
                <span className="text-ink-dim">{port.label}</span>
                <span className="ml-1.5 text-ink-faint">
                  {port.flows.map((f) => FLOW_META[f].label).join(' · ')}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {equivalents.length > 0 && (
        <section>
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            The same thing, elsewhere
          </h4>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
            Different name, same job. Learning the archetype transfers across every provider.
          </p>
          <ul className="mt-2 space-y-1">
            {equivalents.map((eq) => {
              const provider = PROVIDER_META[eq.provider]
              return (
                <li key={eq.id} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition hover:bg-raised">
                  <span
                    className="grid size-6 shrink-0 place-items-center rounded-md"
                    style={{ background: `color-mix(in oklab, ${provider.color} 13%, transparent)`, color: provider.color }}
                  >
                    <ResourceIcon icon={eq.icon} archetype={eq.archetype} size={13} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[11.5px] text-ink">{eq.short}</div>
                    <div className="truncate text-[10px] text-ink-faint">{eq.tagline}</div>
                  </div>
                  <span className="ml-auto shrink-0 text-[9px] font-medium uppercase tracking-wider" style={{ color: provider.color }}>
                    {provider.short}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {concepts.length > 0 && (
        <section>
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Read next</h4>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {concepts.map((id) => (
              <li key={id}>
                <Link
                  to={`/codex/${id}`}
                  className="focusable inline-block rounded-md border border-line bg-raised px-2 py-1 text-[11px] text-ink-dim transition hover:border-signal/45 hover:text-signal"
                >
                  {conceptLabel(id)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
