import type { Archetype, Flow, Port, ResourceDef } from './types'
import { FLOW_META } from './flows'

export interface ConnectionAttempt {
  source: ResourceDef
  sourcePort: Port
  target: ResourceDef
  targetPort: Port
  /** Existing edge count already using the source/target port. */
  sourcePortLoad?: number
  targetPortLoad?: number
}

export type ConnectionVerdict =
  | { ok: true; flows: Flow[]; primary: Flow }
  | { ok: false; reason: string; teach: string; hint?: string }

/**
 * Curated explanations for connections players *will* try and that are worth a
 * real lesson rather than a generic "flows don't match". Keyed
 * `sourceArchetype>targetArchetype`; `*` matches any.
 */
const TEACHING: Record<string, { reason: string; teach: string; hint?: string }> = {
  'internet>relational-db': {
    reason: 'The public internet cannot reach a database directly.',
    teach:
      'A database speaks SQL on a private port, not HTTP. Exposing one to the internet is how credential-stuffing and ransomware incidents start. Production databases sit in a private subnet with no route to an internet gateway.',
    hint: 'Route through a load balancer → compute tier → database.',
  },
  'internet>nosql-db': {
    reason: 'The public internet cannot reach your data store directly.',
    teach:
      'Even when a managed NoSQL service has a public endpoint, requests must be signed by an authenticated identity — browsers hold no such credential. Front it with an API layer that authenticates the caller and holds the credential server-side.',
    hint: 'Put an API gateway or a function in front.',
  },
  'internet>vm': {
    reason: 'Nothing should reach a virtual machine straight off the internet.',
    teach:
      'A single instance with a public IP is a single point of failure and a permanently open attack surface. A load balancer gives you health checks, TLS termination, and a stable address while the instances behind it stay private.',
    hint: 'Insert a load balancer, and keep the VM in a private subnet.',
  },
  'internet>k8s-workload': {
    reason: 'Traffic cannot enter a Pod directly from outside the cluster.',
    teach:
      'Pods have ephemeral IPs inside the cluster network. External traffic enters through an Ingress or a Service of type LoadBalancer, which resolves to the current set of healthy Pods via endpoints.',
    hint: 'Internet → Ingress → Service → Deployment.',
  },
  'load-balancer-l7>relational-db': {
    reason: 'A load balancer cannot front a database.',
    teach:
      'An L7 load balancer parses HTTP. A database speaks its own binary wire protocol, so there are no paths, headers or status codes to route on, and no health check that means anything. Database read scaling is done with read replicas and a connection pooler instead.',
    hint: 'Add compute between them, and use read replicas to scale reads.',
  },
  'object-store>relational-db': {
    reason: 'Storage services do not call each other.',
    teach:
      'Object storage is passive: it answers requests, it never initiates them. Moving data from a bucket into a database requires something to do the work — a function, a job, or a managed ingestion pipeline.',
    hint: 'Add a function or a data pipeline between them.',
  },
  'relational-db>*': {
    reason: 'A managed database does not initiate connections to your services.',
    teach:
      'Managed databases are request-response only. Application code opens the connection, runs the query, and reads the result. If you need the database to trigger work, publish an event from your application or use change-data-capture into a stream.',
  },
  'client>relational-db': {
    reason: 'Client devices must never hold database credentials.',
    teach:
      'Anything shipped to a browser or a phone is readable by the user. A credential in client code is a published credential. All data access goes through a server-side tier you control.',
    hint: 'Client → API → database.',
  },
  'vm>vm': {
    reason: 'Two machines need a network path, not a wire you draw.',
    teach:
      'Instance-to-instance traffic is governed by subnet routing and firewall rules, not by a direct link. Place both in a network, then allow the port explicitly in a security group. Where the call is a real service dependency, put a load balancer or service discovery between them so one instance dying does not break the other.',
    hint: 'Place both in a VPC/VNet and connect through a load balancer.',
  },
  'subnet>subnet': {
    reason: 'Subnets inside one network already route to each other.',
    teach:
      'Every subnet in a VPC or VNet shares an implicit local route. There is nothing to connect. What you control is whether firewall rules permit the traffic, and whether the subnet has a route to the internet — which is exactly what makes it public or private.',
  },
}

