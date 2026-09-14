import { Position } from '@xyflow/react'
import type { HandlePosition, Port, ResourceDef } from '@/catalog/schema/types'

export interface PlacedPort {
  port: Port
  position: Position
  /** Percentage offset along that side. */
  offset: number
}

const RF_POSITION: Record<HandlePosition, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}

function sideOf(port: Port): HandlePosition {
  return port.position ?? (port.side === 'in' ? 'left' : 'right')
}

/** Spreads each side's handles evenly so they never collide. */
export function placePorts(def: ResourceDef): PlacedPort[] {
  const bySide = new Map<HandlePosition, Port[]>()
  for (const port of def.ports) {
    if (port.hidden) continue
    const side = sideOf(port)
    const list = bySide.get(side) ?? []
    list.push(port)
    bySide.set(side, list)
  }

  const placed: PlacedPort[] = []
  for (const [side, ports] of bySide) {
    ports.forEach((port, i) => {
      placed.push({
        port,
        position: RF_POSITION[side],
        offset: ((i + 1) / (ports.length + 1)) * 100,
      })
    })
  }
  return placed
}

export function handleStyle(p: PlacedPort): React.CSSProperties {
  const vertical = p.position === Position.Left || p.position === Position.Right
  return vertical ? { top: `${p.offset}%` } : { left: `${p.offset}%` }
}
