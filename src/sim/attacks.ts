import type { AttackVector, PropBag } from '@/catalog/schema/types'
import type { SimGraph } from './types'
import type { Topology } from './graph'

export interface AttackMeta {
  label: string
  /** What the adversary is trying to achieve. */
  goal: string
  /** How it actually works, in two or three sentences. */
  how: string
  /** The controls that stop it, roughly in order of effectiveness. */
  defences: string[]
  /** Requests per second of hostile traffic at intensity 1. */
  rpsPerIntensity: number
  /** Which OSI layer the attack primarily operates at. */
  osi: 3 | 4 | 7
}

export const ATTACK_META: Record<AttackVector, AttackMeta> = {
  'volumetric-ddos': {
    label: 'Volumetric DDoS',
    goal: 'Exhaust your bandwidth or packet-processing capacity so legitimate traffic cannot get through.',
    how: 'Huge numbers of packets — often amplified by reflecting off open UDP services such as DNS or NTP, which reply with far more data than they receive — are aimed at your address. The attacker never completes a connection and never touches your application.',
    defences: [
      'Serve through a CDN or global edge so the flood lands on their network, not yours',
      'Keep origin addresses private so the edge cannot be bypassed',
      'Managed DDoS protection (Shield, Cloud Armor, Azure DDoS Protection)',
      'Never expose UDP services that can be used for amplification',
    ],
    rpsPerIntensity: 25000,
    osi: 3,
  },
  'app-ddos': {
    label: 'Application-layer DDoS',
    goal: 'Make your servers do expensive work until they fall over, using very little attacker bandwidth.',
    how: 'Legitimate-looking HTTP requests are aimed at your most expensive endpoints — a search with no cache key, a report generation, a login that hashes a password. A few thousand requests per second can be far more damaging than a terabit flood because each one costs you real CPU and a database round trip.',
    defences: [
      'Rate limiting per client at the edge, before the request costs you anything',
      'A WAF with bot detection and challenge pages',
      'Caching, so repeated expensive requests are answered from memory',
      'Autoscaling with a ceiling, so you degrade rather than collapse',
    ],
    rpsPerIntensity: 1800,
    osi: 7,
  },
  'sql-injection': {
    label: 'SQL injection',
    goal: 'Read, modify or destroy database contents by smuggling SQL through an input field.',
    how: 'User input is concatenated into a query string, so input that contains SQL syntax becomes part of the query. The classic payload closes the intended string and appends its own clause. The root cause is always string concatenation, never the input itself.',
    defences: [
      'Parameterised queries — the actual fix, and the only complete one',
      'A WAF to catch known payload shapes while you fix the code',
      'Least-privilege database credentials so a successful injection reads less',
      'Input validation as defence in depth, never as the primary control',
    ],
    rpsPerIntensity: 15,
    osi: 7,
  },
  xss: {
    label: 'Cross-site scripting',
    goal: 'Run attacker JavaScript in another user\'s browser, in your origin\'s security context.',
    how: 'Untrusted content is rendered into a page without escaping, so a script tag or event handler executes with the victim\'s session. From there the attacker can read the DOM, make authenticated requests, and exfiltrate anything the user can see.',
    defences: [
      'Context-aware output encoding, which modern frameworks do by default',
      'A strict Content-Security-Policy so injected scripts cannot execute',
      'HttpOnly and SameSite cookies so session tokens are not readable',
      'A WAF for known payload patterns',
    ],
    rpsPerIntensity: 12,
    osi: 7,
  },
  'credential-stuffing': {
    label: 'Credential stuffing',
    goal: 'Take over accounts using username and password pairs leaked from other breaches.',
    how: 'Attackers replay billions of known credential pairs against your login endpoint, distributed across many addresses to evade simple rate limits. Because people reuse passwords, a small percentage always works — and every one that does is a real account takeover.',
    defences: [
      'Multi-factor authentication, which defeats this almost entirely',
      'Rate limiting and progressive delays on the login endpoint',
      'Bot detection and device fingerprinting at the edge',
      'Checking submitted passwords against known-breached lists',
    ],
    rpsPerIntensity: 400,
    osi: 7,
  },
  'lateral-movement': {
    label: 'Lateral movement',
    goal: 'Turn one compromised workload into access to everything else.',
    how: 'Having landed on one host or container, the attacker looks for what it can reach: other services on the flat network, credentials on disk or in the environment, the instance metadata endpoint, a Kubernetes service account token. In a network with no segmentation, one foothold is effectively total access.',
    defences: [
      'Network segmentation — security groups, NSGs, NetworkPolicies — so a Pod reaches only what it needs',
      'Least-privilege IAM, so stolen credentials unlock very little',
      'Private subnets with no path to or from the internet',
      'Short-lived credentials that expire before they can be used elsewhere',
    ],
    rpsPerIntensity: 6,
    osi: 4,
  },
  'data-exfiltration': {
    label: 'Data exfiltration',
    goal: 'Copy your data out without anyone noticing.',
    how: 'After gaining read access, the attacker moves data outward — to their own object storage, to a DNS tunnel, to any endpoint your egress rules permit. Most networks control inbound traffic carefully and allow outbound to anywhere, which is precisely what makes this step easy.',
    defences: [
      'Egress filtering, so workloads can only reach approved destinations',
      'Private endpoints with restrictive policies, so storage access cannot be redirected',
      'Encryption with customer-managed keys, so stolen data is useless without the key',
      'Flow logs and anomaly detection on outbound volume',
    ],
    rpsPerIntensity: 8,
    osi: 7,
  },
  ransomware: {
    label: 'Ransomware',
    goal: 'Encrypt or delete your data and backups, then charge you for the key.',
    how: 'Modern campaigns dwell for weeks first, quietly locating and destroying backups, because a restorable victim does not pay. Only then do they encrypt. Whether you recover depends entirely on decisions you made long before the attack — immutable backups, versioning, separate credentials for the backup account.',
    defences: [
      'Immutable, versioned backups that even an administrator cannot delete',
      'Backups in a separate account or subscription with separate credentials',
      'Retention longer than a typical dwell time, so some backup predates the compromise',
      'A restore you have actually practised, with a measured recovery time',
    ],
    rpsPerIntensity: 4,
    osi: 7,
  },
  'supply-chain': {
    label: 'Supply chain compromise',
    goal: 'Get malicious code into your build so it ships to production with your signature on it.',
    how: 'A dependency, a base image, or a build tool is compromised upstream. Your pipeline pulls it, builds it, signs it and deploys it. Nothing in your own repository looks wrong, which is what makes this class so effective.',
    defences: [
      'Pin dependencies and images by digest, never by mutable tag',
      'Scan images and dependencies, and act on the findings',
      'A minimal pipeline identity, so a compromised build cannot reach production directly',
      'Generate and verify provenance for build artefacts',
    ],
    rpsPerIntensity: 3,
    osi: 7,
  },
  ssrf: {
    label: 'Server-side request forgery',
    goal: 'Make your server fetch a URL the attacker chooses, reaching things they cannot.',
    how: 'An endpoint that fetches a user-supplied URL — a webhook, an image importer, a PDF renderer — is pointed at an internal address instead. The classic target is the cloud instance metadata endpoint, which will hand over the machine\'s IAM credentials to anything on the host that asks.',
    defences: [
      'Require IMDSv2 or the equivalent, so a simple proxied GET cannot read credentials',
      'Allow-list destination hosts rather than blocking known-bad ones',
      'Egress rules that stop workloads reaching internal address ranges',
      'Resolve and validate the address after redirects, not just the original URL',
    ],
    rpsPerIntensity: 10,
    osi: 7,
  },
  'privilege-escalation': {
    label: 'Privilege escalation',
    goal: 'Turn limited access into administrative access.',
    how: 'The attacker chains permissions that each look harmless: the ability to pass a role to a service they can launch, to update a function\'s code, to create an access key for another principal. Cloud privilege escalation is usually a permissions puzzle rather than a software exploit.',
    defences: [
      'Least privilege, especially around PassRole and identity-management actions',
      'Permission boundaries and service control policies as a hard ceiling',
      'Separate roles for humans and workloads',
      'Automated analysis of who can reach what, including through chains',
    ],
    rpsPerIntensity: 5,
    osi: 7,
  },
  'dns-hijack': {
    label: 'DNS hijacking',
    goal: 'Send your users somewhere else entirely, before they ever reach your infrastructure.',
    how: 'Either the registrar account is compromised and records are changed, or a dangling record pointing at a released cloud resource is claimed by someone else. In both cases the attacker serves traffic from your domain name, with a valid certificate they obtained themselves.',
    defences: [
      'Registrar lock and multi-factor authentication on the registrar account',
      'DNSSEC so tampered responses are detectable',
      'Delete DNS records when you delete the resource behind them',
      'Certificate transparency monitoring to catch certificates you did not request',
    ],
    rpsPerIntensity: 20,
    osi: 7,
  },
  'port-scan': {
    label: 'Reconnaissance',
    goal: 'Map what you have exposed, to find the weakest thing to attack.',
    how: 'Automated scanners continuously sweep cloud address ranges for open ports, known service banners and default credentials. This is not targeted — new public endpoints are typically probed within minutes of appearing.',
    defences: [
      'Do not expose management ports at all; use Session Manager, IAP or Bastion',
      'Default-deny firewall rules with narrow, explicit allows',
      'Private subnets and private endpoints wherever possible',
      'Alerting on unexpected listening ports and new public resources',
    ],
    rpsPerIntensity: 60,
    osi: 4,
  },
}

