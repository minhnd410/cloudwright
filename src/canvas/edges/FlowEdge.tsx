import { memo, useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useInternalNode, type EdgeProps } from '@xyflow/react'
import { FLOW_META } from '@/catalog/schema/flows'
import { getResource } from '@/catalog/registry'
import type { CwEdge } from '@/store/types'
import { useEdgeSimState, useSimSpeed } from '../simView'

/** How many packets to animate at a given intensity. More traffic, more dots. */
function packetCount(intensity: number) {
  if (intensity <= 0.02) return 0
  return Math.max(1, Math.min(6, Math.round(intensity * 6)))
}

function formatRps(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  if (v >= 10) return v.toFixed(0)
  return v.toFixed(1)
}

export const FlowEdge = memo(function FlowEdge({
  id, source, target, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data, selected,
}: EdgeProps<CwEdge>) {
  const [hovered, setHovered] = useState(false)
  const state = useEdgeSimState(id)
  const speed = useSimSpeed()
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  const [path, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.28,
  })

  const flow = data?.flow ?? 'http'
  const meta = FLOW_META[flow]
  const active = state?.active ?? false
  const intensity = state?.intensity ?? 0
  const errorRate = state?.errorRate ?? 0
  const attackShare = state?.attackShare ?? 0

  const colour =
    attackShare > 0.15 ? 'var(--color-toxic)'
      : errorRate > 0.25 ? 'var(--color-alarm)'
      : errorRate > 0.05 ? 'var(--color-ember)'
      : meta.color

  const packets = speed > 0 ? packetCount(intensity) : 0
  // Faster traffic means faster packets, but never so fast it becomes a blur.
  const travelSeconds = Math.max(0.7, 2.8 - intensity * 1.9) / Math.max(speed, 1)

  const sourceName = sourceNode ? getResource(String((sourceNode.data as { defId?: string }).defId))?.short : undefined
  const targetName = targetNode ? getResource(String((targetNode.data as { defId?: string }).defId))?.short : undefined

  return (
    <>
      {/* Wide invisible path so the edge is easy to hover */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={18}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: 'pointer' }}
      />

      <BaseEdge
        id={id}
        path={path}
        className="cw-edge-base"
        style={{
          stroke: colour,
          strokeWidth: selected || hovered ? 2.4 : active ? 1.9 : 1.3,
          opacity: active ? 0.9 : 'var(--edge-idle-opacity)',
          transition: 'stroke-width 0.15s, opacity 0.25s',
        }}
      />

      {/* Directional dash overlay while traffic is moving */}
      {active && speed > 0 && (
        <path
          d={path}
          fill="none"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeDasharray="1 14"
          opacity={0.75}
          style={{ stroke: colour, animation: `dash ${1.4 / Math.max(speed, 1)}s linear infinite` }}
        />
      )}

      {/* Packets travelling along the wire */}
      {Array.from({ length: packets }).map((_, i) => (
        <circle key={i} r={attackShare > 0.15 ? 3.4 : 2.6} style={{ fill: colour }}>
          <animateMotion
            dur={`${travelSeconds}s`}
            repeatCount="indefinite"
            begin={`${(i * travelSeconds) / packets}s`}
            path={path}
            keyPoints="0;1"
            keyTimes="0;1"
            calcMode="linear"
          />
        </circle>
      ))}

      {(hovered || selected) && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute z-50 w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-deep/97 p-3 shadow-2xl backdrop-blur"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, animation: 'var(--animate-float-in)' }}
          >
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ background: colour }} />
              <span className="text-[12px] font-semibold text-ink">{meta.label}</span>
              <span className="ml-auto rounded bg-raised px-1.5 py-0.5 font-mono text-[9px] text-ink-faint">
                L{meta.osi}
              </span>
            </div>
            {sourceName && targetName && (
              <div className="mt-1 font-mono text-[10px] text-ink-faint">
                {sourceName} → {targetName}
                {meta.port ? `  :${meta.port}` : ''}
              </div>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-ink-dim">{meta.blurb}</p>
            {state && state.active && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2 text-[10px] tabular-nums text-ink-faint">
                <span>{formatRps(state.throughput)} rps</span>
                {errorRate > 0.005 && <span className="text-alarm">{(errorRate * 100).toFixed(1)}% failing</span>}
                {attackShare > 0.05 && <span className="text-toxic">{(attackShare * 100).toFixed(0)}% hostile</span>}
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})
