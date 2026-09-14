import { describe, expect, it } from 'vitest'
import { run } from '@/sim/engine'
import type { ActiveIncident, SimGraph, SimNode } from '@/sim/types'
import type { PropValue } from '@/catalog/schema/types'
import { defaultProps } from '@/catalog/registry'
import { requireResource } from '@/catalog/registry'

function node(id: string, defId: string, overrides: Record<string, PropValue> = {}): SimNode {
  return { id, defId, props: { ...defaultProps(requireResource(defId)), ...overrides } }
}
function edge(id: string, source: string, sourcePort: string, target: string, targetPort: string, flow: string) {
  return { id, source, sourcePort, target, targetPort, flow } as SimGraph['edges'][number]
}

/** users → internet → alb → ec2 → rds */
function threeTier(overrides: Record<string, Record<string, PropValue>> = {}): SimGraph {
  return {
    nodes: [
      node('users', 'core.client', { rps: 1000, ...overrides.users }),
      node('net', 'core.internet'),
      node('alb', 'aws.alb'),
      node('app', 'aws.ec2', { size: 'm5.large', replicas: 3, ...overrides.app }),
      node('db', 'aws.rds', { ...overrides.db }),
    ],
    edges: [
      edge('e1', 'users', 'out', 'net', 'in', 'http'),
      edge('e2', 'net', 'out', 'alb', 'in', 'http'),
      edge('e3', 'alb', 'out', 'app', 'in', 'http'),
      edge('e4', 'app', 'out', 'db', 'in', 'sql'),
    ],
  }
}

describe('traffic propagation', () => {
  it('carries demand end to end', () => {
    const s = run(threeTier(), 1)
    expect(s.nodes.app.demand).toBeCloseTo(1000, 0)
    expect(s.nodes.db.demand).toBeCloseTo(1000, 0)
    expect(s.metrics.totalDemand).toBe(1000)
  })

  it('serves everything when there is capacity', () => {
    const s = run(threeTier(), 1)
    expect(s.metrics.errorRate).toBeLessThan(0.01)
    expect(s.nodes.app.status).toBe('healthy')
  })

  it('sheds load and reports errors when undersized', () => {
    const s = run(threeTier({ users: { rps: 20000 } }), 1)
    expect(s.nodes.app.utilisation).toBeGreaterThan(1)
    expect(s.metrics.errorRate).toBeGreaterThan(0.5)
    expect(['degraded', 'down']).toContain(s.nodes.app.status)
  })

  it('latency climbs with utilisation before anything fails', () => {
    const light = run(threeTier({ users: { rps: 200 } }), 1)
    const heavy = run(threeTier({ users: { rps: 1300 } }), 1)
    expect(heavy.metrics.p50LatencyMs).toBeGreaterThan(light.metrics.p50LatencyMs)
    expect(heavy.metrics.errorRate).toBeLessThan(0.05)
  })

  it('scaling out adds capacity linearly', () => {
    const small = run(threeTier({ users: { rps: 5000 }, app: { replicas: 3 }, db: { readReplicas: 5 } }), 1)
    const big = run(threeTier({ users: { rps: 5000 }, app: { replicas: 12 }, db: { readReplicas: 5 } }), 1)
    expect(big.nodes.app.served).toBeGreaterThan(small.nodes.app.served)
    expect(big.metrics.errorRate).toBeLessThan(small.metrics.errorRate)
  })

  it('scaling a tier that is not the bottleneck changes nothing', () => {
    // The database caps this system. Quadrupling the app tier moves the
    // shedding downstream without serving one extra user.
    const small = run(threeTier({ users: { rps: 5000 }, app: { replicas: 3 } }), 1)
    const big = run(threeTier({ users: { rps: 5000 }, app: { replicas: 12 } }), 1)
    expect(big.metrics.errorRate).toBeCloseTo(small.metrics.errorRate, 2)
    expect(big.metrics.costPerHour).toBeGreaterThan(small.metrics.costPerHour)
  })
})

describe('caching', () => {
  it('a cache absorbs most of the database read load', () => {
    const g = threeTier()
    g.nodes.push(node('cache', 'aws.elasticache'))
    g.edges.push(edge('e5', 'app', 'out', 'cache', 'in', 'cache'))
    const withCache = run(g, 1)
    const without = run(threeTier(), 1)
    expect(withCache.nodes.db.demand).toBeLessThan(without.nodes.db.demand * 0.3)
  })

  it('a CDN keeps most traffic away from the origin', () => {
    const g: SimGraph = {
      nodes: [
        node('users', 'core.client', { rps: 10000 }),
        node('cdn', 'aws.cloudfront'),
        node('alb', 'aws.alb'),
        node('app', 'aws.ec2', { size: 'm5.large', replicas: 3 }),
      ],
      edges: [
        edge('e1', 'users', 'out', 'cdn', 'in', 'http'),
        edge('e2', 'cdn', 'origin', 'alb', 'in', 'http'),
        edge('e3', 'alb', 'out', 'app', 'in', 'http'),
      ],
    }
    const s = run(g, 1)
    expect(s.nodes.app.demand).toBeLessThan(1000)
    expect(s.metrics.errorRate).toBeLessThan(0.02)
  })
})

