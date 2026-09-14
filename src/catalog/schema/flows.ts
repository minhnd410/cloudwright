import type { EdgeKind, Flow } from './types'

export interface FlowMeta {
  label: string
  kind: EdgeKind
  /** CSS colour token used for the edge and its travelling packets. */
  color: string
  /** OSI layer this flow predominantly lives at. Powers the layer overlay. */
  osi: 3 | 4 | 7
  /** Conventional port(s), for the hover card. */
  port?: string
  /** One-line explanation shown when hovering an edge of this flow. */
  blurb: string
}

export const FLOW_META: Record<Flow, FlowMeta> = {
  http: {
    label: 'HTTP/HTTPS', kind: 'network', color: 'var(--color-flux)', osi: 7, port: '80 / 443',
    blurb: 'Request/response web traffic. Stateless, text-based, and the thing almost every attack and outage is ultimately measured against.',
  },
  grpc: {
    label: 'gRPC', kind: 'network', color: 'var(--color-flux)', osi: 7, port: '443',
    blurb: 'Binary RPC over HTTP/2. Multiplexed streams on one connection — great for service-to-service, awkward through naive L4 load balancers.',
  },
  tcp: {
    label: 'TCP', kind: 'network', color: '#8fb0ff', osi: 4, port: 'any',
    blurb: 'Connection-oriented transport. Three-way handshake, ordered delivery, retransmits. An L4 load balancer sees only this — no URLs, no headers.',
  },
  udp: {
    label: 'UDP', kind: 'network', color: '#8fb0ff', osi: 4, port: 'any',
    blurb: 'Fire-and-forget transport. No handshake, which is why it is the favourite vehicle for amplification floods.',
  },
  sql: {
    label: 'SQL', kind: 'data', color: 'var(--color-vault)', osi: 7, port: '3306 / 5432 / 1433',
    blurb: 'Structured queries to a relational engine. Connection-pool limits, not CPU, are usually what breaks first.',
  },
  nosql: {
    label: 'NoSQL', kind: 'data', color: 'var(--color-vault)', osi: 7, port: '443 / 27017',
    blurb: 'Key/document access. Scales horizontally by partition key — a hot partition will throttle you long before the cluster is busy.',
  },
  cache: {
    label: 'Cache', kind: 'data', color: '#5fd7ff', osi: 7, port: '6379 / 11211',
    blurb: 'In-memory key/value lookups measured in microseconds. Absorbs read load — until a cold start stampedes every miss into the database.',
  },
  queue: {
    label: 'Queue', kind: 'data', color: '#7ee0c0', osi: 7,
    blurb: 'Durable asynchronous hand-off. Decouples producer from consumer, converts a traffic spike into a backlog instead of an outage.',
  },
  stream: {
    label: 'Stream', kind: 'data', color: '#7ee0c0', osi: 7,
    blurb: 'Ordered, replayable log of events. Many consumers read the same records at their own pace.',
  },
  search: {
    label: 'Search', kind: 'data', color: '#9fd0ff', osi: 7, port: '9200',
    blurb: 'Inverted-index queries. Cheap to read, expensive to index — and the index is a derived copy, never the source of truth.',
  },
  object: {
    label: 'Object storage', kind: 'data', color: 'var(--color-vault)', osi: 7, port: '443',
    blurb: 'Flat HTTP-addressable blobs. Effectively infinite, eventually consistent on overwrite, and the single most common source of public data leaks.',
  },
  block: {
    label: 'Block volume', kind: 'data', color: '#6bb6ff', osi: 7,
    blurb: 'A raw virtual disk attached to one machine. IOPS and throughput are provisioned — run out and everything above it stalls.',
  },
  file: {
    label: 'File share', kind: 'data', color: '#6bb6ff', osi: 7, port: '2049 / 445',
    blurb: 'Shared POSIX or SMB filesystem that many machines mount at once.',
  },
  dns: {
    label: 'DNS', kind: 'dns', color: '#c9a7ff', osi: 7, port: '53',
    blurb: 'Name → address resolution. The first hop of every request and, thanks to TTL caching, the slowest thing in the world to change.',
  },
  'tls-cert': {
    label: 'TLS certificate', kind: 'identity', color: '#ffd9a0', osi: 7, port: '443',
    blurb: 'Proves the server is who it claims to be and encrypts the session. Expiry is a scheduled outage you forgot to schedule.',
  },
  identity: {
    label: 'Identity / IAM', kind: 'identity', color: '#ffc46b', osi: 7,
    blurb: 'Who may do what, to which resource, under which conditions. Grants here define your blast radius when something is compromised.',
  },
  secret: {
    label: 'Secret', kind: 'identity', color: '#ffc46b', osi: 7,
    blurb: 'Credentials fetched at runtime instead of baked into an image or an env file in git.',
  },
  key: {
    label: 'Encryption key', kind: 'identity', color: '#ffc46b', osi: 7,
    blurb: 'Key material for encryption at rest. Whoever controls the key controls the data, no matter who holds the ciphertext.',
  },
  telemetry: {
    label: 'Telemetry', kind: 'observability', color: 'var(--color-ink-faint)', osi: 7,
    blurb: 'Metrics, logs and traces flowing out to somewhere you can query them at 3am.',
  },
  deploy: {
    label: 'Deployment', kind: 'deploy', color: '#a0ffc4', osi: 7,
    blurb: 'A pipeline pushing new versions. The most common cause of incidents, and the fastest way out of one.',
  },
  image: {
    label: 'Container image', kind: 'deploy', color: '#a0ffc4', osi: 7,
    blurb: 'Immutable build artefact pulled at start-up. A tag is a mutable pointer; a digest is not.',
  },
  peering: {
    label: 'Network peering', kind: 'fabric', color: '#8a9bbd', osi: 3,
    blurb: 'Private routing between two networks without crossing the public internet.',
  },
  attach: {
    label: 'Attachment', kind: 'fabric', color: '#8a9bbd', osi: 3,
    blurb: 'A resource bound to a network or a host rather than talking over one.',
  },
  schedule: {
    label: 'Scheduling', kind: 'fabric', color: 'var(--color-power)', osi: 7,
    blurb: 'The control plane placing a workload onto capacity that can run it.',
  },
  backup: {
    label: 'Backup', kind: 'data', color: '#9ad5a0', osi: 7,
    blurb: 'A copy you can restore from. Untested backups are folklore, not a recovery plan.',
  },
}

export const EDGE_KIND_META: Record<EdgeKind, { label: string; color: string }> = {
  network: { label: 'Network', color: 'var(--color-flux)' },
  data: { label: 'Data', color: 'var(--color-vault)' },
  identity: { label: 'Identity', color: '#ffc46b' },
  dns: { label: 'DNS', color: '#c9a7ff' },
  observability: { label: 'Observability', color: 'var(--color-ink-faint)' },
  deploy: { label: 'Delivery', color: '#a0ffc4' },
  fabric: { label: 'Fabric', color: '#8a9bbd' },
}

export function flowKind(flow: Flow): EdgeKind {
  return FLOW_META[flow].kind
}

/** Flows that carry live user requests and therefore animate with traffic. */
export const TRAFFIC_FLOWS: ReadonlySet<Flow> = new Set<Flow>([
  'http', 'grpc', 'tcp', 'udp', 'sql', 'nosql', 'cache', 'queue', 'stream', 'search', 'object', 'file',
])

export function isTrafficFlow(flow: Flow): boolean {
  return TRAFFIC_FLOWS.has(flow)
}
