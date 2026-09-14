import { memo } from 'react'
import { Handle, NodeResizer, type NodeProps } from '@xyflow/react'
import clsx from 'clsx'
import { getResource, dangerWarnings, PROVIDER_META } from '@/catalog/registry'
import { ResourceIcon } from '@/ui/ResourceIcon'
import { useGame } from '@/store/gameStore'
import type { CwNode } from '@/store/types'
import type { NodeState } from '@/sim/types'
import { placePorts, handleStyle } from './ports'

const STATUS_STYLE: Record<NodeState['status'], { ring: string; glow: string; dot: string }> = {
  idle: { ring: 'var(--color-line-bright)', glow: 'transparent', dot: 'var(--color-ink-faint)' },
  healthy: { ring: 'var(--color-signal-dim)', glow: 'color-mix(in oklab, var(--color-signal) 28%, transparent)', dot: 'var(--color-signal)' },
  saturated: { ring: 'var(--color-ember)', glow: 'color-mix(in oklab, var(--color-ember) 34%, transparent)', dot: 'var(--color-ember)' },
  degraded: { ring: 'var(--color-alarm)', glow: 'color-mix(in oklab, var(--color-alarm) 38%, transparent)', dot: 'var(--color-alarm)' },
  down: { ring: 'var(--color-alarm)', glow: 'color-mix(in oklab, var(--color-alarm) 55%, transparent)', dot: 'var(--color-alarm)' },
  breached: { ring: 'var(--color-toxic)', glow: 'color-mix(in oklab, var(--color-toxic) 50%, transparent)', dot: 'var(--color-toxic)' },
}

function formatRps(v: number) {
  if (!Number.isFinite(v)) return '∞'
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  if (v >= 10) return v.toFixed(0)
  return v.toFixed(1)
}

