/**
 * Cloudwright catalog schema.
 *
 * Everything the game knows about a cloud resource lives in one `ResourceDef`.
 * Adding a new service = adding one file that exports a `ResourceDef`. The
 * canvas, the inspector, the simulation, the cost model, the advisor and the
 * "how do I build this for real" drawer all read from this single definition.
 *
 * The critical idea is the `archetype`: a provider-agnostic behaviour class.
 * The simulation engine only ever reasons about archetypes, never about
 * `aws.ec2` vs `azure.vm` vs `gcp.gce`. That keeps the engine small and makes
 * every new provider resource work on day one.
 */

// ── Providers ───────────────────────────────────────────────────────────────

export const PROVIDERS = ['aws', 'azure', 'gcp', 'kubernetes', 'core'] as const
export type ProviderId = (typeof PROVIDERS)[number]

// ── Archetypes: the behaviour classes the simulator understands ─────────────

export const ARCHETYPES = [
  // Traffic sources & boundaries
  'client', 'internet', 'attacker',
  // Edge / delivery
  'dns-zone', 'cdn', 'waf', 'ddos-shield', 'api-gateway',
  'load-balancer-l7', 'load-balancer-l4',
  // Compute
  'vm', 'vm-scale-set', 'container-service', 'serverless-function', 'static-hosting',
  // Kubernetes
  'k8s-cluster', 'k8s-nodepool', 'k8s-workload', 'k8s-service', 'k8s-ingress', 'k8s-config',
  // Data
  'relational-db', 'nosql-db', 'cache', 'queue', 'stream', 'search',
  'object-store', 'block-storage', 'file-storage', 'data-warehouse',
  // Network fabric
  'vpc', 'subnet', 'availability-zone', 'firewall', 'nat', 'internet-gateway',
  'vpn', 'private-link', 'peering', 'service-mesh',
  // Security & identity
  'identity', 'secrets', 'kms', 'certificate', 'bastion',
  // Operations
  'monitoring', 'logging', 'tracing', 'alerting', 'ci-cd', 'registry', 'backup', 'autoscaler',
] as const
export type Archetype = (typeof ARCHETYPES)[number]

// ── Flows: what can travel along an edge ────────────────────────────────────

export const FLOWS = [
  'http', 'grpc', 'tcp', 'udp',
  'sql', 'nosql', 'cache', 'queue', 'stream', 'search',
  'object', 'block', 'file',
  'dns', 'tls-cert',
  'identity', 'secret', 'key',
  'telemetry', 'deploy', 'image',
  'peering', 'attach', 'schedule', 'backup',
] as const
export type Flow = (typeof FLOWS)[number]

/** Visual + semantic family for an edge, derived from its flow. */
export type EdgeKind =
  | 'network' | 'data' | 'identity' | 'dns' | 'observability' | 'deploy' | 'fabric'

// ── Categories: how the palette is grouped ──────────────────────────────────

export const CATEGORIES = [
  'traffic', 'edge', 'compute', 'kubernetes', 'database', 'storage',
  'messaging', 'network', 'security', 'operations',
] as const
export type Category = (typeof CATEGORIES)[number]

// ── Ports ───────────────────────────────────────────────────────────────────

export type Side = 'in' | 'out'
export type HandlePosition = 'top' | 'right' | 'bottom' | 'left'

export interface Port {
  id: string
  side: Side
  /** Flows this port can carry. An edge is legal when source/target flows intersect. */
  flows: Flow[]
  label: string
  /** Max connections on this port. Omit for unlimited. */
  max?: number
  /** Preferred handle placement. Defaults: `in` → left, `out` → right. */
  position?: HandlePosition
  /** Hidden ports still validate but are not rendered as separate handles. */
  hidden?: boolean
}

// ── Containment (VPC → Subnet → Instance, Cluster → Node → Pod) ─────────────

export interface ContainerDef {
  /** Archetypes that may be dropped inside. `'*'` accepts anything. */
  accepts: Archetype[] | '*'
  label: string
  /** Default size when placed on the canvas. */
  size?: { width: number; height: number }
  /** Nested padding so children never sit on the border. */
  padding?: number
}

// ── Properties ──────────────────────────────────────────────────────────────

export type PropType = 'number' | 'select' | 'boolean' | 'text' | 'cidr' | 'multiselect'

export type PropImpact =
  | 'capacity' | 'cost' | 'latency' | 'availability' | 'security' | 'durability' | 'scale'

export interface PropOption {
  value: string
  label: string
  /** Free-form numbers the sim/cost model reads (vcpu, memGb, rps, hourly…). */
  meta?: Record<string, number | string | boolean>
  /** Shown as a one-liner next to the option. */
  note?: string
}

