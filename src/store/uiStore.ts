import { create } from 'zustand'

const UI_KEY = 'cloudwright:ui:v1'

export type PanelId = 'palette' | 'inspector' | 'telemetry'

export interface UiState {
  panels: Record<PanelId, boolean>
  /** Hides all chrome for screenshots and embeds. */
  chromeless: boolean
  toggle: (panel: PanelId) => void
  setPanel: (panel: PanelId, open: boolean) => void
  showAll: () => void
  setChromeless: (on: boolean) => void
}

function load(): Record<PanelId, boolean> {
  try {
    const raw = localStorage.getItem(UI_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<PanelId, boolean>
      return { palette: parsed.palette !== false, inspector: parsed.inspector !== false, telemetry: parsed.telemetry !== false }
    }
  } catch {
    /* ignore */
  }
  return { palette: true, inspector: true, telemetry: true }
}

function persist(panels: Record<PanelId, boolean>) {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(panels))
  } catch {
    /* ignore */
  }
}

export const PANEL_META: Record<PanelId, { label: string; shortcut: string; hint: string }> = {
  palette: { label: 'Resource palette', shortcut: '⌘1', hint: 'The catalogue on the left' },
  inspector: { label: 'Inspector & review', shortcut: '⌘2', hint: 'Configuration and findings on the right' },
  telemetry: { label: 'Telemetry', shortcut: '⌘3', hint: 'Metrics, events, incidents and security' },
}

export const useUi = create<UiState>((set, get) => ({
  panels: load(),
  chromeless: false,

  toggle: (panel) => {
    const panels = { ...get().panels, [panel]: !get().panels[panel] }
    set({ panels })
    persist(panels)
  },

  setPanel: (panel, open) => {
    const panels = { ...get().panels, [panel]: open }
    set({ panels })
    persist(panels)
  },

  showAll: () => {
    const panels = { palette: true, inspector: true, telemetry: true }
    set({ panels })
    persist(panels)
  },

  setChromeless: (on) => set({ chromeless: on }),
}))
