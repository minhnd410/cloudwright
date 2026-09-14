import { useEffect, useState } from 'react'
import clsx from 'clsx'
import type { PropBag, PropDef, PropValue, ResourceDef } from '@/catalog/schema/types'
import { visibleProps } from '@/catalog/registry'
import { MultiSelect, Select, Slider, TextInput, Toggle } from '@/ui/primitives'
import { computeImpact, type ImpactDelta } from './impact'

const AFFECT_LABEL: Record<string, { label: string; color: string }> = {
  capacity: { label: 'capacity', color: 'var(--color-signal)' },
  cost: { label: 'cost', color: 'var(--color-coin)' },
  latency: { label: 'latency', color: 'var(--color-flux)' },
  availability: { label: 'availability', color: 'var(--color-power)' },
  security: { label: 'security', color: 'var(--color-toxic)' },
  durability: { label: 'durability', color: 'var(--color-vault)' },
  scale: { label: 'scale', color: 'var(--color-ember)' },
}

export function PropertyEditor({
  def, props, servedRps, onChange,
}: {
  def: ResourceDef
  props: PropBag
  servedRps: number
  onChange: (key: string, value: PropValue) => void
}) {
  const [flash, setFlash] = useState<{ key: string; deltas: ImpactDelta[] } | null>(null)

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 5200)
    return () => clearTimeout(t)
  }, [flash])

  const shown = visibleProps(def, props)
  if (shown.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-[11.5px] leading-relaxed text-ink-faint">
        This resource has no adjustable settings. Its behaviour comes entirely from what you connect it to.
      </p>
    )
  }

  const set = (prop: PropDef, value: PropValue) => {
    const after = { ...props, [prop.key]: value }
    const deltas = computeImpact(def, props, after, servedRps)
    onChange(prop.key, value)
    if (deltas.length) setFlash({ key: prop.key, deltas })
  }

  const basic = shown.filter((p) => !p.advanced)
  const advanced = shown.filter((p) => p.advanced)

  return (
    <div className="space-y-4 p-3">
      {basic.map((prop) => (
        <PropertyRow key={prop.key} def={def} prop={prop} props={props} onSet={set} flash={flash?.key === prop.key ? flash.deltas : null} />
      ))}
      {advanced.length > 0 && (
        <details className="group rounded-lg border border-line">
          <summary className="focusable cursor-pointer list-none px-2.5 py-2 text-[11px] font-medium text-ink-faint transition hover:text-ink-dim">
            <span className="inline-flex items-center gap-1.5">
              <svg className="transition-transform group-open:rotate-90" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
              Advanced settings ({advanced.length})
            </span>
          </summary>
          <div className="space-y-4 border-t border-line p-2.5">
            {advanced.map((prop) => (
              <PropertyRow key={prop.key} def={def} prop={prop} props={props} onSet={set} flash={flash?.key === prop.key ? flash.deltas : null} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function PropertyRow({
  def, prop, props, onSet, flash,
}: {
  def: ResourceDef
  prop: PropDef
  props: PropBag
  onSet: (prop: PropDef, value: PropValue) => void
  flash: ImpactDelta[] | null
}) {
  const [showWhy, setShowWhy] = useState(false)
  const value = props[prop.key]
  const danger = prop.danger?.(value, props) ?? null

  return (
    <div className={clsx('rounded-lg transition-colors', danger && '-mx-1.5 border border-alarm/25 bg-alarm/5 px-1.5 py-2')}>
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-[12px] font-medium text-ink">{prop.label}</label>
        <div className="flex shrink-0 items-center gap-1">
          {(prop.affects ?? []).map((a) => (
            <span
              key={a}
              title={`Changes ${AFFECT_LABEL[a]?.label ?? a}`}
              className="rounded px-1 py-px text-[8.5px] font-semibold uppercase tracking-wider"
              style={{
                color: AFFECT_LABEL[a]?.color ?? 'var(--color-ink-faint)',
                background: `color-mix(in oklab, ${AFFECT_LABEL[a]?.color ?? 'var(--color-ink-faint)'} 12%, transparent)`,
              }}
            >
              {AFFECT_LABEL[a]?.label ?? a}
            </span>
          ))}
        </div>
      </div>

      <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">{prop.help}</p>

      <div className="mt-2">
        <Control def={def} prop={prop} value={value} onSet={(v) => onSet(prop, v)} />
      </div>

      {danger && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-alarm">
          <svg className="mt-0.5 shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 8v5M12 17h.01" />
            <path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
          {danger}
        </p>
      )}

      {flash && flash.length > 0 && (
        <div className="mt-2 space-y-1 rounded-lg border border-line bg-abyss/70 p-2" style={{ animation: 'var(--animate-float-in)' }}>
          {flash.map((d) => (
            <div key={d.key} className="flex items-center gap-2 text-[11px] tabular-nums">
              <span className="w-[86px] shrink-0 text-ink-faint">{d.label}</span>
              <span className="text-ink-faint line-through">{d.format(d.before)}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-faint">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              <span className={clsx('font-semibold', d.better ? 'text-signal' : 'text-ember')}>{d.format(d.after)}</span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setShowWhy((v) => !v)}
        className="focusable mt-1.5 text-[10.5px] text-ink-faint underline decoration-dotted underline-offset-2 transition hover:text-signal"
      >
        {showWhy ? 'Hide' : 'What happens when I change this?'}
      </button>
      {showWhy && (
        <p className="mt-1.5 rounded-lg border-l-2 border-signal/50 bg-signal/5 py-1.5 pl-2.5 pr-2 text-[11px] leading-relaxed text-ink-dim">
          {prop.impact}
        </p>
      )}
    </div>
  )
}

function Control({
  def, prop, value, onSet,
}: {
  def: ResourceDef
  prop: PropDef
  value: PropValue
  onSet: (v: PropValue) => void
}) {
  switch (prop.type) {
    case 'boolean':
      return (
        <Toggle
          checked={value === true}
          onChange={onSet}
          label={value === true ? 'Enabled' : 'Disabled'}
          danger={Boolean(prop.danger?.(true, {}))}
        />
      )
    case 'number':
      return (
        <Slider
          value={Number(value)}
          min={prop.min ?? 0}
          max={prop.max ?? 100}
          step={prop.step ?? 1}
          unit={prop.unit}
          onChange={onSet}
        />
      )
    case 'select':
      return <Select value={String(value)} options={prop.options ?? []} onChange={onSet} />
    case 'multiselect':
      return (
        <MultiSelect
          value={Array.isArray(value) ? value : []}
          options={(prop.options ?? []).map((o) => ({ value: o.value, label: o.label }))}
          onChange={onSet}
        />
      )
    case 'cidr':
      return <TextInput value={String(value)} onChange={onSet} mono placeholder="10.0.0.0/16" />
    default:
      return <TextInput value={String(value)} onChange={onSet} placeholder={def.short} />
  }
}
