import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ALL_CONCEPTS, CONCEPTS, conceptsByCategory, searchConcepts } from '@/codex/concepts'
import { CATEGORY_LABEL, CONCEPT_CATEGORIES, type ConceptCategory } from '@/codex/types'
import { ConceptWidget } from '@/codex/widgets'
import { ALL_RESOURCES, PROVIDER_META } from '@/catalog/registry'
import { ResourceIcon } from '@/ui/ResourceIcon'
import { CodeBlock } from '@/ui/primitives'
import { PageShell } from './PageShell'

export function CodexIndexPage() {
  const [query, setQuery] = useState('')
  const grouped = useMemo(() => conceptsByCategory(), [])
  const results = useMemo(() => (query.trim() ? searchConcepts(query) : null), [query])

  return (
    <PageShell
      eyebrow="Codex"
      title="Everything the game is actually teaching"
      lede={`${ALL_CONCEPTS.length} entries on networking, compute, data, reliability, security, operations and Kubernetes — written to be read once and remembered, not skimmed.`}
    >
      <div className="relative mx-auto mb-10 max-w-lg">
        <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search — try “probe”, “partition key”, “blast radius”…"
          className="focusable w-full rounded-xl border border-line bg-surface py-2.5 pl-10 pr-3 text-[13px] text-ink placeholder:text-ink-faint transition hover:border-line-bright"
        />
      </div>

      {results ? (
        <div>
          <p className="mb-3 text-[12px] text-ink-faint">{results.length} {results.length === 1 ? 'entry' : 'entries'}</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {results.map((c) => <ConceptCard key={c.id} id={c.id} title={c.title} short={c.short} category={c.category} />)}
          </ul>
        </div>
      ) : (
        <div className="space-y-10">
          {CONCEPT_CATEGORIES.filter((cat) => grouped[cat]?.length).map((cat) => (
            <section key={cat}>
              <div className="mb-3 flex items-baseline gap-3">
                <h2 className="text-[15px] font-semibold text-ink">{CATEGORY_LABEL[cat].label}</h2>
                <p className="text-[12px] text-ink-faint">{CATEGORY_LABEL[cat].blurb}</p>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {grouped[cat].map((c) => <ConceptCard key={c.id} id={c.id} title={c.title} short={c.short} category={c.category} />)}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  )
}

function ConceptCard({ id, title, short }: { id: string; title: string; short: string; category: ConceptCategory }) {
  return (
    <li>
      <Link
        to={`/codex/${id}`}
        className="focusable group block h-full rounded-xl border border-line bg-surface/60 p-3 transition hover:border-signal/40 hover:bg-surface"
      >
        <h3 className="text-[13px] font-medium leading-snug text-ink transition-colors group-hover:text-signal">{title}</h3>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">{short}</p>
      </Link>
    </li>
  )
}

export function ConceptPage() {
  const { id } = useParams<{ id: string }>()
  const concept = id ? CONCEPTS[id] : undefined

  const taughtBy = useMemo(
    () => (id ? ALL_RESOURCES.filter((r) => r.concepts?.includes(id)) : []),
    [id],
  )

  if (!concept) {
    return (
      <PageShell eyebrow="Codex" title="Not found" lede="That entry does not exist.">
        <Link to="/codex" className="focusable text-[13px] text-signal hover:underline">Back to the codex</Link>
      </PageShell>
    )
  }

  const paragraphs = concept.body.split('\n\n')
  const related = (concept.related ?? []).map((r) => CONCEPTS[r]).filter(Boolean)

  return (
    <PageShell
      eyebrow={CATEGORY_LABEL[concept.category].label}
      title={concept.title}
      lede={concept.short}
      back={{ to: '/codex', label: 'Codex' }}
      narrow
    >
      <article>
        {concept.widget && <ConceptWidget id={concept.widget} />}

        <div className="space-y-4">
          {paragraphs.map((p, i) => (
            <p key={i} className="text-[14px] leading-[1.75] text-ink-dim">{p}</p>
          ))}
        </div>

        {concept.snippets?.map((s) => (
          <div key={s.label} className="mt-6">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{s.label}</h3>
            <CodeBlock code={s.code} lang={s.lang} />
          </div>
        ))}

        {concept.keyPoints && concept.keyPoints.length > 0 && (
          <div className="mt-8 rounded-xl border border-signal/25 bg-signal/4 p-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-signal">Worth remembering</h3>
            <ul className="mt-3 space-y-2">
              {concept.keyPoints.map((k, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-dim">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-signal" />
                  {k}
                </li>
              ))}
            </ul>
          </div>
        )}

        {taughtBy.length > 0 && (
          <section className="mt-8">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
              Play with this on the canvas
            </h3>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {taughtBy.slice(0, 12).map((def) => {
                const provider = PROVIDER_META[def.provider]
                return (
                  <li key={def.id}>
                    <Link
                      to="/build"
                      className="focusable flex items-center gap-1.5 rounded-lg border border-line bg-surface/60 px-2 py-1 text-[11.5px] text-ink-dim transition hover:border-line-bright hover:text-ink"
                    >
                      <span style={{ color: provider.color }}>
                        <ResourceIcon icon={def.icon} archetype={def.archetype} size={13} />
                      </span>
                      {def.short}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {related.length > 0 && (
          <section className="mt-8 border-t border-line pt-6">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Read next</h3>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {related.map((r) => <ConceptCard key={r.id} id={r.id} title={r.title} short={r.short} category={r.category} />)}
            </ul>
          </section>
        )}
      </article>
    </PageShell>
  )
}

