import { diagram } from './builder'
import type { SavedDiagram } from '@/store/types'

export interface Template {
  id: string
  name: string
  blurb: string
  build: () => SavedDiagram
}

/**
 * Reference architectures to start from. Each is a shape you would actually
 * recognise in a real account, deliberately left with a couple of things for
 * the Review panel to complain about.
 */
export const TEMPLATES: Template[] = [
  {
    id: 'three-tier',
    name: 'Classic three-tier',
    blurb: 'Load balancer, stateless compute, managed database. The shape most systems still are.',
    build: () => diagram('Classic three-tier', [
      { id: 'users', def: 'core.client', at: [-420, 140], props: { rps: 800 } },
      { id: 'net', def: 'core.internet', at: [-210, 140] },
      { id: 'cdn', def: 'aws.cloudfront', at: [0, 140] },
      { id: 'vpc', def: 'aws.vpc', at: [240, -60], size: [860, 520] },
      { id: 'pub-a', def: 'aws.subnet', at: [30, 70], size: [250, 180], in: 'vpc', props: { tier: 'public', cidr: '10.0.0.0/20', az: 'a' }, label: 'Public 1a' },
      { id: 'priv-a', def: 'aws.subnet', at: [310, 70], size: [250, 180], in: 'vpc', props: { tier: 'private', cidr: '10.0.64.0/20', az: 'a' }, label: 'App 1a' },
      { id: 'priv-b', def: 'aws.subnet', at: [310, 280], size: [250, 180], in: 'vpc', props: { tier: 'private', cidr: '10.0.80.0/20', az: 'b' }, label: 'App 1b' },
      { id: 'data', def: 'aws.subnet', at: [590, 70], size: [240, 390], in: 'vpc', props: { tier: 'isolated', cidr: '10.0.128.0/22', az: 'a' }, label: 'Data' },
      { id: 'alb', def: 'aws.alb', at: [30, 60], in: 'pub-a' },
      { id: 'app-a', def: 'aws.ec2', at: [30, 55], in: 'priv-a', props: { size: 'm5.large', replicas: 2, autoscale: true, maxReplicas: 10, zones: 'multi' } },
      { id: 'cache', def: 'aws.elasticache', at: [30, 50], in: 'priv-b', props: { multiAz: true } },
      { id: 'db', def: 'aws.rds', at: [25, 60], in: 'data', props: { multiAz: true, backupRetention: 14 } },
      { id: 'mon', def: 'aws.cloudwatch', at: [700, 560], props: { alarmStrategy: 'symptom' } },
    ], [
      ['users', 'out', 'net', 'in'],
      ['net', 'out', 'cdn', 'in'],
      ['cdn', 'origin', 'alb', 'in'],
      ['alb', 'out', 'app-a', 'in'],
      ['app-a', 'out', 'cache', 'in'],
      ['app-a', 'out', 'db', 'in'],
      ['app-a', 'telemetry', 'mon', 'in'],
    ]),
  },
  {
    id: 'serverless',
    name: 'Serverless API',
    blurb: 'API gateway, functions, a NoSQL table. Nothing to patch, and a different set of limits.',
    build: () => diagram('Serverless API', [
      { id: 'users', def: 'core.client', at: [-400, 160], props: { rps: 1200, pattern: 'spiky', region: 'global' } },
      { id: 'net', def: 'core.internet', at: [-190, 160] },
      { id: 'waf', def: 'aws.waf', at: [30, 160], props: { mode: 'block', rateLimit: 2000 } },
      { id: 'api', def: 'aws.apigw', at: [270, 160], props: { authorizer: 'jwt', throttleRps: 5000 } },
      { id: 'fn', def: 'aws.lambda', at: [520, 160], props: { memoryMb: 1024, reservedConcurrency: 120 } },
      { id: 'table', def: 'aws.dynamodb', at: [780, 80], props: { pitr: true } },
      { id: 'queue', def: 'aws.sqs', at: [780, 280], props: { dlqEnabled: true } },
      { id: 'worker', def: 'aws.lambda', at: [1030, 280], props: { memoryMb: 512 }, label: 'Worker' },
      { id: 'bucket', def: 'aws.s3', at: [1030, 60], props: { versioning: true } },
      { id: 'secrets', def: 'aws.secrets-manager', at: [520, -40], props: { rotation: true } },
    ], [
      ['users', 'out', 'net', 'in'],
      ['net', 'out', 'waf', 'in'],
      ['waf', 'out', 'api', 'in'],
      ['api', 'out', 'fn', 'in'],
      ['fn', 'out', 'table', 'in'],
      ['fn', 'out', 'queue', 'in'],
      ['queue', 'out', 'worker', 'in'],
      ['worker', 'out', 'bucket', 'in'],
      ['secrets', 'out', 'fn', 'identity'],
    ]),
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes platform',
    blurb: 'Cluster, node pool, ingress, a Deployment behind a Service — and a NetworkPolicy.',
    build: () => diagram('Kubernetes platform', [
      { id: 'users', def: 'core.client', at: [-400, 200], props: { rps: 900 } },
      { id: 'net', def: 'core.internet', at: [-190, 200] },
      { id: 'cluster', def: 'k8s.cluster', at: [50, -40], size: [880, 560], props: { rbac: 'scoped', privateEndpoint: true } },
      { id: 'ingress', def: 'k8s.ingress', at: [40, 200], in: 'cluster', props: { tls: true, rateLimit: true } },
      { id: 'svc', def: 'k8s.service', at: [250, 200], in: 'cluster' },
      { id: 'pool', def: 'k8s.nodepool', at: [450, 90], size: [380, 320], in: 'cluster', props: { nodeCount: 4, spreadZones: true, nodeSize: 'medium' } },
      { id: 'web', def: 'k8s.deployment', at: [30, 40], in: 'pool', props: { replicas: 4, antiAffinity: true, pdb: true, readinessProbe: true, livenessProbe: 'http', memLimit: 1024 } },
      { id: 'netpol', def: 'k8s.networkpolicy', at: [450, 450], in: 'cluster', props: { defaultDeny: true, egressControl: true } },
      { id: 'hpa', def: 'k8s.hpa', at: [250, 380], in: 'cluster', props: { metric: 'rps', minReplicas: 4, maxReplicas: 24 } },
      { id: 'db', def: 'aws.rds', at: [1000, 220], props: { multiAz: true, backupRetention: 14 } },
      { id: 'mon', def: 'aws.cloudwatch', at: [1000, 420], props: { alarmStrategy: 'symptom' } },
    ], [
      ['users', 'out', 'net', 'in'],
      ['net', 'out', 'ingress', 'in'],
      ['ingress', 'out', 'svc', 'in'],
      ['svc', 'out', 'web', 'in'],
      ['web', 'out', 'db', 'in'],
      ['web', 'telemetry', 'mon', 'in'],
      ['netpol', 'out', 'web', 'in'],
    ]),
  },
  {
    id: 'multi-cloud',
    name: 'Same system, three clouds',
    blurb: 'The identical architecture on AWS, Azure and GCP, side by side. The names change; the shape does not.',
    build: () => diagram('Same system, three clouds', [
      { id: 'users', def: 'core.client', at: [-380, 340], props: { rps: 600, region: 'global' } },
      { id: 'net', def: 'core.internet', at: [-170, 340] },

      { id: 'a-lb', def: 'aws.alb', at: [120, 60], label: 'AWS · ALB' },
      { id: 'a-app', def: 'aws.ecs-fargate', at: [400, 60], label: 'AWS · Fargate' },
      { id: 'a-db', def: 'aws.rds', at: [680, 60], props: { multiAz: true, backupRetention: 7 }, label: 'AWS · RDS' },

      { id: 'z-lb', def: 'azure.app-gateway', at: [120, 330], label: 'Azure · App Gateway' },
      { id: 'z-app', def: 'azure.container-apps', at: [400, 330], label: 'Azure · Container Apps' },
      { id: 'z-db', def: 'azure.sql', at: [680, 330], props: { zoneRedundant: true }, label: 'Azure · SQL' },

      { id: 'g-lb', def: 'gcp.load-balancer', at: [120, 600], label: 'GCP · Global LB' },
      { id: 'g-app', def: 'gcp.cloud-run', at: [400, 600], label: 'GCP · Cloud Run' },
      { id: 'g-db', def: 'gcp.cloud-sql', at: [680, 600], props: { highAvailability: true }, label: 'GCP · Cloud SQL' },
    ], [
      ['users', 'out', 'net', 'in'],
      ['net', 'out', 'a-lb', 'in'],
      ['a-lb', 'out', 'a-app', 'in'],
      ['a-app', 'out', 'a-db', 'in'],
      ['net', 'out', 'z-lb', 'in'],
      ['z-lb', 'out', 'z-app', 'in'],
      ['z-app', 'out', 'z-db', 'in'],
      ['net', 'out', 'g-lb', 'in'],
      ['g-lb', 'out', 'g-app', 'in'],
      ['g-app', 'out', 'g-db', 'in'],
    ]),
  },
]
