import clsx from 'clsx'
import { useId, useMemo, useState, type ReactNode } from 'react'

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pb-1.5 pt-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{children}</h3>
      {action}
    </div>
  )
}

export function Tabs<T extends string>({
  tabs, value, onChange, dense = false,
}: {
  tabs: { id: T; label: string; badge?: number | string }[]
  value: T
  onChange: (id: T) => void
  dense?: boolean
}) {
  return (
    <div role="tablist" className="flex gap-0.5 border-b border-line px-1.5">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            'focusable relative flex items-center gap-1.5 rounded-t-md font-medium transition-colors',
            dense ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs',
            value === t.id ? 'text-ink' : 'text-ink-faint hover:text-ink-dim',
          )}
        >
          {t.label}
          {t.badge !== undefined && t.badge !== 0 && (
            <span className="rounded-full bg-raised px-1.5 py-px text-[9px] tabular-nums text-ink-dim">{t.badge}</span>
          )}
          {value === t.id && <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-signal" />}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked, onChange, label, description, danger,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  description?: ReactNode
  danger?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx(
          'focusable mt-0.5 h-[18px] w-8 shrink-0 rounded-full border transition-colors',
          checked
            ? danger ? 'border-alarm bg-alarm/70' : 'border-signal bg-signal/70'
            : 'border-line-bright bg-raised',
        )}
      >
        <span
          className={clsx(
            'block size-3 rounded-full bg-ink transition-transform',
            checked ? 'translate-x-[15px]' : 'translate-x-0.5',
          )}
        />
      </button>
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer select-none">
        <span className="block text-[12px] font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[11px] leading-snug text-ink-faint">{description}</span>}
      </label>
    </div>
  )
}

export function Slider({
  value, min, max, step = 1, onChange, unit, format,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  unit?: string
  format?: (v: number) => string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="flex items-center gap-2.5">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="focusable h-1 flex-1 cursor-pointer appearance-none rounded-full outline-offset-4
          [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-deep [&::-webkit-slider-thumb]:bg-signal
          [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2
          [&::-moz-range-thumb]:border-deep [&::-moz-range-thumb]:bg-signal"
        style={{ background: `linear-gradient(90deg, var(--color-signal) ${pct}%, var(--color-line) ${pct}%)` }}
      />
      <span className="w-[62px] shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-dim">
        {format ? format(value) : value}{unit ?? ''}
      </span>
    </div>
  )
}

export function Select({
  value, options, onChange,
}: {
  value: string
  options: { value: string; label: string; note?: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="focusable w-full appearance-none rounded-lg border border-line bg-raised px-2.5 py-1.5 pr-8 text-[12px] text-ink transition hover:border-line-bright"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-deep">{o.label}</option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      {options.find((o) => o.value === value)?.note && (
        <p className="text-[10.5px] leading-snug text-ink-faint">{options.find((o) => o.value === value)!.note}</p>
      )}
    </div>
  )
}

export function MultiSelect({
  value, options, onChange,
}: {
  value: string[]
  options: { value: string; label: string }[]
  onChange: (v: string[]) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.value)
        return (
          <button
            key={o.value}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={clsx(
              'focusable rounded-md border px-2 py-1 text-[11px] transition',
              on ? 'border-signal/60 bg-signal/12 text-signal' : 'border-line bg-raised text-ink-faint hover:border-line-bright hover:text-ink-dim',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function TextInput({
  value, onChange, placeholder, mono,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={clsx(
        'focusable w-full rounded-lg border border-line bg-raised px-2.5 py-1.5 text-[12px] text-ink placeholder:text-ink-faint transition hover:border-line-bright',
        mono && 'font-mono',
      )}
    />
  )
}

export function Sparkline({
  data, color = 'var(--color-signal)', height = 34, max, fill = true, label,
}: {
  data: number[]
  color?: string
  height?: number
  max?: number
  fill?: boolean
  label?: string
}) {
  const path = useMemo(() => {
    if (data.length < 2) return null
    // A little headroom, so a flat series reads as a line rather than a block.
    const hi = (max ?? Math.max(...data, 1e-9)) * 1.15
    const lo = 0
    const range = hi - lo || 1
    const step = 100 / (data.length - 1)
    const pts = data.map((v, i) => [i * step, 100 - ((v - lo) / range) * 100] as const)
    const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
    return { line, area: `${line} L100,100 L0,100 Z` }
  }, [data, max])

  const gid = useId().replace(/:/g, '')

  return (
    <div className="relative w-full" style={{ height }} aria-label={label}>
      {path ? (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="size-full overflow-visible">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {fill && <path d={path.area} fill={`url(#${gid})`} />}
          <path d={path.line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      ) : (
        <div className="grid size-full place-items-center text-[10px] text-ink-faint">no data yet</div>
      )}
    </div>
  )
}

export function Meter({ value, max = 1, color, height = 4 }: { value: number; max?: number; color?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100
  return (
    <div className="w-full overflow-hidden rounded-full bg-line" style={{ height }}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${pct}%`, background: color ?? 'var(--color-signal)' }}
      />
    </div>
  )
}

export function Stat({
  label, value, sub, tone = 'default',
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'default' | 'good' | 'warn' | 'bad'
}) {
  const colour = { default: 'text-ink', good: 'text-signal', warn: 'text-ember', bad: 'text-alarm' }[tone]
  return (
    <div className="min-w-0">
      <div className="text-[9.5px] font-medium uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={clsx('mt-0.5 truncate font-mono text-[15px] font-semibold tabular-nums leading-none', colour)}>
        {value}
      </div>
      {sub && <div className="mt-1 truncate text-[10px] text-ink-faint">{sub}</div>}
    </div>
  )
}

export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="group relative overflow-hidden rounded-lg border border-line bg-abyss">
      <div className="flex items-center justify-between border-b border-line bg-deep/60 px-2.5 py-1">
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-faint">{lang ?? 'text'}</span>
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1400)
            })
          }}
          className="focusable rounded px-1.5 py-0.5 text-[10px] text-ink-faint transition hover:bg-raised hover:text-ink"
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-2.5 text-[11px] leading-relaxed text-ink-dim">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  )
}

export function Callout({
  tone = 'info', title, children,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'good'
  title?: ReactNode
  children: ReactNode
}) {
  const styles = {
    info: 'border-flux/30 bg-flux/6 text-flux',
    warn: 'border-ember/30 bg-ember/6 text-ember',
    danger: 'border-alarm/35 bg-alarm/7 text-alarm',
    good: 'border-signal/30 bg-signal/6 text-signal',
  }[tone]
  return (
    <div className={clsx('rounded-lg border px-2.5 py-2', styles)}>
      {title && <div className="text-[11px] font-semibold">{title}</div>}
      <div className={clsx('text-[11px] leading-relaxed text-ink-dim', title && 'mt-1')}>{children}</div>
    </div>
  )
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="px-3 py-8 text-center text-[11.5px] leading-relaxed text-ink-faint">{children}</p>
}
