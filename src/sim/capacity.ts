import type { PropBag, ResourceDef } from '@/catalog/schema/types'
import { optionMeta } from '@/catalog/registry'

/**
 * Derives the numbers the engine needs from a resource definition and the
 * player's property choices. Everything that makes a knob *matter* lives here,
 * so the engine itself stays simple and provider-agnostic.
 */

/**
 * Archetypes with no meaningful request capacity of their own. They forward,
 * authorise, observe or schedule — a Kubernetes Service is not a bottleneck.
 */
const UNMETERED = new Set([
  'k8s-service', 'k8s-config', 'k8s-cluster', 'autoscaler', 'monitoring', 'logging',
  'tracing', 'alerting', 'identity', 'secrets', 'kms', 'certificate', 'registry',
  'ci-cd', 'backup', 'firewall', 'private-link', 'internet-gateway', 'peering',
  'service-mesh', 'availability-zone', 'vpc', 'subnet', 'bastion', 'ddos-shield',
])

export interface DerivedProfile {
  /** Requests per second this resource can handle in total. */
  capacity: number
  /** Requests per second one instance handles — what autoscaling adds. */
  unitCapacity: number
  /** True when the engine may add instances up to `maxReplicas`. */
  autoscales: boolean
  /** Utilisation autoscaling aims to hold, 0..1. */
  targetLoad: number
  /** Base added latency in ms at low utilisation. */
  baseLatencyMs: number
  /** How many independent copies exist. */
  replicas: number
  /** Ceiling if autoscaling is on, else equal to replicas. */
  maxReplicas: number
  /** 0..1 availability of the whole resource including redundancy. */
  availability: number
  /** For caches: the share of downstream reads it absorbs. */
  hitRatio: number
}