export interface PropDef {
  key: string
  label: string
  type: PropType
  default: PropValue
  /** Plain-language explanation of what this setting *is*. */
  help: string
  /** What visibly changes in the simulation when you move this. */
  impact: string
  /** Which meters light up in the inspector when this changes. */
  affects?: PropImpact[]
  options?: PropOption[]
  min?: number
  max?: number
  step?: number
  unit?: string
  /** Only show this property when the predicate passes. */
  visibleWhen?: (props: PropBag) => boolean
  /** Marks a setting that is a classic production footgun when set wrong. */
  danger?: (value: PropValue, props: PropBag) => string | null
  advanced?: boolean
}

export type PropValue = string | number | boolean | string[]
export type PropBag = Record<string, PropValue>

// ── Simulation profile ──────────────────────────────────────────────────────

export const ATTACK_VECTORS = [
  'volumetric-ddos', // L3/L4 flood
  'app-ddos', // L7 flood
  'sql-injection',
  'xss',
  'credential-stuffing',
  'lateral-movement',
  'data-exfiltration',
  'ransomware',
  'supply-chain',
  'ssrf',
  'privilege-escalation',
  'dns-hijack',
  'port-scan',
] as const
export type AttackVector = (typeof ATTACK_VECTORS)[number]

export interface FailureMode {
  id: string
  label: string
  /** What the player sees in metrics/logs when this happens. */
  symptom: string
  /** The textbook remediation, revealed after the player solves or gives up. */
  remedy: string
}

export interface SimProfile {
  /** Requests per second this resource handles at its default configuration. */
  capacity?: number
  /** Added latency in ms at low utilisation. */
  latencyMs?: number
  /** Does it hold state that survives a restart? Drives blast-radius maths. */
  stateful?: boolean
  /** Availability of a single instance, e.g. 0.999. Redundancy multiplies this. */
  availability?: number
  /** Attack vectors this resource blunts, 0..1 effectiveness. */
  mitigates?: Partial<Record<AttackVector, number>>
  /** Attack vectors this resource is a target for. */
  vulnerableTo?: AttackVector[]
  /** Realistic ways this breaks, surfaced by incident generators. */
  failureModes?: FailureMode[]
  /** Consumes capacity from its container (e.g. a Pod on a node pool). */
  demandsSchedulingSlots?: number
}

// ── Cost ────────────────────────────────────────────────────────────────────

export interface CostModel {
  /** USD per hour at the given property configuration. */
  hourly?: (props: PropBag) => number
  /** USD per million requests. */
  perMillionRequests?: (props: PropBag) => number
  /** USD per GB of egress. */
  perGbEgress?: (props: PropBag) => number
  /** USD per GB-month of stored data. */
  perGbMonth?: (props: PropBag) => number
  /** Shown verbatim so players know these are teaching figures, not quotes. */
  note?: string
}

// ── Real-world setup guide ──────────────────────────────────────────────────

export interface CodeSnippet {
  label: string
  lang: 'bash' | 'hcl' | 'yaml' | 'json' | 'sql' | 'text'
  code: string
}

export interface SetupGuide {
  /** Ordered steps a human would actually take in the console. */
  console?: string[]
  /** CLI, Terraform, Kubernetes manifests… whatever fits the resource. */
  snippets?: CodeSnippet[]
  /** Official documentation. */
  docs?: { label: string; url: string }[]
  /** Hard-won operational advice. */
  gotchas?: string[]
}

// ── The resource definition ─────────────────────────────────────────────────

export interface ResourceDef {
  /** Stable id, `provider.slug`. Never rename — saved diagrams reference it. */
  id: string
  provider: ProviderId
  /** Full product name, e.g. "Elastic Compute Cloud". */
  name: string
  /** What people actually say, e.g. "EC2". Used on the node body. */
  short: string
  archetype: Archetype
  category: Category
  /** One line, shown under the name in the palette. */
  tagline: string
  /** A paragraph explaining the service in plain language. */
  description: string
  /** Icon id; defaults to an archetype icon when omitted. */
  icon?: string
  ports: Port[]
  container?: ContainerDef
  /** Advisory: the resource is misplaced outside these containers. */
  wantsContainer?: Archetype[]
  props?: PropDef[]
  sim?: SimProfile
  cost?: CostModel
  setup?: SetupGuide
  /** Codex topic ids this resource teaches. */
  concepts?: string[]
  /** Searchable synonyms. */
  keywords?: string[]
  /** Hide from the palette (used for scenario-only or internal nodes). */
  hidden?: boolean
}
