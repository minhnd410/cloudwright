import { create } from 'zustand'
import type { SavedDiagram } from './types'
import { serialize } from './serialize'
import { useGame } from './gameStore'

const WORKSPACE_KEY = 'cloudwright:workspace:v1'
const LEGACY_KEY = 'cloudwright:diagram:v1'
const MAX_TABS = 12

export interface Tab {
  id: string
  name: string
  /**
   * The tab's document. The active tab's copy is refreshed from the editor on
   * every autosave and immediately before switching away, so it is never stale
   * when it matters.
   */
  saved: SavedDiagram
}

interface Workspace {
  version: 1
  tabs: Tab[]
  activeId: string
}

export interface TabState {
  tabs: Tab[]
  activeId: string

  open: (diagram?: SavedDiagram, options?: { activate?: boolean }) => string
  close: (id: string) => void
  activate: (id: string) => void
  rename: (id: string, name: string) => void
  duplicate: (id: string) => void
  /** Copies the live editor state into the active tab. */
  syncActive: () => void
  persist: () => void
  restore: () => boolean
}

let tabSeq = 1
const nextTabId = () => `t${Date.now().toString(36)}${tabSeq++}`

function blankDiagram(name = 'Untitled architecture'): SavedDiagram {
  return { version: 1, name, nodes: [], edges: [] }
}

export const useTabs = create<TabState>((set, get) => ({
  tabs: [],
  activeId: '',

  open: (diagram, options) => {
    const doc = diagram ?? blankDiagram()
    const id = nextTabId()
    const tab: Tab = { id, name: doc.name || 'Untitled architecture', saved: doc }

    get().syncActive()
    set((s) => {
      const tabs = [...s.tabs, tab]
      return { tabs: tabs.length > MAX_TABS ? tabs.slice(tabs.length - MAX_TABS) : tabs }
    })

    if (options?.activate !== false) {
      set({ activeId: id })
      useGame.getState().load(doc)
    }
    get().persist()
    return id
  },

  close: (id) => {
    const { tabs, activeId } = get()
    if (tabs.length <= 1) {
      // Never leave the workspace with no document; reset this one instead.
      const fresh = blankDiagram()
      set({ tabs: [{ id, name: fresh.name, saved: fresh }] })
      useGame.getState().load(fresh)
      get().persist()
      return
    }
    const index = tabs.findIndex((t) => t.id === id)
    const remaining = tabs.filter((t) => t.id !== id)
    set({ tabs: remaining })

    if (activeId === id) {
      const next = remaining[Math.min(index, remaining.length - 1)]
      set({ activeId: next.id })
      useGame.getState().load(next.saved)
    }
    get().persist()
  },

  activate: (id) => {
    const { activeId, tabs } = get()
    if (id === activeId) return
    const target = tabs.find((t) => t.id === id)
    if (!target) return
    get().syncActive()
    set({ activeId: id })
    useGame.getState().load(target.saved)
    get().persist()
  },

  rename: (id, name) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, name, saved: { ...t.saved, name } } : t)),
    }))
    if (get().activeId === id) useGame.getState().setName(name)
    get().persist()
  },

  duplicate: (id) => {
    const source = get().tabs.find((t) => t.id === id)
    if (!source) return
    const copy: SavedDiagram = {
      ...(get().activeId === id ? currentDocument() : source.saved),
      name: `${source.name} copy`,
    }
    get().open(copy)
  },

  syncActive: () => {
    const { activeId } = get()
    if (!activeId) return
    const doc = currentDocument()
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === activeId ? { ...t, name: doc.name, saved: doc } : t)),
    }))
  },

  persist: () => {
    const { tabs, activeId } = get()
    // Never write an empty workspace: an autosave that lands before the
    // restore would otherwise erase everything the player had open.
    if (tabs.length === 0 || !activeId) return
    try {
      const workspace: Workspace = { version: 1, tabs, activeId }
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace))
    } catch {
      /* storage unavailable — the app still works, it just will not persist */
    }
  },

  restore: () => {
    try {
      const raw = localStorage.getItem(WORKSPACE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Workspace
        if (parsed.version === 1 && parsed.tabs?.length) {
          const active = parsed.tabs.find((t) => t.id === parsed.activeId) ?? parsed.tabs[0]
          set({ tabs: parsed.tabs, activeId: active.id })
          useGame.getState().load(active.saved)
          return true
        }
      }
      // Fall back to the single-document format from before tabs existed.
      const legacy = localStorage.getItem(LEGACY_KEY)
      if (legacy) {
        const diagram = JSON.parse(legacy) as SavedDiagram
        if (diagram.version === 1) {
          get().open(diagram)
          localStorage.removeItem(LEGACY_KEY)
          return true
        }
      }
    } catch {
      /* ignore a corrupt workspace and start clean */
    }
    return false
  },
}))

function currentDocument(): SavedDiagram {
  const { name, nodes, edges } = useGame.getState()
  return serialize(name, nodes, edges)
}

/** Ensures there is always exactly one document open. */
export function ensureWorkspace() {
  const { tabs, restore, open } = useTabs.getState()
  if (tabs.length > 0) return
  if (!restore()) open()
}
