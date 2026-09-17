/**
 * Short display labels for concept links, derived from the id.
 *
 * Deliberately separate from `concepts.ts`: the canvas shows these on chips and
 * badges, and importing the full codex prose there would put ~40kB of text in
 * the bundle that opens the editor. The codex page loads the real content.
 */

const OVERRIDES: Record<string, string> = {
  'cidr-subnetting': 'CIDR & subnetting',
  'osi-model': 'The OSI model',
  'dns-resolution': 'How DNS resolves',
  'ttl-and-caching': 'TTL & caching',
  'tcp-handshake': 'The TCP handshake',
  'tls-handshake': 'The TLS handshake',
  'tls-termination': 'TLS termination',
  'nat-vs-igw': 'NAT vs internet gateway',
  'public-vs-private-subnet': 'Public vs private subnets',
  'vpc-design': 'Designing a VPC',
  'cdn': 'CDNs',
  'bgp': 'BGP',
  'cap-theorem': 'The CAP theorem',
  'acid-transactions': 'ACID transactions',
  'nosql-modelling': 'NoSQL modelling',
  'iops': 'IOPS & throughput',
  'rpo-rto': 'RPO & RTO',
  'slo-sli': 'SLI, SLO & error budgets',
  'dora-metrics': 'The DORA metrics',
  'rbac': 'RBAC',
  'owasp-top-10': 'The OWASP Top Ten',
  'sql-injection': 'SQL injection',
  'ssrf': 'SSRF',
  'waf': 'Web application firewalls',
  'ddos-mitigation': 'DDoS mitigation',
  'pki': 'Public key infrastructure',
  'ci-cd': 'CI/CD',
  'twelve-factor': 'Twelve-factor habits',
  'kubernetes-architecture': 'Kubernetes architecture',
  'kubernetes-networking': 'Kubernetes networking',
  'kubernetes-scheduling': 'Kubernetes scheduling',
  'kubernetes-workloads': 'Kubernetes workloads',
  'declarative-vs-imperative': 'Declarative vs imperative',
  'resource-requests-limits': 'Requests & limits',
  'stateful-vs-stateless-firewall': 'Stateful vs stateless filtering',
  'block-vs-object-storage': 'Block, file & object storage',
  'least-privilege-network': 'Least privilege on the network',
  'api-gateway-pattern': 'The API gateway pattern',
  'availability-math': 'The arithmetic of nines',
  'error-budgets': 'Error budgets',
  'cost-optimisation': 'Cost optimisation',
  'gitops': 'GitOps',
  'mtls': 'Mutual TLS',
  'sbom-and-provenance': 'SBOMs & provenance',
  'operators-and-crds': 'Operators & CRDs',
  'gateway-api': 'The Gateway API',
  'http-versions': 'HTTP/1.1, 2 and 3',
  'queueing-theory': 'Why latency explodes near full',
  'consensus-and-quorum': 'Consensus & quorum',
  'kubernetes-autoscaling': 'Autoscaling in Kubernetes',
  'namespaces-and-quotas': 'Namespaces & quotas',
  'analytics-vs-transactions': 'OLTP vs OLAP',
  'self-service-guardrails': 'Self-service & guardrails',
  'golden-signals': 'The four golden signals',
  'release-versioning': 'Artefacts & versioning',
  'spot-capacity': 'Spot & preemptible capacity',
  'instance-selection': 'Choosing instance types',
  'egress-control': 'Controlling egress',
  'stateful-workloads': 'State in Kubernetes',
  'internal-developer-platform': 'The internal developer platform',
  'change-data-capture': 'Change data capture',
  'cell-based-architecture': 'Cell-based architecture',
  'log-management': 'Logs at scale',
  'on-call': 'On-call',
  'toil': 'Toil',
  'developer-experience': 'Developer experience',
}

export function conceptLabel(id: string): string {
  const override = OVERRIDES[id]
  if (override) return override
  const words = id.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Number of codex entries, for the landing page. Kept here rather than imported
 * from `concepts.ts` so the home page does not pull in the whole codex; a test
 * asserts it stays accurate.
 */
export const CODEX_ENTRY_COUNT = 162
