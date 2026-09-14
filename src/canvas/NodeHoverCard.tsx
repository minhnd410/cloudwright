import { getResource, PROVIDER_META, archetypeLabel } from '@/catalog/registry'
import { useGame } from '@/store/gameStore'
import { ResourceIcon } from '@/ui/ResourceIcon'
import { currentSummary } from '@/panels/inspector/impact'

export interface HoverTarget {
  nodeId: string
  /** Node edges relative to the canvas wrapper. */
  left: number
  right: number
  top: number
  /** Canvas width at the moment of hover, used to decide which side to flip to. */
  width: number
}

/**
 * The "what is this, and how would I build it" card. Appears on hover so the
 * canvas can be read without clicking through every node.
 */
export function NodeHoverCard({ target }: { target: HoverTarget }) {
  const node = useGame((s) => s.nodes.find((n) => n.id === target.nodeId))
  const state = useGame((s) => s.sim?.nodes[target.nodeId])
  if (!node) return null

  const def = getResource(node.data.defId)
  if (!def) return null

  const provider = PROVIDER_META[def.provider]
  const summary = currentSummary(def, node.data.props, state?.served ?? 0)
  const gotcha = def.setup?.gotchas?.[0]

  // Sit beside the node, never on top of it — flipping to the left when there
  // is not enough room on the right.
  const CARD = 320
  const GAP = 14
  const flipped = target.right + CARD + GAP > target.width
  const left = flipped ? Math.max(8, target.left - CARD - GAP) : target.right + GAP

  return (
    <div
      className="pointer-events-none absolute z-40 w-[320px] rounded-xl border border-line bg-deep/97 p-3 shadow-2xl backdrop-blur-xl"
      style={{ left, top: Math.max(8, target.top - 32), animation: 'var(--animate-float-in)' }}
      role="tooltip"
    >
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 shrink-0 rounded-lg p-1.5"
          style={{ background: `color-mix(in oklab, ${provider.color} 13%, transparent)`, color: provider.color }}
        >
          <ResourceIcon icon={def.icon} archetype={def.archetype} size={17} />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-tight text-ink">{def.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px]">
            <span style={{ color: provider.color }}>{provider.short}</span>
            <span className="text-ink-faint">·</span>
            <span className="text-ink-faint">{archetypeLabel(def.archetype)}</span>
          </div>
        </div>
      </div>

      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-dim">{def.tagline}.</p>

      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-2 font-mono text-[10px] tabular-nums text-ink-faint">
        <span>{summary.fmtRps(summary.capacity)} capacity</span>
        <span>{summary.fmtNines(summary.availability)} available</span>
        {summary.cost > 0 && <span className="text-coin">{summary.fmtUsd(summary.cost)}</span>}
        {state && state.demand > 0 && (
          <span className={state.errorRate > 0.01 ? 'text-alarm' : 'text-signal'}>
            {state.served.toFixed(0)} rps · {state.latencyMs.toFixed(0)}ms
          </span>
        )}
      </div>

      {gotcha && (
        <p className="mt-2 border-l-2 border-ember/50 bg-ember/5 py-1.5 pl-2 pr-1.5 text-[11px] leading-relaxed text-ink-dim">
          {gotcha}
        </p>
      )}

      <p className="mt-2 text-[10px] text-ink-faint">
        Click to configure it, or open <span className="text-ink-dim">Build it</span> for the real commands.
      </p>
    </div>
  )
}
