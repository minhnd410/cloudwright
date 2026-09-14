import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { ReactFlowProvider } from '@xyflow/react'
import { Canvas } from '@/canvas/Canvas'
import { Palette } from '@/panels/Palette'
import { Inspector } from '@/panels/Inspector'
import { Advisor } from '@/panels/Advisor'
import { Observability } from '@/panels/Observability'
import { MissionHud } from '@/scenarios/MissionHud'
import { TopBar } from './TopBar'
import { useAutosave, useShortcuts, useSimLoop } from './useSimLoop'
import { useGame } from '@/store/gameStore'
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

  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [bottomOpen, setBottomOpen] = useState(true)
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
          setRightOpen(true)
        }
      }),
    [],
  )

  return (
    <div className="flex h-full flex-col overflow-hidden bg-void">
      <TopBar />

      <div className="flex min-h-0 flex-1">
        {/* Palette */}
        <aside
          className={clsx(
            'relative shrink-0 border-r border-line bg-surface transition-[width] duration-200',
            leftOpen ? 'w-[262px]' : 'w-0',
          )}
        >
          {leftOpen && <Palette />}
          <PanelToggle side="right" open={leftOpen} onClick={() => setLeftOpen((v) => !v)} label="palette" />
        </aside>

        {/* Canvas + bottom dock */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <Canvas />
            <MissionHud />
          </div>

          <section
            className={clsx(
              'relative shrink-0 border-t border-line bg-surface transition-[height] duration-200',
              bottomOpen ? 'h-[230px]' : 'h-0',
            )}
          >
            {bottomOpen && <Observability />}
            <PanelToggle side="up" open={bottomOpen} onClick={() => setBottomOpen((v) => !v)} label="telemetry" />
          </section>
        </main>

        {/* Inspector / review */}
        <aside
          className={clsx(
            'relative shrink-0 border-l border-line bg-surface transition-[width] duration-200',
            rightOpen ? 'w-[330px]' : 'w-0',
          )}
        >
          {rightOpen && (
            <div className="flex h-full flex-col">
              <Tabs<RightTab>
                value={rightTab}
                onChange={setRightTab}
                tabs={[
                  { id: 'inspector', label: 'Inspector' },
                  { id: 'review', label: 'Review', badge: criticalCount },
                ]}
              />
              <div className="min-h-0 flex-1">
                {rightTab === 'inspector' ? <Inspector /> : <Advisor />}
              </div>
            </div>
          )}
          <PanelToggle side="left" open={rightOpen} onClick={() => setRightOpen((v) => !v)} label="inspector" />
        </aside>
      </div>
    </div>
  )
}

function PanelToggle({
  side, open, onClick, label,
}: {
  side: 'left' | 'right' | 'up'
  open: boolean
  onClick: () => void
  label: string
}) {
  const position = {
    right: 'top-1/2 -right-3 -translate-y-1/2',
    left: 'top-1/2 -left-3 -translate-y-1/2',
    up: 'left-1/2 -top-3 -translate-x-1/2',
  }[side]

  const rotation = {
    right: open ? 'rotate-180' : 'rotate-0',
    left: open ? 'rotate-0' : 'rotate-180',
    up: open ? '-rotate-90' : 'rotate-90',
  }[side]

  return (
    <button
      onClick={onClick}
      aria-label={`${open ? 'Hide' : 'Show'} ${label}`}
      title={`${open ? 'Hide' : 'Show'} ${label}`}
      className={clsx(
        'absolute z-30 grid size-6 place-items-center rounded-full border border-line bg-deep text-ink-faint shadow-lg transition hover:border-line-bright hover:text-ink focusable',
        position,
      )}
    >
      <svg className={clsx('transition-transform', rotation)} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15 18-6-6 6-6" />
      </svg>
    </button>
  )
}
