import { describe, expect, it } from 'vitest'
import { MISSION_BY_ID } from '@/scenarios/missions'
import { buildContext } from '@/scenarios/context'
import { review } from '@/sim/advisor'
import { run } from '@/sim/engine'
import { defaultProps, requireResource } from '@/catalog/registry'
import { makeIncident } from '@/sim/incidents'
import { getPort } from '@/catalog/registry'
import { pickPrimaryFlow } from '@/catalog/schema/rules'
import type { PropBag, PropValue } from '@/catalog/schema/types'
import type { SimGraph } from '@/sim/types'

/**
 * Proves each mission can actually be completed. Without this, an objective
 * predicate can quietly become impossible and the only way to find out is a
 * player getting stuck.
 */

interface Patch {
  /** Property overrides, keyed by node id. */
  props?: Record<string, PropBag>
  /** Extra nodes: [id, defId, props?] */
  add?: [string, string, PropBag?][]
  /** Extra edges: [source, sourcePort, target, targetPort] */
  wire?: [string, string, string, string][]
  /** Node ids to remove, with any edges touching them. */
  remove?: string[]
  /** Edges to remove, as [source, target] — for re-routing through a new control. */
  unwire?: [string, string][]
  /**
   * Node ids whose seeded fault the fix actually removes — an OOM kill stops
   * once the memory limit is raised. Faults not listed here stay active, which
   * is how a mission that asks you to ride one out gets proved.
   */
  resolves?: string[]
}

function solve(missionId: string, patch: Patch, ticks = 45) {
  const mission = MISSION_BY_ID[missionId]
  const start = mission.start

  const nodes: SimGraph['nodes'] = (start?.nodes ?? []).map((n) => ({
    id: n.id, defId: n.defId, props: { ...n.props }, parentId: n.parentId,
  }))
  const edges: SimGraph['edges'] = (start?.edges ?? []).map((e) => ({
    id: e.id, source: e.source, target: e.target,
    sourcePort: e.sourceHandle, targetPort: e.targetHandle, flow: e.flow,
  }))

  for (const [id, props] of Object.entries(patch.props ?? {})) {
    const node = nodes.find((n) => n.id === id)
    if (!node) throw new Error(`${missionId}: patch targets unknown node ${id}`)
    Object.assign(node.props, props)
  }

  for (const [id, defId, props] of patch.add ?? []) {
    nodes.push({ id, defId, props: { ...defaultProps(requireResource(defId)), ...props } })
  }

  for (const [source, target] of patch.unwire ?? []) {
    const i = edges.findIndex((e) => e.source === source && e.target === target)
    if (i < 0) throw new Error(`${missionId}: no edge ${source} → ${target} to remove`)
    edges.splice(i, 1)
  }

  let edgeSeq = edges.length
  for (const [source, sourcePort, target, targetPort] of patch.wire ?? []) {
    const sourceDef = requireResource(nodes.find((n) => n.id === source)!.defId)
    const targetDef = requireResource(nodes.find((n) => n.id === target)!.defId)
    const shared = (getPort(sourceDef, sourcePort)?.flows ?? [])
      .filter((f) => (getPort(targetDef, targetPort)?.flows ?? []).includes(f))
    if (shared.length === 0) throw new Error(`${missionId}: ${source}:${sourcePort} → ${target}:${targetPort} shares no flow`)
    edges.push({ id: `x${++edgeSeq}`, source, target, sourcePort, targetPort, flow: pickPrimaryFlow(shared) })
  }

  for (const id of patch.remove ?? []) {
    const i = nodes.findIndex((n) => n.id === id)
    if (i >= 0) nodes.splice(i, 1)
    for (let j = edges.length - 1; j >= 0; j--) {
      if (edges[j].source === id || edges[j].target === id) edges.splice(j, 1)
    }
  }

  const graph: SimGraph = { nodes, edges }

  // Seeded faults are part of the mission, so a solution has to hold up with
  // them active — otherwise the test proves an easier problem than the player gets.
  const incidents = (mission.startIncidents ?? [])
    .filter((seed) => nodes.some((n) => n.id === seed.nodeId))
    .filter((seed) => !(patch.resolves ?? []).includes(seed.nodeId))
    .flatMap((seed) => {
      const node = nodes.find((n) => n.id === seed.nodeId)!
      const mode = (requireResource(node.defId).sim?.failureModes ?? []).find((m) => m.id === seed.modeId)
      return mode ? [makeIncident(seed.nodeId, mode, 0)] : []
    })

  const sim = run(graph, ticks, undefined, incidents)
  const ctx = buildContext(graph, sim, review(graph), incidents)

  const done: string[] = []
  const missing: string[] = []
  for (const objective of mission.objectives) {
    (objective.check(ctx) ? done : missing).push(objective.id)
  }
  return { done, missing, metrics: sim.metrics }
}