function key(a: Archetype | '*', b: Archetype | '*') {
  return `${a}>${b}`
}

function lookupTeaching(source: Archetype, target: Archetype) {
  return (
    TEACHING[key(source, target)] ??
    TEACHING[key(source, '*')] ??
    TEACHING[key('*', target)] ??
    null
  )
}

function listFlows(flows: Flow[]): string {
  const names = flows.map((f) => FLOW_META[f].label)
  if (names.length <= 1) return names[0] ?? 'nothing'
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Priority order when several flows are legal between two ports. The first
 * match becomes the edge's primary flow, which decides its colour and how the
 * simulator treats it.
 */
const FLOW_PRIORITY: Flow[] = [
  'http', 'grpc', 'sql', 'nosql', 'cache', 'queue', 'stream', 'search',
  'object', 'file', 'block', 'tcp', 'udp', 'dns', 'tls-cert',
  'identity', 'secret', 'key', 'image', 'deploy', 'schedule',
  'telemetry', 'backup', 'peering', 'attach',
]

export function pickPrimaryFlow(flows: Flow[]): Flow {
  for (const f of FLOW_PRIORITY) if (flows.includes(f)) return f
  return flows[0]
}

export function validateConnection(a: ConnectionAttempt): ConnectionVerdict {
  const { source, sourcePort, target, targetPort } = a

  if (sourcePort.side !== 'out' || targetPort.side !== 'in') {
    return {
      reason: 'Connections run from an output to an input.',
      teach:
        'Every dependency has a direction: one side initiates the call, the other answers it. Direction is what lets the simulator work out which way traffic flows and which way a failure cascades.',
      ok: false,
    }
  }

  const shared = sourcePort.flows.filter((f) => targetPort.flows.includes(f))
  if (shared.length === 0) {
    const curated = lookupTeaching(source.archetype, target.archetype)
    if (curated) return { ok: false, ...curated }
    return {
      ok: false,
      reason: `${source.short} cannot talk to ${target.short} this way.`,
      teach: `${source.short} offers ${listFlows(sourcePort.flows)} on this port, while ${target.short} accepts ${listFlows(targetPort.flows)}. Two resources connect only when one speaks a protocol the other understands — otherwise you need something in between to translate.`,
    }
  }

  if (sourcePort.max !== undefined && (a.sourcePortLoad ?? 0) >= sourcePort.max) {
    return {
      ok: false,
      reason: `${source.short} allows ${sourcePort.max} connection${sourcePort.max === 1 ? '' : 's'} on "${sourcePort.label}".`,
      teach:
        'Cardinality limits in the game mirror real service quotas — a subnet belongs to exactly one VPC, a volume attaches to one instance at a time. Hitting a limit is a design signal, not a bug.',
    }
  }

  if (targetPort.max !== undefined && (a.targetPortLoad ?? 0) >= targetPort.max) {
    return {
      ok: false,
      reason: `${target.short} allows ${targetPort.max} connection${targetPort.max === 1 ? '' : 's'} on "${targetPort.label}".`,
      teach:
        'Cardinality limits in the game mirror real service quotas. When you need more, you usually need another instance of the thing — or a different topology.',
    }
  }

  return { ok: true, flows: shared, primary: pickPrimaryFlow(shared) }
}

/** Can `child` be dropped inside `parent`? */
export function canContain(parent: ResourceDef, child: ResourceDef): boolean {
  if (!parent.container) return false
  if (parent.container.accepts === '*') return true
  return parent.container.accepts.includes(child.archetype)
}
