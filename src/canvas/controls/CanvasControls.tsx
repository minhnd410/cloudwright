import { useState } from 'react'
import { MiniMap, useReactFlow } from '@xyflow/react'
import { EDGE_KIND_META } from '@/catalog/schema/flows'
import { getResource } from '@/catalog/registry'
import type { CwNode } from '@/store/types'
import { useGame } from '@/store/gameStore'

const STATUS_COLOR: Record<string, string> = {
  idle: '#3a4a66', healthy: '#38e0c8', saturated: '#ffa94d',
  degraded: '#ff5f6d', down: '#ff5f6d', breached: '#ff3d9e',
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="focusable grid size-8 place-items-center rounded-lg text-ink-dim transition hover:bg-raised hover:text-ink"
    >
      {children}
    </button>
  )
}

export function CanvasControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const [showMap, setShowMap] = useState(true)
  const [showLegend, setShowLegend] = useState(false)
  const sim = useGame((s) => s.sim)
  const isEmpty = useGame((s) => s.nodes.length === 0)

  return (
    <>
      <div className="absolute bottom-4 left-4 z-30 flex flex-col gap-1.5">
        <div className="panel flex flex-col rounded-xl p-1">
          <IconButton label="Zoom in" onClick={() => zoomIn({ duration: 180 })}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 6v12M6 12h12" />
            </svg>
          </IconButton>
          <IconButton label="Zoom out" onClick={() => zoomOut({ duration: 180 })}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 12h12" />
            </svg>
          </IconButton>
          <IconButton label="Fit to view" onClick={() => fitView({ duration: 280, padding: 0.25 })}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
            </svg>
          </IconButton>
          <IconButton label="Toggle minimap" onClick={() => setShowMap((v) => !v)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
              <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z" />
              <path d="M9 4v13M15 6.5v13" />
            </svg>
          </IconButton>
          <IconButton label="Connection legend" onClick={() => setShowLegend((v) => !v)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h10" />
            </svg>
          </IconButton>
        </div>

        {showLegend && (
          <div className="panel w-52 rounded-xl p-3" style={{ animation: 'var(--animate-float-in)' }}>
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Connection types</h4>
            <ul className="mt-2 space-y-1.5">
              {Object.entries(EDGE_KIND_META).map(([kind, meta]) => (
                <li key={kind} className="flex items-center gap-2 text-[11px] text-ink-dim">
                  <span className="h-0.5 w-5 rounded-full" style={{ background: meta.color }} />
                  {meta.label}
                </li>
              ))}
            </ul>
            <h4 className="mt-3 border-t border-line pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Node status
            </h4>
            <ul className="mt-2 space-y-1.5">
              {[['healthy', 'Serving normally'], ['saturated', 'Near capacity'], ['degraded', 'Failing requests'], ['down', 'Not responding'], ['breached', 'Compromised']].map(([k, label]) => (
                <li key={k} className="flex items-center gap-2 text-[11px] text-ink-dim">
                  <span className="size-2 rounded-full" style={{ background: STATUS_COLOR[k] }} />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {showMap && !isEmpty && (
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          className="!bottom-4 !right-4 !m-0 !rounded-xl !border !border-line !bg-abyss/90 !backdrop-blur"
          maskColor="rgba(5, 7, 13, 0.72)"
          nodeStrokeWidth={2}
          nodeColor={(node) => {
            const status = sim?.nodes[node.id]?.status ?? 'idle'
            if (status !== 'idle') return STATUS_COLOR[status]
            const def = getResource(String((node as CwNode).data?.defId))
            return def?.container ? '#1b2537' : '#2e3f5c'
          }}
        />
      )}
    </>
  )
}
