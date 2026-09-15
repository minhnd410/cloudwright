import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Logo } from '@/ui/Logo'
import { ThemeToggle } from '@/ui/ThemeToggle'

export function PageShell({
  eyebrow, title, lede, children, back, narrow,
}: {
  eyebrow?: string
  title: string
  lede?: string
  children: React.ReactNode
  back?: { to: string; label: string }
  narrow?: boolean
}) {
  return (
    <div className="min-h-full bg-void">
      <header className="sticky top-0 z-30 border-b border-line bg-abyss/85 backdrop-blur-xl">
        <div className="mx-auto flex h-12 max-w-5xl items-center gap-3 px-5">
          <Link to="/" className="focusable flex items-center gap-2 rounded">
            <Logo size={20} />
            <span className="text-[13px] font-semibold tracking-tight text-ink">Cloudwright</span>
          </Link>
          <nav className="ml-auto flex items-center gap-0.5">
            <NavLink to="/build">Build</NavLink>
            <NavLink to="/missions">Missions</NavLink>
            <NavLink to="/codex">Codex</NavLink>
            <ThemeToggle className="ml-1" />
          </nav>
        </div>
      </header>

      <div className={clsx('mx-auto px-5 pb-24 pt-10', narrow ? 'max-w-2xl' : 'max-w-5xl')}>
        {back && (
          <Link
            to={back.to}
            className="focusable mb-5 inline-flex items-center gap-1.5 rounded text-[12px] text-ink-faint transition hover:text-signal"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            {back.label}
          </Link>
        )}
        {eyebrow && (
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-signal">{eyebrow}</div>
        )}
        <h1 className="mt-2 text-balance text-[26px] font-semibold leading-tight tracking-tight text-ink sm:text-[32px]">
          {title}
        </h1>
        {lede && <p className="mt-3 max-w-2xl text-balance text-[14px] leading-relaxed text-ink-dim">{lede}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </div>
  )
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="focusable rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-ink-faint transition hover:bg-raised hover:text-ink"
    >
      {children}
    </Link>
  )
}
