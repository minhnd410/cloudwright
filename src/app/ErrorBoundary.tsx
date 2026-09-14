import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * A failure in one panel should not blank the whole application. Catches
 * render errors, shows what happened, and offers the two recoveries that
 * actually help: reload, or clear the saved diagram that may be the cause.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Cloudwright crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="grid min-h-full place-items-center bg-void p-8">
        <div className="max-w-md rounded-xl border border-alarm/35 bg-deep p-5">
          <h1 className="text-[15px] font-semibold text-ink">Something broke.</h1>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">
            That is a bug in Cloudwright, not in your architecture. Reloading usually helps. If it does not,
            clearing the saved diagram will — you will lose the current canvas but nothing else.
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-lg border border-line bg-abyss p-2.5 font-mono text-[10.5px] text-ink-faint">
            {error.message}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => window.location.reload()}
              className="focusable flex-1 rounded-lg bg-signal/15 px-3 py-2 text-[12.5px] font-medium text-signal transition hover:bg-signal/25"
            >
              Reload
            </button>
            <button
              onClick={() => {
                try { localStorage.removeItem('cloudwright:diagram:v1') } catch { /* ignore */ }
                window.location.href = '/'
              }}
              className="focusable flex-1 rounded-lg border border-line px-3 py-2 text-[12.5px] font-medium text-ink-dim transition hover:border-line-bright hover:text-ink"
            >
              Clear saved diagram
            </button>
          </div>
        </div>
      </div>
    )
  }
}
