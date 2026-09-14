import type { CodeSnippet } from '@/catalog/schema/types'

export const CONCEPT_CATEGORIES = [
  'networking', 'compute', 'data', 'reliability', 'security', 'operations', 'kubernetes',
] as const
export type ConceptCategory = (typeof CONCEPT_CATEGORIES)[number]

/** Interactive explainers rendered inside a codex entry. */
export type WidgetId =
  | 'osi' | 'cidr' | 'tls-handshake' | 'dns-walk' | 'availability-math'
  | 'latency-ladder' | 'probe-simulator' | 'cap-triangle' | 'tcp-handshake'
  | 'cache-hit' | 'blast-radius' | 'error-budget'

export interface Concept {
  id: string
  title: string
  category: ConceptCategory
  /** One sentence, shown in lists and on hover. */
  short: string
  /** The explanation. Paragraphs separated by blank lines. */
  body: string
  /** The things worth remembering, as short statements. */
  keyPoints?: string[]
  snippets?: CodeSnippet[]
  related?: string[]
  widget?: WidgetId
}

export const CATEGORY_LABEL: Record<ConceptCategory, { label: string; blurb: string }> = {
  networking: { label: 'Networking', blurb: 'Packets, addresses, names and boundaries' },
  compute: { label: 'Compute', blurb: 'Where your code runs and how it scales' },
  data: { label: 'Data', blurb: 'Storing it, querying it, and not losing it' },
  reliability: { label: 'Reliability', blurb: 'Surviving failure on purpose' },
  security: { label: 'Security', blurb: 'Identity, isolation and the attacks they stop' },
  operations: { label: 'Operations', blurb: 'Shipping, observing and responding' },
  kubernetes: { label: 'Kubernetes', blurb: 'The control loop and everything around it' },
}
