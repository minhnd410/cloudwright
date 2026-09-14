import { describe, expect, it } from 'vitest'
import { ALL_RESOURCES, defaultProps, equivalentsOf, searchResources, validateCatalog } from '@/catalog/registry'
import { validateConnection } from '@/catalog/schema/rules'
import { requireResource, getPort } from '@/catalog/registry'

describe('catalog', () => {
  it('has no structural issues', () => {
    const issues = validateCatalog()
    expect(issues, issues.map((i) => `${i.resourceId}: ${i.message}`).join('\n')).toEqual([])
  })

  it('covers every provider', () => {
    for (const p of ['aws', 'azure', 'gcp', 'kubernetes', 'core']) {
      expect(ALL_RESOURCES.some((r) => r.provider === p), `missing provider ${p}`).toBe(true)
    }
  })

  it('finds cross-provider equivalents by archetype', () => {
    const rds = requireResource('aws.rds')
    const ids = equivalentsOf(rds).map((r) => r.id)
    expect(ids).toContain('azure.sql')
    expect(ids).toContain('gcp.cloud-sql')
  })

  it('every resource produces usable default props', () => {
    for (const def of ALL_RESOURCES) {
      const bag = defaultProps(def)
      for (const p of def.props ?? []) expect(bag[p.key]).toBeDefined()
    }
  })

  it('search ranks exact short names first', () => {
    expect(searchResources('S3')[0].def.id).toBe('aws.s3')
    expect(searchResources('redis')[0].def.archetype).toBe('cache')
  })
})

describe('connection rules', () => {
  const attempt = (srcId: string, srcPort: string, tgtId: string, tgtPort: string) => {
    const source = requireResource(srcId)
    const target = requireResource(tgtId)
    return validateConnection({
      source, target,
      sourcePort: getPort(source, srcPort)!,
      targetPort: getPort(target, tgtPort)!,
    })
  }

  it('allows internet → load balancer over HTTP', () => {
    const v = attempt('core.internet', 'out', 'aws.alb', 'in')
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.primary).toBe('http')
  })

  it('allows compute → database over SQL', () => {
    expect(attempt('aws.ec2', 'out', 'aws.rds', 'in').ok).toBe(true)
  })

  it('rejects internet → database with a teaching explanation', () => {
    const v = attempt('core.internet', 'out', 'aws.rds', 'in')
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.teach.length).toBeGreaterThan(40)
      expect(v.hint).toBeTruthy()
    }
  })

  it('rejects a load balancer fronting a database', () => {
    const v = attempt('aws.alb', 'out', 'aws.rds', 'in')
    expect(v.ok).toBe(false)
  })

  it('rejects connecting an output to an output', () => {
    const v = attempt('aws.ec2', 'out', 'aws.rds', 'replica')
    expect(v.ok).toBe(false)
  })

  it('works across providers', () => {
    expect(attempt('gcp.cloud-run', 'out', 'aws.s3', 'in').ok).toBe(true)
  })
})