/** Pulls the first defined numeric prop from a list of candidate keys. */
function num(props: PropBag, keys: string[], fallback: number): number {
  for (const k of keys) {
    const v = props[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return fallback
}

function bool(props: PropBag, key: string): boolean {
  return props[key] === true
}

/** Per-instance throughput implied by the chosen size, when the catalog says so. */
function perInstanceRps(def: ResourceDef, props: PropBag): number | undefined {
  for (const key of ['size', 'taskSize', 'nodeType', 'machineType', 'tier', 'cpu', 'nodeSize']) {
    const rps = optionMeta(def, key, props[key], 'rps')
    if (rps !== undefined) return rps
  }
  return undefined
}

export function deriveProfile(def: ResourceDef, props: PropBag): DerivedProfile {
  const sim = def.sim ?? {}

  const replicas = Math.max(
    1,
    num(props, ['replicas', 'nodeCount', 'minReplicas', 'minInstances', 'readerCount', 'shards'], 1),
  )
  const autoscale = bool(props, 'autoscale')
  const maxReplicas = autoscale
    ? Math.max(replicas, num(props, ['maxReplicas', 'maxInstances'], replicas))
    : Math.max(replicas, num(props, ['maxReplicas'], replicas))

  const unit = perInstanceRps(def, props) ?? sim.capacity ?? 1000
  let capacity = unit * replicas

  // Control-plane and coordination resources route or authorise; they are not
  // a throughput bottleneck and should never show as saturated.
  if (UNMETERED.has(def.archetype)) {
    return {
      capacity: Number.POSITIVE_INFINITY,
      unitCapacity: Number.POSITIVE_INFINITY,
      autoscales: false,
      targetLoad: 0.65,
      baseLatencyMs: sim.latencyMs ?? 1,
      replicas,
      maxReplicas,
      availability: 1 - Math.pow(1 - (sim.availability ?? 0.9999), redundancyFactor(def, props, replicas)),
      hitRatio: 0,
    }
  }

  // Archetype-specific adjustments that teach something.
  switch (def.archetype) {
    case 'client':
    case 'internet':
    case 'attacker':
      capacity = Number.POSITIVE_INFINITY
      break
    case 'relational-db': {
      // Read replicas add read capacity; a Multi-AZ standby adds none.
      const readReplicas = num(props, ['readReplicas'], 0)
      capacity = unit * (1 + readReplicas * 0.8)
      // A connection pooler stops serverless fan-out from exhausting connections.
      if (bool(props, 'connectionPooling')) capacity *= 1.35
      break
    }
    case 'cdn': {
      // A CDN's own capacity is enormous; what matters is what it passes through.
      capacity = sim.capacity ?? 1_000_000
      break
    }
    case 'serverless-function': {
      const reserved = num(props, ['reservedConcurrency'], 0)
      const memFactor = num(props, ['memoryMb'], 512) / 512
      capacity = (sim.capacity ?? 3000) * memFactor
      if (reserved > 0) capacity = Math.min(capacity, reserved * 40)
      break
    }
    case 'container-service': {
      // Cloud Run style: concurrency multiplies what one instance absorbs.
      const concurrency = num(props, ['concurrency'], 0)
      if (concurrency > 0) capacity = unit * replicas * Math.min(concurrency / 10, 8)
      break
    }
    case 'nosql-db': {
      // A hot partition throttles no matter how much you provision.
      const quality = String(props.partitionKeyQuality ?? 'high')
      const factor = quality === 'low' ? 0.12 : quality === 'medium' ? 0.55 : 1
      capacity = (sim.capacity ?? 20000) * factor
      break
    }
    case 'k8s-workload': {
      // Pod throughput scales with its CPU request.
      const cpuMillis = num(props, ['cpuRequest'], 250)
      capacity = (sim.capacity ?? 300) * (cpuMillis / 250) * replicas
      break
    }
    case 'k8s-nodepool': {
      const perNode = optionMeta(def, 'nodeSize', props.nodeSize, 'cpu') ?? 4
      capacity = perNode * 1000 * num(props, ['nodeCount'], 3)
      break
    }
    case 'api-gateway': {
      // The throttle limit is the real ceiling — that is the whole point of it.
      capacity = Math.min(sim.capacity ?? 10000, num(props, ['throttleRps'], Infinity))
      break
    }
    default:
      break
  }

  // Latency
  let baseLatencyMs = sim.latencyMs ?? 5
  if (def.archetype === 'client') {
    baseLatencyMs = { same: 5, continent: 35, global: 140 }[String(props.region ?? 'same')] ?? 5
  }
  if (def.archetype === 'relational-db' && bool(props, 'connectionPooling')) baseLatencyMs += 1
  if (def.archetype === 'nosql-db' && props.consistency === 'strong') baseLatencyMs *= 2.2
  if (def.archetype === 'serverless-function' && num(props, ['provisionedConcurrency'], 0) === 0) {
    baseLatencyMs += 40 // cold start amortised into the average
  }
  if (def.archetype === 'container-service' && num(props, ['minReplicas', 'minInstances'], 1) === 0) {
    baseLatencyMs += 60
  }

  // Availability: redundancy turns one instance's availability into the
  // probability that at least one of N is up.
  const single = sim.availability ?? 0.999
  const redundancy = redundancyFactor(def, props, replicas)
  const availability = 1 - Math.pow(1 - single, redundancy)

  // Cache hit ratio — what fraction of downstream reads never happen.
  let hitRatio = 0
  if (def.archetype === 'cache') hitRatio = 0.85
  if (def.archetype === 'cdn') {
    hitRatio = { disabled: 0, optimized: 0.92, 'all-viewer': 0.15 }[String(props.cachePolicy ?? 'optimized')] ?? 0.9
    if (props.cdn === false) hitRatio = 0
    if (def.id === 'gcp.load-balancer') hitRatio = props.cdn ? 0.9 : 0
  }

  const safeCapacity = Math.max(capacity, 0)
  return {
    capacity: safeCapacity,
    unitCapacity: replicas > 0 ? safeCapacity / replicas : safeCapacity,
    autoscales: autoscale && maxReplicas > replicas && Number.isFinite(safeCapacity),
    targetLoad: Math.min(0.95, Math.max(0.2, num(props, ['targetCpu'], 65) / 100)),
    baseLatencyMs,
    replicas,
    maxReplicas,
    availability,
    hitRatio,
  }
}

/**
 * How many independent failure domains this resource actually spans. Replica
 * count alone is not redundancy — three Pods on one node, or three instances in
 * one zone, still share a single point of failure.
 */
function redundancyFactor(def: ResourceDef, props: PropBag, replicas: number): number {
  if (bool(props, 'multiAz') || bool(props, 'highAvailability') || bool(props, 'zoneRedundant')) {
    return Math.max(2, replicas)
  }
  if (props.zones === 'multi' || bool(props, 'spreadZones')) return Math.max(2, replicas)
  if (props.zones === 'none' || props.spreadZones === false) return 1
  if (def.archetype === 'k8s-workload') {
    return bool(props, 'antiAffinity') ? Math.max(2, replicas) : Math.min(replicas, 1.4)
  }
  if (def.archetype === 'relational-db') return bool(props, 'multiAz') ? 2 : 1
  // Managed, regional services are internally redundant.
  if (['cdn', 'object-store', 'queue', 'stream', 'dns-zone', 'load-balancer-l7', 'load-balancer-l4', 'nosql-db', 'waf', 'api-gateway'].includes(def.archetype)) {
    return Math.max(3, replicas)
  }
  return replicas
}

/**
 * Queueing behaviour. Latency stays flat while there is headroom, then rises
 * sharply as utilisation approaches one — which is what makes a system feel
 * fine right up until it does not.
 */
export function latencyUnderLoad(base: number, utilisation: number): number {
  const u = Math.max(0, Math.min(utilisation, 0.995))
  return base * (1 + Math.pow(u, 3) * 8) + (utilisation > 1 ? (utilisation - 1) * base * 20 : 0)
}