describe('availability', () => {
  it('a single replica scores worse than several', () => {
    const one = run(threeTier({ app: { replicas: 1 } }), 1)
    const many = run(threeTier({ app: { replicas: 4 } }), 1)
    expect(many.metrics.availability).toBeGreaterThan(one.metrics.availability)
  })

  it('Multi-AZ improves database availability', () => {
    const single = run(threeTier({ db: { multiAz: false } }), 1)
    const ha = run(threeTier({ db: { multiAz: true } }), 1)
    expect(ha.metrics.availability).toBeGreaterThan(single.metrics.availability)
  })
})

describe('incidents', () => {
  it('a total failure takes the path down and cascades upward', () => {
    const incident: ActiveIncident = {
      id: 'i1', nodeId: 'db', modeId: 'storage-full', label: 'Storage full',
      symptom: 'writes rejected', remedy: 'grow storage',
      capacityLoss: 1, latencyPenaltyMs: 0, errorRate: 1, startedAtTick: 1,
    }
    const s = run(threeTier(), 1, undefined, [incident])
    expect(s.nodes.db.status).toBe('down')
    expect(s.metrics.errorRate).toBeGreaterThan(0.9)
  })

  it('a partial failure degrades rather than kills', () => {
    const incident: ActiveIncident = {
      id: 'i2', nodeId: 'app', modeId: 'host-failure', label: 'Host failure',
      symptom: 'one instance gone', remedy: 'asg replaces it',
      capacityLoss: 0.34, latencyPenaltyMs: 5, errorRate: 0, startedAtTick: 1,
    }
    const s = run(threeTier({ users: { rps: 1800 } }), 1, undefined, [incident])
    expect(s.nodes.app.replicasReady).toBeLessThan(s.nodes.app.replicasDesired)
    expect(s.nodes.app.status).not.toBe('down')
  })
})

describe('attacks', () => {
  const withAttacker = (vector: string, defended: boolean): SimGraph => {
    const g = threeTier()
    g.nodes.push(node('bad', 'core.attacker', { vector, intensity: 6 }))
    if (defended) {
      g.nodes.push(node('waf', 'aws.waf', { mode: 'block' }))
      g.edges.push(edge('a1', 'bad', 'out', 'waf', 'in', 'http'))
      g.edges.push(edge('a2', 'waf', 'out', 'alb', 'in', 'http'))
    } else {
      g.edges.push(edge('a1', 'bad', 'out', 'alb', 'in', 'http'))
    }
    return g
  }

  it('an undefended application flood saturates the tier', () => {
    const s = run(withAttacker('app-ddos', false), 1)
    expect(s.nodes.app.utilisation).toBeGreaterThan(1)
  })

  it('a WAF absorbs most of the same flood', () => {
    const open = run(withAttacker('app-ddos', false), 1)
    const guarded = run(withAttacker('app-ddos', true), 1)
    expect(guarded.nodes.app.demand).toBeLessThan(open.nodes.app.demand)
  })

  it('SQL injection reaches an unprotected database', () => {
    const s = run(withAttacker('sql-injection', false), 1)
    expect(s.nodes.db.breachedBy).toContain('sql-injection')
    expect(s.metrics.compromise).toBeGreaterThan(0)
  })

  it('a WAF prevents the breach', () => {
    const s = run(withAttacker('sql-injection', true), 1)
    expect(s.nodes.db.breachedBy).not.toContain('sql-injection')
  })
})

describe('cost', () => {
  it('scaling up costs more', () => {
    const small = run(threeTier({ app: { replicas: 2, size: 't3.small' } }), 1)
    const big = run(threeTier({ app: { replicas: 10, size: 'm5.xlarge' } }), 1)
    expect(big.nodes.app.costPerHour).toBeGreaterThan(small.nodes.app.costPerHour * 10)
    expect(big.metrics.costPerHour).toBeGreaterThan(small.metrics.costPerHour)
  })

  it('charges egress where data leaves for the internet, not between services', () => {
    const state = run(threeTier({ users: { rps: 1000 } }), 1)
    // The load balancer faces clients and is billed for transfer out…
    expect(state.nodes.alb.costPerHour).toBeGreaterThan(0.1)
    // …while the database only ever talks to the application tier.
    const dbOnly = run(threeTier({ users: { rps: 1000 }, db: { multiAz: false } }), 1)
    expect(dbOnly.nodes.db.costPerHour).toBeLessThan(0.25)
  })

  it('Multi-AZ roughly doubles the database cost', () => {
    const single = run(threeTier({ db: { multiAz: false } }), 1)
    const ha = run(threeTier({ db: { multiAz: true } }), 1)
    expect(ha.nodes.db.costPerHour).toBeGreaterThan(single.nodes.db.costPerHour * 1.8)
  })
})