function expectSolved(missionId: string, patch: Patch, ticks?: number) {
  const { missing, metrics } = solve(missionId, patch, ticks)
  const detail = `cost $${metrics.costPerMonth.toFixed(0)}/mo · err ${(metrics.errorRate * 100).toFixed(1)}% · p95 ${metrics.p95LatencyMs.toFixed(0)}ms · avail ${(metrics.availability * 100).toFixed(3)}%`
  expect(missing, `${missionId} unsolved: ${missing.join(', ')} (${detail})`).toEqual([])
}

const P = (o: Record<string, PropValue>) => o as PropBag

describe('missions are winnable', () => {
  it('First Contact', () => {
    expectSolved('first-contact', {
      add: [
        ['users', 'core.client', P({ rps: 400 })],
        ['alb', 'aws.alb'],
        ['app', 'aws.ec2', P({ size: 'm5.large', replicas: 3 })],
      ],
      wire: [
        ['users', 'out', 'alb', 'in'],
        ['alb', 'out', 'app', 'in'],
      ],
    })
  })

  it('The Single Point', () => {
    expectSolved('single-point', {
      props: {
        app: P({ replicas: 3, zones: 'multi' }),
        db: P({ multiAz: true, backupRetention: 14, size: 'db.m5.xlarge' }),
        priv: P({ tier: 'private' }),
      },
      add: [
        ['priv-b', 'aws.subnet', P({ tier: 'private', az: 'b', cidr: '10.0.80.0/20' })],
        ['mon', 'aws.cloudwatch', P({ alarmStrategy: 'symptom' })],
      ],
      wire: [['app', 'telemetry', 'mon', 'in']],
    })
  })

  it('Black Friday', () => {
    expectSolved('black-friday', {
      props: {
        app: P({ replicas: 4, size: 'm5.large', autoscale: true, maxReplicas: 14 }),
        db: P({ size: 'db.m5.large', multiAz: false, backupRetention: 7 }),
        users: P({ rps: 900, pattern: 'spiky', region: 'global' }),
      },
      add: [
        ['cdn', 'aws.cloudfront', P({ cachePolicy: 'optimized' })],
        ['cache', 'aws.elasticache', P({ nodeType: 'cache.m6g.large' })],
      ],
      unwire: [['net', 'alb']],
      wire: [
        ['net', 'out', 'cdn', 'in'],
        ['cdn', 'origin', 'alb', 'in'],
        ['app', 'out', 'cache', 'in'],
      ],
    })
  })

  it('Exposed', () => {
    expectSolved('locked-out', {
      props: {
        app: P({ publicIp: false, imdsv2: true, replicas: 3 }),
        db: P({ publicAccess: false, encryption: 'cmk', backupRetention: 14 }),
      },
      add: [['waf', 'aws.waf', P({ mode: 'block', rateLimit: 2000 })]],
      unwire: [['net', 'alb']],
      wire: [['net', 'out', 'waf', 'in'], ['waf', 'out', 'alb', 'in']],
    })
  })

  it('The Flood', () => {
    expectSolved('the-flood', {
      add: [
        ['cdn', 'aws.cloudfront'],
        ['waf', 'aws.waf', P({ mode: 'block', rateLimit: 2000 })],
      ],
      unwire: [['net', 'alb']],
      wire: [
        ['net', 'out', 'cdn', 'in'],
        ['cdn', 'origin', 'waf', 'in'],
        ['waf', 'out', 'alb', 'in'],
      ],
    })
  })

  it('CrashLoopBackOff', () => {
    expectSolved('crashloop', {
      props: {
        web: P({
          replicas: 3, memLimit: 1024, memRequest: 512, cpuRequest: 250, cpuLimit: 0,
          livenessProbe: 'http', readinessProbe: true, pdb: true, antiAffinity: true, runAsNonRoot: true,
        }),
        pool: P({ spreadZones: true, nodeCount: 3 }),
        cluster: P({ rbac: 'scoped', privateEndpoint: true }),
      },
      add: [['netpol', 'k8s.networkpolicy', P({ defaultDeny: true, egressControl: true })]],
      resolves: ['web'],
    })
  })

  it('Ransom Note', () => {
    expectSolved('ransom-note', {
      props: {
        db: P({ backupRetention: 35, encryption: 'cmk', deletionProtection: true }),
        files: P({ versioning: true, encryption: 'cmk' }),
      },
      add: [
        ['kms', 'aws.kms'],
        ['sg', 'aws.sg', P({ inboundScope: 'sg', ports: ['443'] })],
        ['role', 'aws.iam-role', P({ scope: 'scoped', conditions: true })],
        ['waf', 'aws.waf', P({ mode: 'block' })],
      ],
      unwire: [['net', 'alb']],
      wire: [
        ['net', 'out', 'waf', 'in'],
        ['waf', 'out', 'alb', 'in'],
        ['sg', 'protect-out', 'app', 'in'],
        ['role', 'grant', 'app', 'identity'],
        ['kms', 'out', 'db', 'identity'],
      ],
    })
  })

  it('The Bill', () => {
    expectSolved('the-bill', {
      props: {
        app: P({ replicas: 3, size: 'm5.large', autoscale: true, maxReplicas: 8 }),
        db: P({ size: 'db.m5.large', readReplicas: 0, multiAz: true }),
        files: P({ storageClass: 'intelligent', lifecycle: true, versioning: true }),
      },
      add: [
        ['cache', 'aws.elasticache', P({ nodeType: 'cache.m6g.large' })],
        ['vpce', 'aws.vpc-endpoint', P({ endpointType: 'gateway' })],
      ],
      wire: [
        ['app', 'out', 'cache', 'in'],
        ['app', 'out', 'vpce', 'in'],
      ],
      remove: ['orphan', 'nat'],
    })
  })

  it('Three Nines', () => {
    expectSolved('three-nines', {
      add: [
        ['users', 'core.client', P({ rps: 800 })],
        ['cdn', 'aws.cloudfront'],
        ['alb', 'aws.alb'],
        ['app', 'aws.ec2', P({ size: 'm5.xlarge', replicas: 4, zones: 'multi', autoscale: true, maxReplicas: 12 })],
        ['cache', 'aws.elasticache', P({ multiAz: true })],
        ['db', 'aws.rds', P({ multiAz: true, backupRetention: 14, size: 'db.m5.xlarge' })],
        ['mon', 'aws.cloudwatch', P({ alarmStrategy: 'symptom' })],
      ],
      wire: [
        ['users', 'out', 'cdn', 'in'],
        ['cdn', 'origin', 'alb', 'in'],
        ['alb', 'out', 'app', 'in'],
        ['app', 'out', 'cache', 'in'],
        ['app', 'out', 'db', 'in'],
        ['app', 'telemetry', 'mon', 'in'],
      ],
    })
  })

  it('Blast Radius', () => {
    expectSolved('blast-radius', {
      add: [
        ['waf', 'aws.waf', P({ mode: 'block', rateLimit: 1500 })],
        ['sg', 'aws.sg', P({ inboundScope: 'sg', ports: ['443'] })],
        ['egress', 'aws.nacl', P({ denyList: true, ephemeralAllowed: true })],
        ['fw2', 'gcp.firewall', P({ targeting: 'service-account', egressDeny: true, sourceRange: 'internal' })],
        ['role', 'aws.iam-role', P({ scope: 'scoped', conditions: true })],
        ['sec', 'aws.secrets-manager', P({ rotation: true })],
        ['vpce', 'aws.vpc-endpoint', P({ endpointType: 'interface' })],
        ['mon', 'aws.cloudwatch', P({ alarmStrategy: 'symptom' })],
      ],
      wire: [
        ['net', 'out', 'waf', 'in'],
        ['waf', 'out', 'alb', 'in'],
        ['sg', 'protect-out', 'app', 'in'],
        ['fw2', 'out', 'app', 'in'],
        ['role', 'grant', 'app', 'identity'],
        ['sec', 'out', 'app', 'identity'],
        ['app', 'out', 'vpce', 'in'],
        ['app', 'telemetry', 'mon', 'in'],
      ],
      unwire: [['net', 'alb']],
    })
  })

  it('The Pager', () => {
    expectSolved('the-pager', {
      props: {
        cw: P({ alarmStrategy: 'symptom', logRetention: 30 }),
        alb: P({ accessLogs: true, healthPath: '/healthz' }),
        app: P({ replicas: 5, size: 'm5.large' }),
      },
      wire: [
        ['db', 'telemetry', 'cw', 'in'],
        ['alb', 'telemetry', 'cw', 'in'],
      ],
      // Shipping logs off the box is the remedy for the full root volume, so
      // the player clears that fault rather than scaling around it.
      resolves: ['app'],
    })
  })

  it('Ship It', () => {
    expectSolved('ship-it', {
      props: {
        pipe: P({ strategy: 'canary', autoRollback: true, gates: ['tests', 'scan', 'smoke'] }),
        alb: P({ deregistrationDelay: 60 }),
      },
      add: [
        ['ecr', 'aws.ecr', P({ immutableTags: true, scanOnPush: true })],
        ['cw', 'aws.cloudwatch', P({ alarmStrategy: 'symptom' })],
      ],
      wire: [
        ['ecr', 'out', 'app', 'deploy'],
        ['app', 'telemetry', 'cw', 'in'],
      ],
    })
  })

  it('The Paved Road', () => {
    expectSolved('paved-road', {
      props: {
        cluster: P({ rbac: 'scoped', privateEndpoint: true }),
        pool: P({ spreadZones: true, autoscale: true, nodeCount: 3 }),
        web: P({
          replicas: 3, cpuRequest: 250, cpuLimit: 0, memRequest: 512, memLimit: 1024,
          livenessProbe: 'http', readinessProbe: true, pdb: true, antiAffinity: true, runAsNonRoot: true,
        }),
        cfg: P({ secretSource: 'external', encryptedAtRest: true }),
        ingress: P({ tls: true, controller: 'gateway-api' }),
      },
      add: [
        ['hpa', 'k8s.hpa', P({ minReplicas: 3, maxReplicas: 12, metric: 'cpu', targetValue: 65 })],
        ['netpol', 'k8s.networkpolicy', P({ defaultDeny: true, egressControl: true })],
        ['ecr', 'aws.ecr', P({ immutableTags: true, scanOnPush: true })],
        ['cw', 'aws.cloudwatch', P({ alarmStrategy: 'symptom' })],
      ],
      wire: [
        ['ecr', 'out', 'web', 'config'],
        ['web', 'telemetry', 'cw', 'in'],
        ['db', 'telemetry', 'cw', 'in'],
      ],
    })
  })

  it('The Drill', () => {
    expectSolved('the-drill', {
      props: {
        db: P({ backupRetention: 21, deletionProtection: true, readReplicas: 1, size: 'db.m5.xlarge' }),
        docs: P({ versioning: true, lifecycle: true, encryption: 'cmk' }),
        cw: P({ alarmStrategy: 'symptom' }),
        app: P({ replicas: 5, size: 'm5.large' }),
      },
      add: [
        ['kms', 'aws.kms', P({ rotation: true, multiRegion: true })],
        ['cache', 'aws.elasticache', P({ nodeType: 'cache.m6g.large' })],
      ],
      wire: [
        ['kms', 'out', 'docs', 'identity'],
        ['app', 'out', 'cache', 'in'],
        ['db', 'telemetry', 'cw', 'in'],
      ],
    })
  })

  it('Cell Division', () => {
    expectSolved('cell-division', {
      props: {
        app: P({ replicas: 4, size: 'm5.xlarge', autoscale: true, maxReplicas: 8 }),
        db: P({ size: 'db.m5.xlarge', multiAz: true, backupRetention: 7 }),
      },
      add: [
        ['edge', 'aws.cloudfront', P({ cachePolicy: 'optimized' })],
        ['alb2', 'aws.alb'],
        ['app2', 'aws.ec2', P({ replicas: 4, size: 'm5.xlarge', autoscale: true, maxReplicas: 8 })],
        ['db2', 'aws.rds', P({ size: 'db.m5.xlarge', multiAz: true, backupRetention: 7 })],
        ['alb3', 'aws.alb'],
        ['app3', 'aws.ec2', P({ replicas: 4, size: 'm5.xlarge', autoscale: true, maxReplicas: 8 })],
        ['db3', 'aws.rds', P({ size: 'db.m5.xlarge', multiAz: true, backupRetention: 7 })],
      ],
      unwire: [['net', 'alb']],
      wire: [
        ['net', 'out', 'edge', 'in'],
        ['edge', 'origin', 'alb', 'in'],
        ['edge', 'origin', 'alb2', 'in'],
        ['edge', 'origin', 'alb3', 'in'],
        ['alb2', 'out', 'app2', 'in'],
        ['app2', 'out', 'db2', 'in'],
        ['alb3', 'out', 'app3', 'in'],
        ['app3', 'out', 'db3', 'in'],
        ['app2', 'telemetry', 'cw', 'in'],
        ['app3', 'telemetry', 'cw', 'in'],
        ['db', 'telemetry', 'cw', 'in'],
        ['db2', 'telemetry', 'cw', 'in'],
        ['db3', 'telemetry', 'cw', 'in'],
      ],
    })
  })
})
