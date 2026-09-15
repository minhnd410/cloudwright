import type { SavedDiagram } from './types'
import { getResource } from '@/catalog/registry'

/** Everything about moving a diagram between the app and a `.json` file. */

export interface ImportResult {
  ok: true
  diagram: SavedDiagram
  /** Resources in the file that this build does not know about. */
  unknown: string[]
}

export type ImportOutcome = ImportResult | { ok: false; error: string }

export function diagramToJson(diagram: SavedDiagram): string {
  return JSON.stringify(diagram, null, 2)
}

export function parseDiagram(text: string): ImportOutcome {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' }
  }

  const diagram = parsed as Partial<SavedDiagram>
  if (diagram?.version !== 1) {
    return { ok: false, error: 'Unrecognised format — expected a Cloudwright diagram with "version": 1.' }
  }
  if (!Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges)) {
    return { ok: false, error: 'The file is missing its nodes or edges.' }
  }

  const unknown = [...new Set(diagram.nodes.filter((n) => !getResource(n.defId)).map((n) => n.defId))]

  return {
    ok: true,
    unknown,
    diagram: {
      version: 1,
      name: typeof diagram.name === 'string' && diagram.name.trim() ? diagram.name : 'Imported architecture',
      nodes: diagram.nodes,
      edges: diagram.edges,
    },
  }
}

export function downloadJson(diagram: SavedDiagram) {
  const blob = new Blob([diagramToJson(diagram)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${slug(diagram.name)}.cloudwright.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoke on the next frame so the download has definitely started.
  requestAnimationFrame(() => URL.revokeObjectURL(url))
}

export function downloadRecording(recording: { name: string }) {
  const blob = new Blob([JSON.stringify(recording)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${slug(recording.name)}.cwrec.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  requestAnimationFrame(() => URL.revokeObjectURL(url))
}

export function pickJsonFile(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      void file.text().then((text) => resolve({ name: file.name, text }))
    }
    // A cancelled picker fires no event in some browsers; resolve on focus return.
    window.addEventListener('focus', () => setTimeout(() => resolve(null), 400), { once: true })
    input.click()
  })
}

function slug(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'architecture'
}
