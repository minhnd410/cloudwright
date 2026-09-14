import type { ResourceDef } from '../../schema/types'
import { inPort, outPort } from '../../schema/presets'

const client: ResourceDef = {
  id: 'core.client',
  provider: 'core',
  name: 'Users',
  short: 'Users',
  archetype: 'client',
  category: 'traffic',
  icon: 'users',
  tagline: 'Real people generating real requests',
  description:
    'The source of all legitimate traffic. Browsers and mobile apps resolve a name through DNS, open a TLS connection, and send requests. Everything downstream exists to answer them — so every metric that matters is ultimately measured here, at the edge closest to the user.',
  ports: [outPort('out', 'Requests', ['http', 'dns'])],
  props: [
    {
      key: 'rps',
      label: 'Baseline traffic',
      type: 'number',
      default: 200,
      min: 0,
      max: 200000,
      step: 50,
      unit: ' req/s',
      help: 'Steady-state requests per second arriving from this audience.',
      impact:
        'Drives every downstream meter. Raise it past what your compute tier can absorb and you will watch queues build, latency climb, and 5xx errors appear — in that order, which is exactly the order they appear in production.',
      affects: ['capacity', 'latency'],
    },
    {
      key: 'pattern',
      label: 'Traffic pattern',
      type: 'select',
      default: 'steady',
      help: 'The shape of demand over time.',
      impact:
        'Steady traffic is easy. Diurnal waves let autoscaling keep up. A flash spike arrives faster than instances can boot, which is precisely when you find out whether you had headroom or just hope.',
      affects: ['capacity', 'latency'],
      options: [
        { value: 'steady', label: 'Steady', note: 'Flat load, the easy case' },
        { value: 'diurnal', label: 'Daily wave', note: 'Predictable peak and trough' },
        { value: 'spiky', label: 'Flash spike', note: 'A campaign or a front-page link' },
        { value: 'thundering', label: 'Thundering herd', note: 'Everyone retries at once' },
      ],
    },
    {
      key: 'region',
      label: 'Audience location',
      type: 'select',
      default: 'same',
      help: 'Where these users are relative to your infrastructure.',
      impact:
        'Distance is latency you cannot optimise away — light in fibre crosses an ocean in roughly 70ms each way, before any of your code runs. A CDN is the only real answer.',
      affects: ['latency'],
      options: [
        { value: 'same', label: 'Same region', note: '~5ms network' },
        { value: 'continent', label: 'Same continent', note: '~35ms network' },
        { value: 'global', label: 'Worldwide', note: '~140ms without a CDN' },
      ],
    },
  ],
  sim: { latencyMs: 0 },
  concepts: ['dns-resolution', 'latency-budget', 'tcp-handshake'],
  keywords: ['user', 'browser', 'mobile', 'traffic', 'load'],
}

const internet: ResourceDef = {
  id: 'core.internet',
  provider: 'core',
  name: 'Public Internet',
  short: 'Internet',
  archetype: 'internet',
  category: 'traffic',
  icon: 'globe',
  tagline: 'The untrusted network boundary',
  description:
    'The boundary between what you control and what you do not. Anything reachable from here is reachable by every scanner on earth — new public endpoints are typically discovered and probed within minutes of going live. Treat every packet crossing this line as hostile until something has checked it.',
  ports: [
    inPort('in', 'Egress', ['http', 'tcp', 'udp']),
    outPort('out', 'Ingress', ['http', 'tcp', 'udp', 'dns']),
  ],
  sim: {
    latencyMs: 12,
    vulnerableTo: ['volumetric-ddos', 'app-ddos', 'port-scan'],
  },
  concepts: ['trust-boundary', 'osi-model', 'bgp'],
  keywords: ['wan', 'public', 'external', 'edge'],
}

