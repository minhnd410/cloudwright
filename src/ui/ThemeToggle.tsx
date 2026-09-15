import clsx from 'clsx'
import { THEME_META, useTheme, type ThemePref } from '@/store/themeStore'

const ICONS: Record<ThemePref, React.ReactNode> = {
  light: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </>
  ),
  dark: <path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5a8.5 8.5 0 1 0 10.8 10.8Z" />,
  system: (
    <>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8.5 20.5h7" />
    </>
  ),
}

/**
 * One button rather than three: the toolbar has no room for a segmented
 * control, and the cycle is short enough that the next state is guessable from
 * the icon. The title carries the full story for anyone who is not sure.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const pref = useTheme((s) => s.pref)
  const resolved = useTheme((s) => s.resolved)
  const cycle = useTheme((s) => s.cycle)

  const next: ThemePref = ({ light: 'dark', dark: 'system', system: 'light' } as const)[pref]

  return (
    <button
      onClick={cycle}
      title={`Theme: ${THEME_META[pref].label}${pref === 'system' ? ` (${resolved})` : ''} — click for ${THEME_META[next].label.toLowerCase()}`}
      aria-label={`Theme: ${THEME_META[pref].label}. Switch to ${THEME_META[next].label.toLowerCase()}.`}
      className={clsx(
        'focusable grid size-7 place-items-center rounded-md text-ink-faint transition hover:bg-raised hover:text-ink',
        className,
      )}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[pref]}
      </svg>
    </button>
  )
}