export interface AttackResult {
  /** Extra hostile requests per second arriving at each node. */
  attackDemand: Map<string, number>
  /** Residual attack pressure 0..1 that reached each node. */
  pressure: Map<string, number>
  /** Share of each edge's traffic that is hostile, 0..1. */
  edgeAttackShare: Map<string, number>
  /** Nodes that were successfully attacked, and by what. */
  breaches: { nodeId: string; vector: AttackVector; pressure: number }[]
  /** Controls that blunted each attack, for the after-action explanation. */
  mitigatedBy: { nodeId: string; vector: AttackVector; effectiveness: number }[]
}

/**
 * Mitigation earned by how a resource is *configured*, not just by what it is.
 *
 * This is what makes the security tab respond to the player's actual choices:
 * turning on versioning visibly reduces ransomware pressure, requiring IMDSv2
 * visibly reduces SSRF pressure, and so on. Values combine multiplicatively
 * with everything else, so no single setting is ever a complete answer.
 */
const PROP_MITIGATIONS: {
  when: (props: PropBag) => boolean
  vectors: Partial<Record<AttackVector, number>>
}[] = [
  // Recovery posture — the thing that decides whether ransomware is survivable.
  { when: (p) => Number(p.backupRetention ?? 0) >= 30, vectors: { ransomware: 0.45 } },
  { when: (p) => Number(p.backupRetention ?? 0) >= 7 && Number(p.backupRetention ?? 0) < 30, vectors: { ransomware: 0.2 } },
  { when: (p) => p.versioning === true || p.softDelete === true || p.pitr === true, vectors: { ransomware: 0.5 } },
  { when: (p) => p.retentionLock === true, vectors: { ransomware: 0.75 } },
  { when: (p) => p.deletionProtection === true, vectors: { ransomware: 0.3 } },

  // Key ownership — revocable encryption turns stolen data into ciphertext.
  { when: (p) => p.encryption === 'cmk', vectors: { 'data-exfiltration': 0.5, ransomware: 0.15 } },

  // Exposure.
  { when: (p) => p.publicAccess === false, vectors: { 'port-scan': 0.5, 'credential-stuffing': 0.3 } },
  { when: (p) => p.privateEndpoint === true || p.privateEndpointPolicy === true, vectors: { 'credential-stuffing': 0.35, 'data-exfiltration': 0.3 } },
  { when: (p) => p.imdsv2 === true, vectors: { ssrf: 0.7, 'privilege-escalation': 0.3 } },
  { when: (p) => p.publicIp === false || p.externalIp === false, vectors: { 'port-scan': 0.4, 'lateral-movement': 0.2 } },

  // Egress control — the half of segmentation almost nobody configures.
  { when: (p) => p.egressControl === true || p.denyAllOutbound === true || p.egressDeny === true,
    vectors: { 'data-exfiltration': 0.6, 'lateral-movement': 0.3 } },

  // Identity posture.
  { when: (p) => p.scope === 'scoped' || p.bindingLevel === 'resource',
    vectors: { 'privilege-escalation': 0.35, 'lateral-movement': 0.25, ransomware: 0.2 } },
  { when: (p) => p.conditions === true, vectors: { 'privilege-escalation': 0.3, 'credential-stuffing': 0.3 } },
  { when: (p) => p.rotation === true, vectors: { 'credential-stuffing': 0.35 } },
  { when: (p) => p.rbac === 'scoped', vectors: { 'privilege-escalation': 0.35, 'lateral-movement': 0.3 } },
  { when: (p) => p.keyType === 'workload-identity' || p.keyType === 'attached', vectors: { 'credential-stuffing': 0.4 } },
  { when: (p) => p.runAsNonRoot === true, vectors: { 'privilege-escalation': 0.3, 'lateral-movement': 0.2 } },

  // Supply chain.
  { when: (p) => p.immutableTags === true, vectors: { 'supply-chain': 0.35 } },
  { when: (p) => p.scanOnPush === true, vectors: { 'supply-chain': 0.3 } },

  // A rate-based rule is the single most effective thing you can do about an
  // application-layer flood or a credential-stuffing run.
  { when: (p) => Number(p.rateLimit ?? Infinity) <= 3000,
    vectors: { 'app-ddos': 0.7, 'credential-stuffing': 0.5 } },
  { when: (p) => p.rateLimit === true,
    vectors: { 'app-ddos': 0.5, 'credential-stuffing': 0.35 } },
]

