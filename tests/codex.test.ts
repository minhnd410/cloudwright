import { describe, expect, it } from 'vitest'
import { ALL_CONCEPTS, CONCEPTS } from '@/codex/concepts'
import { CODEX_ENTRY_COUNT } from '@/codex/labels'
import { ALL_RESOURCES } from '@/catalog/registry'

describe('codex', () => {
  it('reports an accurate entry count on the landing page', () => {
    expect(CODEX_ENTRY_COUNT).toBe(ALL_CONCEPTS.length)
  })

  it('has unique ids', () => {
    const ids = ALL_CONCEPTS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('covers every concept referenced by a resource', () => {
    const missing = new Set<string>()
    for (const def of ALL_RESOURCES) {
      for (const id of def.concepts ?? []) if (!CONCEPTS[id]) missing.add(`${def.id} → ${id}`)
    }
    expect([...missing]).toEqual([])
  })

  it('has no dangling related links', () => {
    const dangling: string[] = []
    for (const c of ALL_CONCEPTS) {
      for (const id of c.related ?? []) if (!CONCEPTS[id]) dangling.push(`${c.id} → ${id}`)
    }
    expect(dangling).toEqual([])
  })

  it('every entry has substantial content', () => {
    for (const c of ALL_CONCEPTS) {
      expect(c.body.length, `${c.id} body too short`).toBeGreaterThan(400)
      expect(c.short.length, `${c.id} missing summary`).toBeGreaterThan(20)
    }
  })
})
