/** Cloudwright's mark: a cloud rendered as a connected graph. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="cw-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-signal)" />
          <stop offset="100%" stopColor="var(--color-power)" />
        </linearGradient>
      </defs>
      <path
        d="M9.5 24.5a6 6 0 0 1-.6-11.97A8 8 0 0 1 24.2 13.2a5.65 5.65 0 0 1-.7 11.3Z"
        stroke="url(#cw-logo)" strokeWidth="1.8" strokeLinejoin="round"
      />
      <circle cx="11.5" cy="18.2" r="2" fill="var(--color-signal)" />
      <circle cx="20.5" cy="14.4" r="2" fill="var(--color-power)" />
      <circle cx="21" cy="21.5" r="1.6" fill="var(--color-flux)" />
      <path d="m13.4 17.4 5.3-2.3M13.3 19.3l6.2 1.9" stroke="var(--color-ink-dim)" strokeWidth="1.1" strokeLinecap="round" opacity="0.8" />
    </svg>
  )
}