/**
 * Where network-layer floods actually land. A volumetric attack saturates the
 * edge — it never turns into database queries, because no request is ever
 * completed. Only layer 7 attacks consume capacity all the way down the stack.
 */
const ABSORBS_NETWORK_FLOOD = new Set([
  'internet', 'internet-gateway', 'cdn', 'waf', 'ddos-shield', 'nat', 'firewall',
  'load-balancer-l7', 'load-balancer-l4', 'api-gateway', 'k8s-ingress', 'dns-zone',
])

/** Controls that protect whatever they are attached to, from every direction. */
const PROTECTIVE_ARCHETYPES = new Set(['waf', 'firewall', 'ddos-shield', 'private-link', 'cdn', 'api-gateway'])

function applyPropMitigations(props: PropBag, vector: AttackVector, remaining: number): number {
  let out = remaining
  for (const rule of PROP_MITIGATIONS) {
    if (!rule.when(props)) continue
    const value = rule.vectors[vector]
    if (value) out *= 1 - value
  }
  return out
}

/**
 * Everything that blunts `vector` before it reaches `nodeId`:
 * the resource itself, how it is configured, controls attached to it, and
 * controls placed in the same container.
 *
 * Note that a control attached to a node protects it against *every* inbound
 * path, not only paths that happen to route through the control — which is how
 * a WAF association or a security group actually behaves.
 */
