import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import { Workspace } from './Workspace'
import { HomePage } from '@/pages/HomePage'
import { useGame } from '@/store/gameStore'
import { wireMissionEvaluation } from '@/store/missionStore'
import { decodeShareLink } from '@/store/serialize'

// The codex is a large amount of prose and the missions carry their own
// starting diagrams. Neither is needed to open the canvas.
const MissionsPage = lazy(() => import('@/pages/MissionsPage').then((m) => ({ default: m.MissionsPage })))
const CodexIndexPage = lazy(() => import('@/pages/CodexPage').then((m) => ({ default: m.CodexIndexPage })))
const ConceptPage = lazy(() => import('@/pages/CodexPage').then((m) => ({ default: m.ConceptPage })))

function RouteFallback() {
  return (
    <div className="grid min-h-full place-items-center bg-void text-[12px] text-ink-faint">
      Loading…
    </div>
  )
}

export function App() {
  useEffect(() => wireMissionEvaluation(), [])

  return (
    <BrowserRouter>
      <ShareLinkLoader />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/build" element={<Workspace />} />
          <Route path="/missions" element={<MissionsPage />} />
          <Route path="/codex" element={<CodexIndexPage />} />
          <Route path="/codex/:id" element={<ConceptPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

/**
 * Loads a diagram from `?d=` once on start, otherwise restores the last
 * autosave. Shared links are read-only until the player edits them.
 */
function ShareLinkLoader() {
  const [params, setParams] = useSearchParams()

  useEffect(() => {
    const encoded = params.get('d')
    if (encoded) {
      const diagram = decodeShareLink(encoded)
      if (diagram) {
        useGame.getState().load(diagram)
        const next = new URLSearchParams(params)
        next.delete('d')
        setParams(next, { replace: true })
        return
      }
    }
    if (useGame.getState().nodes.length === 0) useGame.getState().restore()
    // Run once on mount; later param changes are navigation, not a fresh load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
