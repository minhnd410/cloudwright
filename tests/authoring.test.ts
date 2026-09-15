import { describe, expect, it } from 'vitest'
import { buildDiagram, explainConnection, suggestPorts } from '@/catalog/authoring'
import { autoLayout } from '@/canvas/layout'
import { run } from '@/sim/engine'
import { review } from '@/sim/advisor'
import { toSimGraph } from '@/store/serialize'
import { TEMPLATES } from '@/scenarios/templates'
import { demoFor, starterFor } from '@/codex/demos'
import { ALL_CONCEPTS } from '@/codex/concepts'
import { ALL_RESOURCES } from '@/catalog/registry'

describe('authoring without port ids', () => {
  it('resolves ports from the catalog', () => {
    const result = buildDiagram({
      name: 'Minimal',
      nodes: [
        { id: 'users', type: 'core.client', props: { rps: 500 } },
        { id: 'alb', type: 'aws.alb' },
        { id: 'app', type: 'aws.ec2' },
        { id: 'db', type: 'aws.rds' },
      ],
      edges: [
        { from: 'users', to: 'alb' },
        { from: 'alb', to: 'app' },
        { from: 'app', to: 'db' },
      ],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.diagram.edges).toHaveLength(3)
    expect(result.diagram.edges.find((e) => e.target === 'db')?.flow).toBe('sql')
    // And it simulates.
    expect(run(toSimGraph(result.diagram), 3).metrics.totalDemand).toBe(500)
  })

  it('refuses an impossible connection with the teaching explanation', () => {
    const result = buildDiagram({
      name: 'Broken',
      nodes: [
        { id: 'net', type: 'core.internet' },
        { id: 'db', type: 'aws.rds' },
      ],
      edges: [{ from: 'net', to: 'db' }],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toMatch(/cannot reach a database directly/i)
  })

  it('reports unknown resources and bad containers rather than guessing', () => {
    const unknown = buildDiagram({ name: 'x', nodes: [{ id: 'a', type: 'aws.nope' }] })
    expect(unknown.ok).toBe(false)
    if (!unknown.ok) expect(unknown.errors[0]).toMatch(/Unknown resource type/)

    const badParent = buildDiagram({
      name: 'x',
      nodes: [
        { id: 'db', type: 'aws.rds' },
        { id: 'inside', type: 'aws.ec2', in: 'db' },
      ],
    })
    expect(badParent.ok).toBe(false)
    if (!badParent.ok) expect(badParent.errors[0]).toMatch(/cannot contain/)
  })

  it('warns about properties that do not exist', () => {
    const result = buildDiagram({
      name: 'x',
      nodes: [{ id: 'db', type: 'aws.rds', props: { notAThing: 1 } }],
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.warnings.join(' ')).toMatch(/notAThing/)
  })

  it('suggests every legal port pair, traffic first', () => {
    const options = suggestPorts('aws.ec2', 'aws.rds')
    expect(options.length).toBeGreaterThan(0)
    expect(options[0].flow).toBe('sql')
    expect(suggestPorts('core.internet', 'aws.rds')).toEqual([])
  })

  it('explains a specific port pair either way', () => {
    expect(explainConnection('aws.ec2', 'out', 'aws.rds', 'in')).toMatch(/^Valid/)
    expect(explainConnection('aws.ec2', 'nope', 'aws.rds', 'in')).toMatch(/has no port/)
  })
})

describe('auto layout', () => {
  it('orders nodes left to right by dependency depth', () => {
    const built = buildDiagram({
      name: 'Layered',
      nodes: [
        { id: 'users', type: 'core.client' },
        { id: 'alb', type: 'aws.alb' },
        { id: 'app', type: 'aws.ec2' },
        { id: 'db', type: 'aws.rds' },
      ],
      edges: [{ from: 'users', to: 'alb' }, { from: 'alb', to: 'app' }, { from: 'app', to: 'db' }],
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    const x = (id: string) => built.diagram.nodes.find((n) => n.id === id)!.x
    expect(x('users')).toBeLessThan(x('alb'))
    expect(x('alb')).toBeLessThan(x('app'))
    expect(x('app')).toBeLessThan(x('db'))
  })

  it('sizes containers to fit what is inside them', () => {
    const laid = autoLayout(TEMPLATES.find((t) => t.id === 'kubernetes')!.build())
    const pool = laid.nodes.find((n) => n.defId === 'k8s.nodepool')!
    const inside = laid.nodes.filter((n) => n.parentId === pool.id)
    expect(inside.length).toBeGreaterThan(0)
    for (const child of inside) {
      expect(child.x).toBeGreaterThanOrEqual(0)
      expect(child.x).toBeLessThan(pool.w ?? 0)
    }
  })

  it('leaves a laid-out template still simulating identically', () => {
    const original = TEMPLATES[0].build()
    const before = run(toSimGraph(original), 4).metrics
    const after = run(toSimGraph(autoLayout(original)), 4).metrics
    expect(after.totalServed).toBe(before.totalServed)
  })
})

describe('codex demos', () => {
  it('give every entry something runnable', () => {
    for (const concept of ALL_CONCEPTS) {
      const demo = demoFor(concept.id)
      expect(demo, `${concept.id} has no demo`).toBeTruthy()
      expect(demo!.variants.length).toBeGreaterThan(0)
    }
  })

  it('build valid, simulating diagrams for every variant', () => {
    const seen = new Set<string>()
    for (const concept of ALL_CONCEPTS) {
      const demo = demoFor(concept.id)!
      for (const variant of demo.variants) {
        const key = `${concept.id}:${variant.id}`
        if (seen.has(key)) continue
        seen.add(key)
        const built = variant.build()
        expect(built.nodes.length, key).toBeGreaterThan(1)
        const state = run(toSimGraph(built), 3)
        expect(Number.isFinite(state.metrics.totalDemand), key).toBe(true)
        expect(state.metrics.totalDemand, key).toBeGreaterThan(0)
      }
    }
  })

  it('name only failure modes that exist on the node they target', () => {
    for (const concept of ALL_CONCEPTS) {
      for (const variant of demoFor(concept.id)!.variants) {
        const built = variant.build()
        for (const seed of variant.incidents ?? []) {
          const node = built.nodes.find((n) => n.id === seed.nodeId)
          expect(node, `${concept.id}/${variant.id}: no node ${seed.nodeId}`).toBeTruthy()
          const modes = ALL_RESOURCES.find((r) => r.id === node!.defId)?.sim?.failureModes ?? []
          expect(modes.map((m) => m.id), `${concept.id}/${variant.id}`).toContain(seed.modeId)
        }
      }
    }
  })

  it('build a valid starter for every resource in the catalog', () => {
    for (const def of ALL_RESOURCES) {
      const started = starterFor(def.id)
      expect(started.nodes.some((n) => n.defId === def.id), def.id).toBe(true)
      // Every starter must be a diagram the reviewer can read without throwing.
      expect(() => review(toSimGraph(started))).not.toThrow()
      expect(() => run(toSimGraph(started), 2)).not.toThrow()
    }
  })
})

describe('layout with nested containers', () => {
  it('keeps every child fully inside its parent', () => {
    for (const template of TEMPLATES) {
      const laid = autoLayout(template.build())
      const byId = new Map(laid.nodes.map((n) => [n.id, n]))
      for (const node of laid.nodes) {
        if (!node.parentId) continue
        const parent = byId.get(node.parentId)!
        const w = node.w ?? 188
        const h = node.h ?? 96
        expect(node.x, `${template.id}/${node.id} left edge`).toBeGreaterThanOrEqual(0)
        expect(node.y, `${template.id}/${node.id} top edge`).toBeGreaterThanOrEqual(0)
        expect(node.x + w, `${template.id}/${node.id} right edge`).toBeLessThanOrEqual(parent.w ?? 0)
        expect(node.y + h, `${template.id}/${node.id} bottom edge`).toBeLessThanOrEqual(parent.h ?? 0)
      }
    }
  })

  it('never overlaps siblings inside a container', () => {
    const laid = autoLayout(TEMPLATES.find((t) => t.id === 'three-tier')!.build())
    const groups = new Map<string, typeof laid.nodes>()
    for (const node of laid.nodes) {
      if (!node.parentId) continue
      groups.set(node.parentId, [...(groups.get(node.parentId) ?? []), node])
    }
    for (const [parentId, siblings] of groups) {
      for (let i = 0; i < siblings.length; i++) {
        for (let j = i + 1; j < siblings.length; j++) {
          const a = siblings[i]
          const b = siblings[j]
          const overlaps =
            a.x < b.x + (b.w ?? 188) && a.x + (a.w ?? 188) > b.x &&
            a.y < b.y + (b.h ?? 96) && a.y + (a.h ?? 96) > b.y
          expect(overlaps, `${parentId}: ${a.id} overlaps ${b.id}`).toBe(false)
        }
      }
    }
  })
})

describe('resource starters place things where they belong', () => {
  const edgeOf = (d: ReturnType<typeof starterFor>, source: string, target: string) =>
    d.edges.find((e) => e.source === source && e.target === target)

  it('puts edge services in front of the load balancer, not behind the app', () => {
    for (const id of ['aws.cloudfront', 'aws.waf', 'aws.apigw', 'azure.front-door']) {
      const started = starterFor(id)
      expect(edgeOf(started, 'net', 'subject'), `${id} should sit behind the internet`).toBeTruthy()
      expect(edgeOf(started, 'subject', 'alb'), `${id} should feed the load balancer`).toBeTruthy()
      expect(edgeOf(started, 'app', 'subject'), `${id} must not hang off the app tier`).toBeUndefined()
    }
  })

  it('puts data stores behind the application tier', () => {
    for (const id of ['aws.rds', 'aws.elasticache', 'aws.s3', 'aws.sqs', 'azure.cosmos']) {
      expect(edgeOf(starterFor(id), 'app', 'subject'), `${id} should hang off the app tier`).toBeTruthy()
    }
  })

  it('attaches controls to the tier they protect', () => {
    for (const id of ['aws.iam-role', 'aws.secrets-manager', 'aws.kms', 'aws.cloudwatch']) {
      const started = starterFor(id)
      const attached = edgeOf(started, 'subject', 'app') ?? edgeOf(started, 'app', 'subject')
      expect(attached, `${id} should attach to the app tier`).toBeTruthy()
    }
  })

  it('points a threat actor at the entry point', () => {
    const started = starterFor('core.attacker')
    expect(edgeOf(started, 'subject', 'alb')).toBeTruthy()
  })
})
