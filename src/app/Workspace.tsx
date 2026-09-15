import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { ReactFlowProvider } from '@xyflow/react'
import { Canvas } from '@/canvas/Canvas'
import { Palette } from '@/panels/Palette'
import { Inspector } from '@/panels/Inspector'
import { Advisor } from '@/panels/Advisor'
import { Observability } from '@/panels/Observability'
import { MissionHud } from '@/scenarios/MissionHud'
import { TopBar } from './TopBar'
import { TabBar } from './TabBar'
import { useAutosave, useShortcuts, useSimLoop } from './useSimLoop'
import { useGame } from '@/store/gameStore'
import { PANEL_META, useUi, type PanelId } from '@/store/uiStore'
import { ReplayBar } from '@/panels/ReplayBar'
import { Tabs } from '@/ui/primitives'

type RightTab = 'inspector' | 'review'

export function Workspace() {
  return (
    <ReactFlowProvider>
      <WorkspaceInner />
    </ReactFlowProvider>
  )
}

function WorkspaceInner() {
  useSimLoop()
  useAutosave()
  useShortcuts()

  const chromeless = useUi((s) => s.chromeless)
  const [rightTab, setRightTab] = useState<RightTab>('inspector')

  const findings = useGame((s) => s.findings)
  const criticalCount = findings.filter((f) => f.severity === 'critical' || f.severity === 'high').length

  // Selecting something on the canvas brings the inspector forward. Subscribing
  // to the store keeps this an event reaction rather than a render cascade.
  useEffect(
    () =>
      useGame.subscribe((state, prev) => {
        const selected = state.selectedNodeId ?? state.selectedEdgeId
        const before = prev.selectedNodeId ?? prev.selectedEdgeId
        if (selected && selected !== before) {
          setRightTab('inspector')
          useUi.getState().setPanel('inspector', true)
        }
      }),
    [],
  )

  if (chromeless) {
    return (
      <div className="h-full bg-void">
        <Canvas />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-void">
      <SmallScreenNotice />
      <TopBar />
      <TabBar />

      <div className="flex min-h-0 flex-1">
        <PanelColumn id="palette" side="left" width={262}>
          <Palette />
        </PanelColumn>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <Canvas />
            <MissionHud />
            <ReplayBar />
          </div>

          <PanelRow id="telemetry" height={230}>
            <Observability />
          </PanelRow>
        </main>

        <PanelColumn id="inspector" side="right" width={330}>
          <div className="flex h-full flex-col">
            <Tabs<RightTab>
              value={rightTab}
              onChange={setRightTab}
              tabs={[
                { id: 'inspector', label: 'Inspector' },
                { id: 'review', label: 'Review', badge: criticalCount },
              ]}
            />
            <div className="min-h-0 flex-1">{rightTab === 'inspector' ? <Inspector /> : <Advisor />}</div>
          </div>
        </PanelColumn>
      </div>
    </div>
  )
}

/**
 * A side panel that, when hidden, leaves a labelled vertical strip behind
 * rather than a lone circle — so it is obvious both that something is hidden
 * and what it is.
 */
function PanelColumn({
  id, side, width, children,
}: {
  id: PanelId
  side: 'left' | 'right'
  width: number
  children: React.ReactNode
}) {
  const open = useUi((s) => s.panels[id])
  const setPanel = useUi((s) => s.setPanel)
  const meta = PANEL_META[id]

  if (!open) {
    return (
      <button
        onClick={() => setPanel(id, true)}
        title={`Show ${meta.label.toLowerCase()} (${meta.shortcut})`}
        className={clsx(
          'focusable group flex w-8 shrink-0 flex-col items-center gap-2 bg-surface/50 py-3 text-ink-faint transition hover:bg-surface hover:text-ink',
          side === 'left' ? 'border-r border-line' : 'border-l border-line',
        )}
      >
        <svg
          className={clsx('shrink-0 transition-transform group-hover:scale-110', side === 'left' ? '' : 'rotate-180')}
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        <span
          className="whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.14em]"
          style={{ writingMode: 'vertical-rl', transform: side === 'left' ? 'rotate(180deg)' : undefined }}
        >
          {meta.label}
        </span>
      </button>
    )
  }

  return (
    <aside
      className={clsx('relative shrink-0 bg-surface', side === 'left' ? 'border-r border-line' : 'border-l border-line')}
      style={{ width }}
    >
      {children}
      <button
        onClick={() => setPanel(id, false)}
        title={`Hide ${meta.label.toLowerCase()} (${meta.shortcut})`}
        aria-label={`Hide ${meta.label}`}
        className={clsx(
          'focusable absolute top-1/2 z-30 grid size-6 -translate-y-1/2 place-items-center rounded-full border border-line bg-deep text-ink-faint shadow-lg transition hover:border-line-bright hover:text-ink',
          side === 'left' ? '-right-3' : '-left-3',
        )}
      >
        <svg
          className={clsx(side === 'left' ? 'rotate-180' : '')}
          width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
    </aside>
  )
}

function PanelRow({ id, height, children }: { id: PanelId; height: number; children: React.ReactNode }) {
  const open = useUi((s) => s.panels[id])
  const setPanel = useUi((s) => s.setPanel)
  const meta = PANEL_META[id]

  if (!open) {
    return (
      <button
        onClick={() => setPanel(id, true)}
        title={`Show ${meta.label.toLowerCase()} (${meta.shortcut})`}
        className="focusable group flex h-7 shrink-0 items-center justify-center gap-2 border-t border-line bg-surface/50 text-ink-faint transition hover:bg-surface hover:text-ink"
      >
        <svg
          className="shrink-0 -rotate-90 transition-transform group-hover:scale-110"
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        <span className="text-[10px] font-medium uppercase tracking-[0.14em]">{meta.label}</span>
      </button>
    )
  }

  return (
    <section className="relative shrink-0 border-t border-line bg-surface" style={{ height }}>
      {children}
      <button
        onClick={() => setPanel(id, false)}
        title={`Hide ${meta.label.toLowerCase()} (${meta.shortcut})`}
        aria-label={`Hide ${meta.label}`}
        className="focusable absolute -top-3 left-1/2 z-30 grid size-6 -translate-x-1/2 place-items-center rounded-full border border-line bg-deep text-ink-faint shadow-lg transition hover:border-line-bright hover:text-ink"
      >
        <svg className="-rotate-90" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
    </section>
  )
}

/**
 * The canvas needs room: three panels, drag-and-drop and precise handles do not
 * work on a phone. Saying so is better than shipping something unusable.
 */
function SmallScreenNotice() {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-void p-8 lg:hidden">
      <div className="max-w-sm text-center">
        <svg
          className="mx-auto text-line-bright" width="44" height="44" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"
        >
          <rect x="2" y="4" width="20" height="14" rx="2.5" />
          <path d="M8 21h8M12 18v3" />
        </svg>
        <h1 className="mt-4 text-balance text-[17px] font-semibold text-ink">The canvas needs a bigger screen</h1>
        <p className="mt-2 text-balance text-[13px] leading-relaxed text-ink-dim">
          Building architectures means dragging between small handles across three panels — it genuinely
          does not work on a narrow display. Come back on a laptop.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link to="/codex" className="focusable rounded-xl bg-signal px-4 py-2 text-[12.5px] font-semibold text-void transition hover:brightness-110">
            Read the codex instead
          </Link>
          <Link to="/" className="focusable rounded-xl border border-line px-4 py-2 text-[12.5px] font-medium text-ink-dim transition hover:border-line-bright hover:text-ink">
            Back to the start
          </Link>
        </div>
      </div>
    </div>
  )
}
