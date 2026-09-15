import { create } from 'zustand'

const THEME_KEY = 'cloudwright:theme:v1'

export type ThemePref = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export interface ThemeState {
  /** What the visitor chose. */
  pref: ThemePref
  /** What that resolves to right now — `system` follows the OS and can change under us. */
  resolved: ResolvedTheme
  setPref: (pref: ThemePref) => void
  /** Cycles light → dark → system, for the toolbar button and the ⇧T shortcut. */
  cycle: () => void
}

const systemQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null

function systemTheme(): ResolvedTheme {
  return systemQuery?.matches ? 'light' : 'dark'
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  return pref === 'system' ? systemTheme() : pref
}

function loadPref(): ThemePref {
  try {
    // A ?theme= in the URL wins for this page load without being stored, so a
    // shared screenshot link cannot silently repaint the recipient's app.
    const forced = new URLSearchParams(location.search).get('theme')
    if (forced === 'light' || forced === 'dark') return forced
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    /* ignore */
  }
  return 'system'
}

/** The single place the DOM learns about the theme; everything else is CSS. */
function apply(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = resolved
}

const initialPref = loadPref()

export const useTheme = create<ThemeState>((set, get) => ({
  pref: initialPref,
  resolved: resolveTheme(initialPref),

  setPref: (pref) => {
    const resolved = resolveTheme(pref)
    apply(resolved)
    set({ pref, resolved })
    try {
      localStorage.setItem(THEME_KEY, pref)
    } catch {
      /* ignore */
    }
  },

  cycle: () => {
    const order: ThemePref[] = ['light', 'dark', 'system']
    const next = order[(order.indexOf(get().pref) + 1) % order.length]
    get().setPref(next)
  },
}))

systemQuery?.addEventListener('change', () => {
  if (useTheme.getState().pref !== 'system') return
  const resolved = systemTheme()
  apply(resolved)
  useTheme.setState({ resolved })
})

export const THEME_META: Record<ThemePref, { label: string; hint: string }> = {
  light: { label: 'Light', hint: 'Paper — better for projectors and bright rooms' },
  dark: { label: 'Dark', hint: 'The default: traffic and glow read best on black' },
  system: { label: 'System', hint: 'Follow the operating system setting' },
}
