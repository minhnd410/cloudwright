import { useEffect } from 'react'
import { useGame } from '@/store/gameStore'
import { useTabs } from '@/store/tabStore'
import { useUi, type PanelId } from '@/store/uiStore'

const BASE_TICK_MS = 700

/**
 * Drives the simulation. One interval, adjusted by the speed multiplier, so
 * the engine stays a pure function and React only decides when to call it.
 */
export function useSimLoop() {
  const speed = useGame((s) => s.speed)
  const step = useGame((s) => s.step)

  useEffect(() => {
    if (speed === 0) return
    const interval = setInterval(step, BASE_TICK_MS / speed)
    return () => clearInterval(interval)
  }, [speed, step])
}

/** Autosaves the whole workspace shortly after the active document changes. */
export function useAutosave() {
  const nodes = useGame((s) => s.nodes)
  const edges = useGame((s) => s.edges)
  const name = useGame((s) => s.name)

  useEffect(() => {
    const timer = setTimeout(() => {
      const tabs = useTabs.getState()
      tabs.syncActive()
      tabs.persist()
    }, 900)
    return () => clearTimeout(timer)
  }, [nodes, edges, name])
}

/** Keyboard shortcuts that make the canvas feel like a real tool. */
export interface Shortcut {
  keys: string
  action: string
}

/** Shown in the help popover, and the single description of what is bound. */
export const SHORTCUTS: Shortcut[] = [
  { keys: 'Space', action: 'Play or pause the simulation' },
  { keys: 'R', action: 'Reset the simulation' },
  { keys: 'X', action: 'Break something at random' },
  { keys: '⌘Z / Ctrl+Z', action: 'Undo' },
  { keys: '⇧⌘Z / Ctrl+Y', action: 'Redo' },
  { keys: '⌘D / Ctrl+D', action: 'Duplicate the selected resource' },
  { keys: '⌘1 / ⌘2 / ⌘3', action: 'Show or hide the palette, inspector, telemetry' },
  { keys: 'Delete', action: 'Remove the selection' },
  { keys: 'Esc', action: 'Deselect and dismiss' },
]

export function useShortcuts() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (target?.isContentEditable) return

      const store = useGame.getState()

      if (event.metaKey || event.ctrlKey) {
        const key = event.key.toLowerCase()
        if (key === 'z') {
          event.preventDefault()
          if (event.shiftKey) store.redo()
          else store.undo()
        } else if (key === 'y') {
          event.preventDefault()
          store.redo()
        } else if (key === 'd' && store.selectedNodeId) {
          event.preventDefault()
          store.duplicateNode(store.selectedNodeId)
        } else if (key === '1' || key === '2' || key === '3') {
          event.preventDefault()
          const panel = ({ '1': 'palette', '2': 'inspector', '3': 'telemetry' } as Record<string, PanelId>)[key]
          useUi.getState().toggle(panel)
        }
        return
      }

      // Space already activates a focused button or link; do not fire twice.
      if (event.key === ' ' && target?.closest('button, a, [role="tab"]')) return

      switch (event.key) {
        case ' ':
          event.preventDefault()
          store.setSpeed(store.speed === 0 ? 1 : 0)
          break
        case 'r':
          store.resetSim()
          break
        case 'x':
          store.randomIncident()
          break
        case 'Escape':
          store.select(null, null)
          store.dismissRejection()
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