function effectiveMitigation(
  nodeId: string,
  vector: AttackVector,
  topo: Topology,
  propsOf: Map<string, PropBag>,
): number {
  let remaining = 1

  const applyNode = (id: string) => {
    const def = topo.defs.get(id)
    if (!def) return
    const mitigation = def.sim?.mitigates?.[vector]
    if (mitigation) remaining *= 1 - mitigation
    const props = propsOf.get(id)
    if (props) remaining = applyPropMitigations(props, vector, remaining)
  }

  applyNode(nodeId)

  // Walk upstream through the chain of controls. Traffic arriving at an origin
  // behind a CDN behind a WAF has passed through both, so both count.
  const seen = new Set<string>([nodeId])
  const queue: string[] = [nodeId]
  while (queue.length) {
    const current = queue.shift()!
    for (const edge of topo.allIn.get(current) ?? []) {
      if (seen.has(edge.source)) continue
      const sourceDef = topo.defs.get(edge.source)
      if (!sourceDef) continue

      // Identity, secrets and keys bound to a workload protect that workload.
      if (current === nodeId && ['identity', 'secret', 'key'].includes(edge.flow)) {
        seen.add(edge.source)
        applyNode(edge.source)
        continue
      }
      if (!PROTECTIVE_ARCHETYPES.has(sourceDef.archetype)) continue
      seen.add(edge.source)
      applyNode(edge.source)
      queue.push(edge.source)
    }
  }

  // A control inside the same container covers its siblings — a NetworkPolicy
  // in a cluster, a security group in a VPC.
  const parent = topo.parentOf.get(nodeId)
  if (parent) {
    for (const siblingId of topo.children.get(parent) ?? []) {
      if (siblingId === nodeId) continue
      const sibling = topo.defs.get(siblingId)
      if (sibling && PROTECTIVE_ARCHETYPES.has(sibling.archetype)) applyNode(siblingId)
    }
  }

  return 1 - remaining
}

