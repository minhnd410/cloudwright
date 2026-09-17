import type { Concept, ConceptCategory } from './types'
import { networking } from './topics/networking'
import { compute } from './topics/compute'
import { data } from './topics/data'
import { reliability } from './topics/reliability'
import { security } from './topics/security'
import { operations } from './topics/operations'
import { platform } from './topics/platform'
import { kubernetes } from './topics/kubernetes'

export const ALL_CONCEPTS: Concept[] = [
  ...networking, ...compute, ...data, ...reliability, ...security, ...operations, ...platform, ...kubernetes,
]

export const CONCEPTS: Record<string, Concept> = Object.fromEntries(
  ALL_CONCEPTS.map((c) => [c.id, c]),
)

export function conceptsByCategory(): Record<ConceptCategory, Concept[]> {
  const out = {} as Record<ConceptCategory, Concept[]>
  for (const c of ALL_CONCEPTS) (out[c.category] ??= []).push(c)
  for (const list of Object.values(out)) list.sort((a, b) => a.title.localeCompare(b.title))
  return out
}

export function searchConcepts(query: string): Concept[] {
  const q = query.trim().toLowerCase()
  if (!q) return ALL_CONCEPTS
  return ALL_CONCEPTS.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      c.short.toLowerCase().includes(q) ||
      c.id.includes(q) ||
      c.body.toLowerCase().includes(q),
  )
}

/** Resources in the catalog that teach a given concept. Filled in lazily to avoid a cycle. */
export function relatedConcepts(concept: Concept): Concept[] {
  return (concept.related ?? []).map((id) => CONCEPTS[id]).filter(Boolean)
}
