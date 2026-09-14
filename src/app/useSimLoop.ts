import { useEffect } from 'react'
import { useGame } from '@/store/gameStore'

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

/** Autosaves the diagram shortly after it stops changing. */
export function useAutosave() {
  const nodes = useGame((s) => s.nodes)
  const edges = useGame((s) => s.edges)
  const name = useGame((s) => s.name)
  const save = useGame((s) => s.save)

  useEffect(() => {
    const timer = setTimeout(save, 900)
    return () => clearTimeout(timer)
  }, [nodes, edges, name, save])
}

/** Keyboard shortcuts that make the canvas feel like a real tool. */
export function useShortcuts() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (target?.isContentEditable) return
      // Space already activates a focused button or link; do not also fire here.
      if (event.key === ' ' && target?.closest('button, a, [role="tab"]')) return
      if (event.metaKey || event.ctrlKey) return

      const store = useGame.getState()
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