/** Does this attack succeed against this node at this residual pressure? */
const BREACH_THRESHOLD = 0.22

export function evaluateAttacks(graph: SimGraph, topo: Topology): AttackResult {
  const attackDemand = new Map<string, number>()
  const pressure = new Map<string, number>()
  const edgeAttackShare = new Map<string, number>()
  const breaches: AttackResult['breaches'] = []
  const mitigatedBy: AttackResult['mitigatedBy'] = []

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
  const propsOf = new Map(graph.nodes.map((n) => [n.id, n.props]))

  for (const attackerId of topo.attackers) {
    const attacker = nodeById.get(attackerId)
    if (!attacker) continue
    const vector = String(attacker.props.vector ?? 'app-ddos') as AttackVector
    const intensity = Number(attacker.props.intensity ?? 3)
    const meta = ATTACK_META[vector]
    if (!meta) continue

    const baseRps = meta.rpsPerIntensity * intensity
    // Breadth-first walk so each node is reached at its strongest pressure.
    const queue: { id: string; p: number; depth: number }[] = [{ id: attackerId, p: 1, depth: 0 }]
    const best = new Map<string, number>([[attackerId, 1]])

    while (queue.length) {
      const cur = queue.shift()!
      if (cur.depth > 24) continue

      for (const edge of topo.out.get(cur.id) ?? []) {
        const mitigation = effectiveMitigation(edge.target, vector, topo, propsOf)
        if (mitigation > 0.01) {
          mitigatedBy.push({ nodeId: edge.target, vector, effectiveness: mitigation })
        }
        const next = cur.p * (1 - mitigation)
        const prior = best.get(edge.target) ?? 0
        edgeAttackShare.set(edge.id, Math.max(edgeAttackShare.get(edge.id) ?? 0, cur.p))
        if (next <= prior + 1e-4) continue
        best.set(edge.target, next)
        queue.push({ id: edge.target, p: next, depth: cur.depth + 1 })
      }
    }

    for (const [nodeId, p] of best) {
      if (nodeId === attackerId) continue
      pressure.set(nodeId, Math.max(pressure.get(nodeId) ?? 0, p))

      const def = topo.defs.get(nodeId)
      // Reachability always propagates; consumed capacity does not.
      const landsHere = meta.osi === 7 || (def ? ABSORBS_NETWORK_FLOOD.has(def.archetype) : false)
      if (landsHere) attackDemand.set(nodeId, (attackDemand.get(nodeId) ?? 0) + baseRps * p)
      const vulnerable = def?.sim?.vulnerableTo?.includes(vector)
      if (vulnerable && p >= BREACH_THRESHOLD) {
        breaches.push({ nodeId, vector, pressure: p })
      }
    }
  }

  return { attackDemand, pressure, edgeAttackShare, breaches, mitigatedBy }
}