export const ResourceNode = memo(function ResourceNode({ id, data, selected }: NodeProps<CwNode>) {
  const def = getResource(data.defId)
  const state = useGame((s) => s.sim?.nodes[id])
  const running = useGame((s) => s.sim !== null)
  const incidentCount = useGame((s) => s.incidents.filter((i) => i.nodeId === id).length)

  if (!def) {
    return (
      <div className="rounded-xl border border-alarm/50 bg-deep px-3 py-2 text-xs text-alarm">
        Unknown resource: {String(data.defId)}
      </div>
    )
  }

  const status = state?.status ?? 'idle'
  const style = STATUS_STYLE[status]
  const provider = PROVIDER_META[def.provider]
  const ports = placePorts(def)
  const warnings = dangerWarnings(def, data.props)
  const util = state && Number.isFinite(state.utilisation) ? Math.min(state.utilisation, 1.6) : 0

  return (
    <div
      className={clsx(
        'group relative w-[188px] rounded-xl border bg-surface/95 backdrop-blur-sm transition-all duration-200',
        selected ? 'border-signal' : 'border-line',
      )}
      style={{
        boxShadow: selected
          ? `0 0 0 1px var(--color-signal), 0 8px 28px -8px ${style.glow}`
          : `0 0 0 1px ${style.ring}, 0 6px 22px -10px ${style.glow}`,
      }}
    >
      {/* Status pulse for anything actively on fire */}
      {(status === 'down' || status === 'breached') && (
        <span
          className="pointer-events-none absolute -inset-1 rounded-xl"
          style={{ boxShadow: `0 0 0 2px ${style.ring}`, animation: 'var(--animate-pulse-ring)' }}
        />
      )}

      {/* Header */}
      <div className="flex items-start gap-2.5 px-3 pt-2.5 pb-2">
        <span
          className="mt-0.5 shrink-0 rounded-lg p-1.5"
          style={{ background: `color-mix(in oklab, ${provider.color} 14%, transparent)`, color: provider.color }}
        >
          <ResourceIcon icon={def.icon} archetype={def.archetype} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight text-ink">{data.label}</div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="text-[9.5px] font-medium uppercase tracking-wider" style={{ color: provider.color }}>
              {provider.short}
            </span>
            <span className="truncate text-[10px] text-ink-faint">{def.name}</span>
          </div>
        </div>
        <span
          className="mt-1 size-2 shrink-0 rounded-full"
          style={{
            background: style.dot,
            animation: status === 'saturated' || status === 'degraded' ? 'var(--animate-breathe)' : undefined,
          }}
        />
      </div>

      {/* Live telemetry strip */}
      {running && state && state.demand > 0 && (
        <div className="border-t border-line/70 px-3 py-1.5">
          <div className="flex items-baseline justify-between text-[10px] tabular-nums">
            <span className="text-ink-faint">
              <span className="text-ink-dim">{formatRps(state.served)}</span> rps
            </span>
            {state.errorRate > 0.005 && (
              <span className="font-medium text-alarm">{(state.errorRate * 100).toFixed(1)}% err</span>
            )}
            {state.errorRate <= 0.005 && state.demand > 0 && (
              <span className="text-ink-faint">{state.latencyMs.toFixed(0)}ms</span>
            )}
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${Math.min(util * 100, 100)}%`,
                background:
                  util > 1 ? 'var(--color-alarm)' : util > 0.85 ? 'var(--color-ember)' : 'var(--color-signal)',
              }}
            />
          </div>
        </div>
      )}

      {/* Badges */}
      {(warnings.length > 0 || incidentCount > 0 || (state?.breachedBy.length ?? 0) > 0) && (
        <div className="flex flex-wrap gap-1 border-t border-line/70 px-3 py-1.5">
          {incidentCount > 0 && (
            <span className="rounded bg-alarm/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-alarm">
              {incidentCount} incident{incidentCount > 1 ? 's' : ''}
            </span>
          )}
          {(state?.breachedBy.length ?? 0) > 0 && (
            <span className="rounded bg-toxic/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-toxic">
              breached
            </span>
          )}
          {warnings.length > 0 && (
            <span className="rounded bg-ember/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ember">
              {warnings.length} risk{warnings.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Ports */}
      {ports.map((p) => (
        <Handle
          key={p.port.id}
          id={p.port.id}
          type={p.port.side === 'in' ? 'target' : 'source'}
          position={p.position}
          style={handleStyle(p)}
          className="!size-[9px]"
          title={`${p.port.label} — ${p.port.flows.join(', ')}`}
        />
      ))}
    </div>
  )
})

export const ContainerNode = memo(function ContainerNode({ id, data, selected }: NodeProps<CwNode>) {
  const def = getResource(data.defId)
  const state = useGame((s) => s.sim?.nodes[id])
  if (!def) return null

  const provider = PROVIDER_META[def.provider]
  const warnings = dangerWarnings(def, data.props)
  const ports = placePorts(def)
  const tier = String(data.props.tier ?? '')
  const accent =
    tier === 'public' ? 'var(--color-ember)' : tier === 'isolated' ? 'var(--color-signal)' : provider.color

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={150}
        lineClassName="!border-signal/40"
        handleClassName="!size-2 !rounded-sm !bg-signal !border-deep"
      />
      <div
        className={clsx(
          'relative size-full rounded-2xl border-2 border-dashed transition-colors',
          selected ? 'border-signal/70' : 'border-line-bright/60',
        )}
        style={{
          background: `color-mix(in oklab, ${accent} 4%, transparent)`,
          borderColor: selected ? undefined : `color-mix(in oklab, ${accent} 32%, transparent)`,
        }}
      >
        <div className="pointer-events-none absolute left-3 top-2.5 flex items-center gap-2">
          <span className="rounded-md p-1" style={{ background: `color-mix(in oklab, ${accent} 16%, transparent)`, color: accent }}>
            <ResourceIcon icon={def.icon} archetype={def.archetype} size={15} />
          </span>
          <div>
            <div className="text-[12px] font-semibold leading-none text-ink">{data.label}</div>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] leading-none text-ink-faint">
              <span style={{ color: accent }}>{provider.short}</span>
              {data.props.cidr ? <span className="font-mono">{String(data.props.cidr)}</span> : null}
              {tier ? <span className="uppercase tracking-wider">{tier}</span> : null}
              {warnings.length > 0 && <span className="text-ember">⚠ {warnings.length}</span>}
              {state && state.demand > 0 && <span>{state.demand.toFixed(0)} rps</span>}
            </div>
          </div>
        </div>
      </div>
      {ports.map((p) => (
        <Handle
          key={p.port.id}
          id={p.port.id}
          type={p.port.side === 'in' ? 'target' : 'source'}
          position={p.position}
          style={handleStyle(p)}
          title={p.port.label}
        />
      ))}
    </>
  )
})