const attacker: ResourceDef = {
  id: 'core.attacker',
  provider: 'core',
  name: 'Threat Actor',
  short: 'Attacker',
  archetype: 'attacker',
  category: 'security',
  icon: 'skull',
  tagline: 'Adversarial traffic with a goal',
  description:
    'An adversary probing your architecture. Attacks in Cloudwright are not random damage: each vector follows a path through your graph and is stopped — or not — by the controls it meets on the way. If nothing on the path mitigates it, it reaches its target and you get to read the incident report.',
  ports: [outPort('out', 'Attack traffic', ['http', 'tcp', 'udp'])],
  props: [
    {
      key: 'vector',
      label: 'Attack vector',
      type: 'select',
      default: 'app-ddos',
      help: 'The technique this adversary uses.',
      impact:
        'Each vector is blunted by different controls. A volumetric flood is absorbed at the network edge; SQL injection is stopped by a WAF and by parameterised queries; lateral movement is contained by network segmentation and least-privilege IAM. Defence in depth exists because no single control covers them all.',
      affects: ['security'],
      options: [
        { value: 'volumetric-ddos', label: 'Volumetric DDoS (L3/L4)', note: 'Saturate the pipe with packets' },
        { value: 'app-ddos', label: 'Application DDoS (L7)', note: 'Expensive requests, few packets' },
        { value: 'sql-injection', label: 'SQL injection', note: 'Hostile input reaching the query' },
        { value: 'credential-stuffing', label: 'Credential stuffing', note: 'Breached passwords, replayed' },
        { value: 'lateral-movement', label: 'Lateral movement', note: 'One foothold, then everything' },
        { value: 'data-exfiltration', label: 'Data exfiltration', note: 'Quietly copying data out' },
        { value: 'ransomware', label: 'Ransomware', note: 'Encrypt, then extort' },
        { value: 'ssrf', label: 'SSRF', note: 'Make the server fetch what you cannot' },
        { value: 'port-scan', label: 'Reconnaissance scan', note: 'Mapping what you left open' },
      ],
    },
    {
      key: 'intensity',
      label: 'Intensity',
      type: 'number',
      default: 3,
      min: 1,
      max: 10,
      help: 'How determined and well-resourced the adversary is.',
      impact:
        'High intensity overwhelms partial mitigations. A control rated 80% effective still lets a fifth of a very large attack through, and a fifth of enormous is still enormous.',
      affects: ['security'],
    },
  ],
  sim: {},
  concepts: ['defence-in-depth', 'blast-radius', 'zero-trust'],
  keywords: ['hacker', 'adversary', 'red team', 'threat'],
}

const thirdParty: ResourceDef = {
  id: 'core.third-party',
  provider: 'core',
  name: 'Third-Party API',
  short: '3rd Party',
  archetype: 'container-service',
  category: 'traffic',
  icon: 'plug',
  tagline: 'A dependency you do not operate',
  description:
    'A payment processor, an auth provider, a mapping service — something critical that is entirely outside your control. You cannot fix it, scale it, or page anyone about it. The only things you own are the timeout, the retry policy, and the circuit breaker that stops its bad day from becoming yours.',
  ports: [inPort('in', 'API calls', ['http', 'grpc'])],
  props: [
    {
      key: 'slo',
      label: 'Published availability',
      type: 'select',
      default: '99.9',
      help: 'The availability the vendor promises in their SLA.',
      impact:
        'Your availability can never exceed the product of every hard dependency. Three dependencies at 99.9% each cap you at 99.7% before your own code fails once.',
      affects: ['availability'],
      options: [
        { value: '99.99', label: '99.99%', note: '~4 minutes down per month' },
        { value: '99.9', label: '99.9%', note: '~43 minutes down per month' },
        { value: '99.5', label: '99.5%', note: '~3.6 hours down per month' },
      ],
    },
    {
      key: 'timeoutMs',
      label: 'Client timeout',
      type: 'number',
      default: 3000,
      min: 100,
      max: 60000,
      step: 100,
      unit: 'ms',
      help: 'How long your code waits before giving up on a call.',
      impact:
        'This is the single most important number in the whole integration. A long timeout means every one of your threads sits blocked when the vendor stalls, and their outage becomes your outage within seconds. A short timeout with a fallback keeps you serving.',
      affects: ['latency', 'availability'],
      danger: (v) =>
        Number(v) > 10000
          ? 'A timeout this long lets a slow dependency exhaust your connection pool and take the whole service down with it.'
          : null,
    },
    {
      key: 'circuitBreaker',
      label: 'Circuit breaker',
      type: 'boolean',
      default: false,
      help: 'Stops calling a dependency that is clearly failing, and periodically tests whether it has recovered.',
      impact:
        'Converts a cascading failure into a degraded feature. Instead of every request waiting for a timeout, calls fail instantly and your fallback path runs — and you stop hammering a service that is already struggling.',
      affects: ['availability', 'latency'],
    },
  ],
  sim: { latencyMs: 120, availability: 0.999 },
  setup: {
    gotchas: [
      'Your availability is the product of every hard dependency. Make dependencies soft wherever the product allows it.',
      'Retries without jitter and a cap turn a brief vendor blip into a self-inflicted stampede.',
      'Set a timeout shorter than your own SLO budget. An unbounded client call is an unbounded outage.',
    ],
  },
  concepts: ['circuit-breaker', 'timeouts-retries', 'availability-math'],
  keywords: ['vendor', 'saas', 'external', 'integration', 'stripe', 'auth0'],
}

export const coreResources: ResourceDef[] = [client, internet, attacker, thirdParty]
