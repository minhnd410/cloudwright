import { getResource } from '@/catalog/registry'
import type { Archetype } from '@/catalog/schema/types'
import { diagram } from './builder'
import type { Mission, MissionContext } from './types'

const archetypeOf = (defId: string): Archetype | undefined => getResource(defId)?.archetype

/**
 * Telemetry, image and deploy edges do not carry traffic, so `reaches` — which
 * follows the request path — cannot see them. These walk the edges directly.
 */
function linked(c: MissionContext, from: Archetype, to: Archetype[]): boolean {
  const targets = new Set(
    c.graph.nodes.filter((n) => to.includes(archetypeOf(n.defId) as Archetype)).map((n) => n.id),
  )
  if (targets.size === 0) return false
  return c.graph.nodes
    .filter((n) => archetypeOf(n.defId) === from)
    .some((n) => c.graph.edges.some((e) => e.source === n.id && targets.has(e.target)))
}

const sendsTelemetry = (c: MissionContext, from: Archetype) =>
  linked(c, from, ['monitoring', 'logging', 'tracing', 'alerting'])

const firstContact: Mission = {
  id: 'first-contact',
  title: 'First Contact',
  tagline: 'Get a single request from a user to your code, and watch it move.',
  difficulty: 'intro',
  track: 'foundations',
  minutes: 5,
  brief: [
    'Nothing exists yet. Your job is the smallest possible thing that works: take a request from a real user and have something answer it.',
    'Drag resources from the palette on the left, then drag from a handle on one node to a handle on another to connect them. Cloudwright will refuse connections that make no sense in reality — and tell you why, which is the point.',
    'When the shape is right, press play in the toolbar and watch the packets move.',
  ],
  objectives: [
    {
      id: 'users',
      label: 'Put some Users on the canvas',
      check: (c) => c.has('client'),
      hint: 'Users are in the Traffic & Actors group at the top of the palette.',
    },
    {
      id: 'compute',
      label: 'Add something that can run your code',
      check: (c) => c.has('vm') || c.has('container-service') || c.has('serverless-function') || c.has('k8s-workload'),
      hint: 'An EC2 instance, ECS on Fargate, Cloud Run or a Lambda function will all do.',
    },
    {
      id: 'lb',
      label: 'Put a load balancer in front of the compute',
      check: (c) => c.has('load-balancer-l7') || c.has('api-gateway') || c.has('k8s-ingress'),
      hint: 'Traffic should never hit a single instance directly. An Application Load Balancer gives you health checks and a stable address.',
    },
    {
      id: 'path',
      label: 'Connect Users all the way through to the compute',
      check: (c) => c.reaches('client', 'vm') || c.reaches('client', 'container-service') || c.reaches('client', 'serverless-function'),
      hint: 'Drag from the Users output handle to the load balancer input, then from the load balancer to your compute.',
    },
    {
      id: 'serving',
      label: 'Run the simulation and serve traffic without errors',
      check: (c) => c.ranFor(3) && c.metric('totalServed') > 0 && c.metric('errorRate') < 0.02,
      hint: 'Press play. If requests are failing, your compute cannot keep up — raise the instance count or the size.',
    },
  ],
  hints: [
    'Start with Users, then an Application Load Balancer, then an EC2 instance. Connect them left to right.',
    'Handles are the small circles on the edge of each node. Drag from an output (right side) to an input (left side).',
    'If a connection is refused, read the explanation — it is describing something real about how cloud services work.',
  ],
  debrief: [
    'That is the core shape of almost every web system: a client, something that distributes requests, and something that answers them.',
    'The load balancer is doing more than sharing load. It health-checks each target and removes any that stop answering, which is what turns a group of servers into a service.',
    'Everything else you will build is this shape with more layers: a CDN in front, a database behind, and controls around it.',
  ],
  concepts: ['load-balancing', 'osi-model', 'compute-models'],
}

const singlePoint: Mission = {
  id: 'single-point',
  title: 'The Single Point',
  tagline: 'One instance, one zone, one database. Find all three problems.',
  difficulty: 'easy',
  track: 'reliability',
  requires: 'first-contact',
  minutes: 10,
  brief: [
    'You have inherited a system that works fine right up until it does not. Every deploy causes a visible outage, and last month a datacentre issue took the whole thing down for two hours.',
    'The architecture is already on the canvas. Nothing about it is unusual — this is what a first production system looks like almost everywhere.',
    'Find the single points of failure and remove them. The Review panel on the right will tell you what a senior engineer would say about it.',
  ],
  start: diagram('The Single Point', [
    { id: 'users', def: 'core.client', at: [-380, 120], props: { rps: 600 } },
    { id: 'net', def: 'core.internet', at: [-180, 120] },
    { id: 'vpc', def: 'aws.vpc', at: [40, -40], size: [660, 400] },
    { id: 'pub', def: 'aws.subnet', at: [30, 60], size: [260, 200], in: 'vpc', props: { tier: 'public', cidr: '10.0.0.0/20', az: 'a' }, label: 'Public 1a' },
    { id: 'priv', def: 'aws.subnet', at: [330, 60], size: [280, 200], in: 'vpc', props: { tier: 'private', cidr: '10.0.64.0/20', az: 'a' }, label: 'Private 1a' },
    { id: 'alb', def: 'aws.alb', at: [30, 60], in: 'pub' },
    { id: 'app', def: 'aws.ec2', at: [30, 30], in: 'priv', props: { replicas: 1, size: 'm5.large', autoscale: false } },
    { id: 'db', def: 'aws.rds', at: [760, 180], props: { multiAz: false, backupRetention: 0, size: 'db.m5.large' } },
  ], [
    ['users', 'out', 'net', 'in'],
    ['net', 'out', 'alb', 'in'],
    ['alb', 'out', 'app', 'in'],
    ['app', 'out', 'db', 'in'],
  ]),
  objectives: [
    {
      id: 'replicas',
      label: 'Run more than one application instance',
      check: (c) => c.every('vm', (p) => Number(p.replicas ?? 1) >= 2),
      hint: 'Select the EC2 node and raise "Instances". One means every restart is an outage.',
    },
    {
      id: 'multi-az',
      label: 'Make the database survive losing an availability zone',
      check: (c) => c.prop('relational-db', 'multiAz', true),
      hint: 'Turn on Multi-AZ on the database. It roughly doubles the cost and removes a whole class of outage.',
    },
    {
      id: 'backups',
      label: 'Give the database a recovery point',
      check: (c) => c.every('relational-db', (p) => Number(p.backupRetention ?? 0) >= 7),
      hint: 'Backup retention is at zero. A bad migration right now is unrecoverable.',
    },
    {
      id: 'zones',
      label: 'Add a subnet in a second availability zone',
      check: (c) => {
        const zones = new Set(
          c.graph.nodes
            .filter((n) => n.defId === 'aws.subnet')
            .map((n) => String(n.props.az ?? 'a')),
        )
        return zones.size >= 2
      },
      hint: 'Drag another Subnet into the VPC and set its availability zone to something other than 1a.',
    },
    {
      id: 'no-spof',
      label: 'Clear every high-severity reliability finding',
      check: (c) => c.noFinding((f) => f.pillar === 'reliability' && (f.severity === 'critical' || f.severity === 'high')),
      hint: 'Check the Review panel. Each finding explains itself and names the fix.',
    },
  ],
  hints: [
    'Work through the Review panel from the top. It is sorted by severity for a reason.',
    'Redundancy is only real if the copies fail independently — three instances in one zone are not redundant against losing that zone.',
    'A Multi-AZ standby is not a read replica. It serves no traffic; it exists purely so failover is automatic.',
  ],
  debrief: [
    'Going from one instance to two is the single largest availability improvement available anywhere in an architecture. Everything after that is headroom.',
    'The other half is independence. Replicas that share a zone, a node or a deployment are one failure, not several — which is why zone spreading and anti-affinity exist.',
    'And backups are not for hardware failure; the provider handles that. They are for the bad migration, the wrong DELETE, and the ransomware.',
  ],
  concepts: ['redundancy', 'availability-zones', 'availability-math', 'rpo-rto'],
}

const blackFriday: Mission = {
  id: 'black-friday',
  title: 'Black Friday',
  tagline: 'Twenty times the traffic arrives in four minutes. Keep serving.',
  difficulty: 'medium',
  track: 'reliability',
  requires: 'single-point',
  minutes: 15,
  brief: [
    'Marketing has bought a television spot. It airs in two hours and they expect roughly twenty times normal traffic, arriving in a spike rather than a ramp.',
    'Your current architecture handles normal load comfortably. Press play and watch what happens when the spike lands — then fix the shape, not just the size.',
    'Finance have set a ceiling: this must cost under $4,500 a month. Serving a worldwide audience through an edge network is not cheap, so there is no room left for over-provisioning — scaling everything up until it works will not fit.',
  ],
  start: diagram('Black Friday', [
    { id: 'users', def: 'core.client', at: [-400, 140], props: { rps: 900, pattern: 'spiky', region: 'global' } },
    { id: 'net', def: 'core.internet', at: [-190, 140] },
    { id: 'alb', def: 'aws.alb', at: [40, 140] },
    { id: 'app', def: 'aws.ec2', at: [290, 140], props: { replicas: 3, size: 'm5.large', autoscale: false } },
    { id: 'db', def: 'aws.rds', at: [560, 140], props: { multiAz: true, size: 'db.m5.large', backupRetention: 7 } },
  ], [
    ['users', 'out', 'net', 'in'],
    ['net', 'out', 'alb', 'in'],
    ['alb', 'out', 'app', 'in'],
    ['app', 'out', 'db', 'in'],
  ]),
  objectives: [
    {
      id: 'cdn',
      label: 'Serve users through a CDN',
      check: (c) => c.has('cdn') || c.prop('load-balancer-l7', 'cdn', true),
      hint: 'Your audience is worldwide and the origin is in one region. A CDN answers most requests without ever reaching you.',
    },
    {
      id: 'cache',
      label: 'Put a cache between the application and the database',
      check: (c) => c.has('cache') && c.reaches('vm', 'cache'),
      hint: 'The database is the bottleneck. A cache absorbs most reads before they get there.',
    },
    {
      id: 'autoscale',
      label: 'Turn on autoscaling for the application tier',
      check: (c) => c.some('vm', (p) => p.autoscale === true) || c.has('autoscaler'),
      hint: 'Autoscaling will not save you from a spike on its own — but combined with the cache and CDN, it handles what gets through.',
    },
    {
      id: 'survive',
      label: 'Hold the error rate under 2% through the spike',
      sustained: true,
      check: (c) => c.ranFor(30) && c.metric('errorRate') < 0.02,
      hint: 'Let it run for a while — the spike pattern comes in waves. If errors appear, look at which node is saturated.',
    },
    {
      id: 'budget',
      label: 'Stay under $4,500 per month',
      check: (c) => c.metric('costPerMonth') > 0 && c.metric('costPerMonth') < 4500,
      hint: 'Check the cost readout in the toolbar. Most of it is edge delivery, which leaves very little headroom for an oversized compute or database tier. Caching is far cheaper than either.',
    },
  ],
  hints: [
    'Press play first and watch where the red appears. That node is your bottleneck, and it is the only one worth spending money on.',
    'Scaling a tier that is not the bottleneck changes nothing except the bill. Try it and watch the error rate stay exactly where it was.',
    'A CDN with a high cache hit ratio means your origin sees a fraction of the traffic. That is cheaper than any amount of compute.',
    'Autoscaling takes minutes to add capacity. A spike arrives in seconds. What bridges the gap is headroom and caching, not autoscaling alone.',
  ],
  debrief: [
    'Throughput is set by the narrowest component. Everything you spend elsewhere is pure cost, and you can watch that happen in the simulation.',
    'The layers that actually absorbed the spike were the ones that avoided work: a CDN answering from the edge, and a cache answering from memory. Autoscaling arrived afterwards to handle the remainder.',
    'This ordering — avoid the work, then cache the work, then scale to do the work — is the right sequence for almost every capacity problem.',
  ],
  concepts: ['capacity-planning', 'caching', 'cdn', 'autoscaling', 'thundering-herd'],
}

const lockedOut: Mission = {
  id: 'locked-out',
  title: 'Exposed',
  tagline: 'A database on the public internet, and someone has already noticed.',
  difficulty: 'medium',
  track: 'security',
  requires: 'first-contact',
  minutes: 15,
  brief: [
    'A security researcher emailed this morning. Your production database answers on a public endpoint, and they were able to enumerate it within minutes of scanning your address range.',
    'There is also a threat actor on the canvas, already probing. Press play to see what currently reaches what.',
    'Close it properly: not just the database, but the whole path an attacker would take.',
  ],
  start: diagram('Exposed', [
    { id: 'users', def: 'core.client', at: [-400, 60], props: { rps: 400 } },
    { id: 'net', def: 'core.internet', at: [-190, 60] },
    { id: 'alb', def: 'aws.alb', at: [40, 60] },
    { id: 'app', def: 'aws.ec2', at: [290, 60], props: { replicas: 2, publicIp: true, imdsv2: false } },
    { id: 'db', def: 'aws.rds', at: [560, 60], props: { publicAccess: true, encryption: 'none', backupRetention: 0 } },
    { id: 'bad', def: 'core.attacker', at: [-400, 300], props: { vector: 'sql-injection', intensity: 6 } },
  ], [
    ['users', 'out', 'net', 'in'],
    ['net', 'out', 'alb', 'in'],
    ['alb', 'out', 'app', 'in'],
    ['app', 'out', 'db', 'in'],
    ['bad', 'out', 'alb', 'in'],
  ]),
  objectives: [
    {
      id: 'db-private',
      label: 'Remove the database\'s public endpoint',
      check: (c) => c.every('relational-db', (p) => p.publicAccess !== true),
      hint: 'Select the database and turn off "Public endpoint". Nothing legitimate needs it.',
    },
    {
      id: 'no-public-ip',
      label: 'Take the public IP off the application instances',
      check: (c) => c.every('vm', (p) => p.publicIp !== true && p.externalIp !== true),
      hint: 'Instances behind a load balancer should have no public address at all.',
    },
    {
      id: 'imds',
      label: 'Require IMDSv2 so an SSRF bug cannot steal instance credentials',
      check: (c) => c.every('vm', (p) => p.imdsv2 !== false),
      hint: 'It is in the advanced settings on the EC2 node. This single flag closes a well-known credential theft path.',
    },
    {
      id: 'waf',
      label: 'Put a WAF in the path and set it to block',
      check: (c) => c.some('waf', (p) => p.mode === 'block') && c.reaches('waf', 'load-balancer-l7'),
      hint: 'Add AWS WAF between the internet and the load balancer, then switch it from count to block.',
    },
    {
      id: 'encrypted',
      label: 'Encrypt the database at rest with a key you control',
      check: (c) => c.every('relational-db', (p) => p.encryption === 'cmk' || p.encryption === 'provider'),
      hint: 'Encryption is currently off entirely. A customer-managed key also gives you an audit trail and instant revocation.',
    },
    {
      id: 'no-breach',
      label: 'Run the simulation with no successful attack',
      check: (c) => c.ranFor(5) && c.metric('compromise') === 0,
      hint: 'Check the Security tab at the bottom. It shows exactly which vector got through and what would have stopped it.',
    },
  ],
  hints: [
    'Work outside in: close the front door, then reduce what is behind it, then reduce what a compromise would reach.',
    'The Security tab in the bottom panel shows residual attack pressure at each node — it is the fastest way to see whether a control is working.',
    'A WAF is a layer, not a fix. It buys you time while the query is parameterised, and it catches the bug you have not found yet.',
  ],
  debrief: [
    'A publicly reachable database is found by automated scanners within minutes, not days. The controls that matter are structural: no public endpoint, no public IP, and a private subnet with no route inward.',
    'IMDSv2 is worth remembering specifically. It is one setting, and it converts "a server-side request forgery bug" into "a server-side request forgery bug that cannot steal your IAM credentials".',
    'Notice that no single control did the job. That is defence in depth working as intended — every layer is individually imperfect and the combination is genuinely hard to beat.',
  ],
  concepts: ['trust-boundary', 'ssrf', 'waf', 'defence-in-depth', 'encryption-at-rest'],
}

const theFlood: Mission = {
  id: 'the-flood',
  title: 'The Flood',
  tagline: 'Two attacks at once, and only one of them is about bandwidth.',
  difficulty: 'medium',
  track: 'security',
  requires: 'locked-out',
  minutes: 15,
  brief: [
    'Your service is under attack from two directions. One is a volumetric flood trying to saturate you with packets. The other is a much smaller stream of expensive requests aimed at your most costly endpoint.',
    'They need completely different defences, and the second one is the one that will actually take you down.',
    'Keep serving legitimate users throughout.',
  ],
  start: diagram('The Flood', [
    { id: 'users', def: 'core.client', at: [-420, 40], props: { rps: 800 } },
    { id: 'net', def: 'core.internet', at: [-200, 40] },
    { id: 'alb', def: 'aws.alb', at: [40, 40] },
    { id: 'app', def: 'aws.ec2', at: [300, 40], props: { replicas: 4, size: 'm5.large', autoscale: true, maxReplicas: 12 } },
    { id: 'db', def: 'aws.rds', at: [560, 40], props: { multiAz: true, backupRetention: 7 } },
    { id: 'flood', def: 'core.attacker', at: [-420, 260], props: { vector: 'volumetric-ddos', intensity: 8 }, label: 'Botnet' },
    { id: 'l7', def: 'core.attacker', at: [-420, 420], props: { vector: 'app-ddos', intensity: 7 }, label: 'L7 flood' },
  ], [
    ['users', 'out', 'net', 'in'],
    ['net', 'out', 'alb', 'in'],
    ['alb', 'out', 'app', 'in'],
    ['app', 'out', 'db', 'in'],
    ['flood', 'out', 'alb', 'in'],
    ['l7', 'out', 'alb', 'in'],
  ]),
  objectives: [
    {
      id: 'cdn',
      label: 'Absorb the volumetric attack at the edge',
      check: (c) => c.has('cdn') && c.reaches('cdn', 'load-balancer-l7'),
      hint: 'A volumetric flood is a capacity contest. Put a CDN in the path so it lands on their network instead of yours.',
    },
    {
      id: 'waf-rate',
      label: 'Add a WAF with a rate-based rule, in block mode',
      check: (c) => c.some('waf', (p) => p.mode === 'block' && Number(p.rateLimit ?? 1e9) <= 5000),
      hint: 'Application floods look like normal traffic in aggregate. A per-client rate limit is the cheapest thing that stops them.',
    },
    {
      id: 'attacks-routed',
      label: 'Route all inbound traffic through your defences',
      check: (c) => c.noFinding((f) => f.id === 'no-waf'),
      hint: 'Both attackers should reach the CDN and WAF before anything else. An origin that is still directly reachable makes the edge pointless.',
    },
    {
      id: 'serving',
      label: 'Keep the error rate under 3% while under attack',
      sustained: true,
      check: (c) => c.ranFor(20) && c.metric('errorRate') < 0.03,
      hint: 'Watch the Security tab: residual pressure should be near zero at your compute tier.',
    },
  ],
  hints: [
    'The two attacks need different layers. The CDN handles volume; the rate limit handles expense.',
    'Rate-based WAF rules are the single highest-value rule you can write. They stop credential stuffing and application floods from one source before either costs you compute.',
    'Neither defence works if the origin is reachable directly. Keep the path narrow.',
  ],
  debrief: [
    'Volumetric attacks are a capacity contest you win by borrowing someone else\'s capacity — which is what a CDN or global edge network is.',
    'Application-layer attacks are the opposite: small volume, high cost per request, invisible to volume-based detection. Rate limiting, caching and bot detection are what work.',
    'And the structural point underneath both: a protected edge is worthless if the origin is publicly reachable. Lock origins to accept only the edge.',
  ],
  concepts: ['ddos-mitigation', 'rate-limiting', 'cdn', 'waf'],
}

const crashLoop: Mission = {
  id: 'crashloop',
  title: 'CrashLoopBackOff',
  tagline: 'The Pods will not stay up, and the probes are making it worse.',
  difficulty: 'medium',
  track: 'kubernetes',
  minutes: 15,
  brief: [
    'A Kubernetes deployment is unstable. Pods restart in a loop, rollouts drop requests, and when the database had a brief blip last week every single replica restarted at once and the outage lasted far longer than the blip did.',
    'The manifest is not unusual. These are the four or five configuration mistakes almost every team makes on their first cluster.',
    'Fix the workload configuration so it is stable, survives a node drain, and does not amplify a downstream failure.',
  ],
  start: diagram('CrashLoopBackOff', [
    { id: 'users', def: 'core.client', at: [-400, 160], props: { rps: 500 } },
    { id: 'net', def: 'core.internet', at: [-200, 160] },
    { id: 'cluster', def: 'k8s.cluster', at: [40, -30], size: [740, 470], props: { rbac: 'cluster-admin', privateEndpoint: false } },
    { id: 'ingress', def: 'k8s.ingress', at: [40, 90], in: 'cluster' },
    { id: 'svc', def: 'k8s.service', at: [250, 90], in: 'cluster' },
    { id: 'pool', def: 'k8s.nodepool', at: [430, 60], size: [280, 300], in: 'cluster', props: { nodeCount: 3, spreadZones: false } },
    { id: 'web', def: 'k8s.deployment', at: [30, 40], in: 'pool', props: {
      replicas: 1, memLimit: 256, memRequest: 256, cpuRequest: 500, cpuLimit: 500,
      livenessProbe: 'deep', readinessProbe: false, pdb: false, antiAffinity: false, runAsNonRoot: false,
    } },
    { id: 'db', def: 'aws.rds', at: [840, 200], props: { multiAz: true, backupRetention: 7 } },
  ], [
    ['users', 'out', 'net', 'in'],
    ['net', 'out', 'ingress', 'in'],
    ['ingress', 'out', 'svc', 'in'],
    ['svc', 'out', 'web', 'in'],
    ['web', 'out', 'db', 'in'],
  ]),
  startIncidents: [{ nodeId: 'web', modeId: 'oomkill' }],
  objectives: [
    {
      id: 'memory',
      label: 'Give the workload enough memory to stop being OOM-killed',
      check: (c) => c.every('k8s-workload', (p) => Number(p.memLimit ?? 0) >= 512),
      hint: 'Exit code 137 is an OOM kill. A memory limit is a hard ceiling — the kernel does not negotiate.',
    },
    {
      id: 'liveness',
      label: 'Make the liveness probe shallow',
      check: (c) => c.every('k8s-workload', (p) => p.livenessProbe === 'http'),
      hint: 'A liveness probe that checks the database restarts every replica when the database blips. Liveness should only ask whether the process is wedged.',
    },
    {
      id: 'readiness',
      label: 'Add a readiness probe',
      check: (c) => c.every('k8s-workload', (p) => p.readinessProbe === true),
      hint: 'Without it, Pods receive traffic the moment they start — before they can serve it. It is also what makes a rolling update safe.',
    },
    {
      id: 'replicas',
      label: 'Run at least three replicas, spread across nodes',
      check: (c) => c.every('k8s-workload', (p) => Number(p.replicas ?? 1) >= 3 && p.antiAffinity === true),
      hint: 'Three Pods on one node are not redundant. Anti-affinity spreads them.',
    },
    {
      id: 'pdb',
      label: 'Add a PodDisruptionBudget',
      check: (c) => c.every('k8s-workload', (p) => p.pdb === true),
      hint: 'Without one, draining a node during a cluster upgrade can evict every replica at once.',
    },
    {
      id: 'zones',
      label: 'Spread the node pool across availability zones',
      check: (c) => c.every('k8s-nodepool', (p) => p.spreadZones === true),
      hint: 'Anti-affinity across nodes does not help if every node is in the same zone.',
    },
    {
      id: 'rbac',
      label: 'Stop handing out cluster-admin',
      check: (c) => c.every('k8s-cluster', (p) => p.rbac === 'scoped'),
      hint: 'Namespace-scoped roles are what make a namespace a security boundary rather than a naming convention.',
    },
    {
      id: 'netpol',
      label: 'Add a default-deny NetworkPolicy',
      check: (c) => c.some('firewall', (p) => p.defaultDeny === true),
      hint: 'Every Pod can reach every other Pod until you say otherwise. This is the highest-value security change in most clusters.',
    },
    {
      id: 'stable',
      label: 'Resolve the incident and run cleanly',
      check: (c) => c.incidents.length === 0 && c.ranFor(10) && c.metric('errorRate') < 0.02,
      hint: 'Once the memory limit is right, resolve the OOM incident in the Incidents tab and let it run.',
    },
  ],
  hints: [
    'Exit code 137 means SIGKILL, which in a container almost always means the memory limit was exceeded.',
    'Liveness restarts the container; readiness removes it from the Service. Using one for the other\'s job is the classic Kubernetes outage.',
    'Redundancy in Kubernetes has three levels: replica count, spreading across nodes, and spreading across zones. All three have to be true.',
  ],
  debrief: [
    'Probes are the highest-leverage configuration in Kubernetes and the easiest to get dangerously wrong. Liveness asks "should this be restarted?" — nothing else belongs in it.',
    'Requests decide where a Pod is scheduled; limits decide what happens when it misbehaves. Memory limits kill; CPU limits throttle. Those are very different consequences and worth internalising.',
    'And a cluster with no NetworkPolicy is a flat network where one compromised container reaches everything. Default-deny plus explicit allows costs a few dozen lines of YAML.',
  ],
  concepts: ['probes', 'resource-requests-limits', 'pod-lifecycle', 'kubernetes-scheduling', 'network-segmentation'],
}

const ransomNote: Mission = {
  id: 'ransom-note',
  title: 'Ransom Note',
  tagline: 'Whether you recover was decided months ago.',
  difficulty: 'hard',
  track: 'security',
  requires: 'locked-out',
  minutes: 20,
  brief: [
    'An adversary has been inside for six weeks. They have mapped your network, collected credentials, and located your backups. Today they encrypt.',
    'You cannot prevent this incident from the position you are in now. What you can do is build the architecture where it would have been survivable.',
    'Build a system where a full compromise of the application tier does not become a total loss.',
  ],
  start: diagram('Ransom Note', [
    { id: 'users', def: 'core.client', at: [-400, 100], props: { rps: 500 } },
    { id: 'net', def: 'core.internet', at: [-200, 100] },
    { id: 'alb', def: 'aws.alb', at: [40, 100] },
    { id: 'app', def: 'aws.ec2', at: [290, 100], props: { replicas: 3 } },
    { id: 'db', def: 'aws.rds', at: [560, 40], props: { backupRetention: 1, encryption: 'none', deletionProtection: false } },
    { id: 'files', def: 'aws.s3', at: [560, 260], props: { versioning: false, encryption: 'none', publicAccess: false } },
    { id: 'bad', def: 'core.attacker', at: [-400, 340], props: { vector: 'ransomware', intensity: 8 } },
  ], [
    ['users', 'out', 'net', 'in'],
    ['net', 'out', 'alb', 'in'],
    ['alb', 'out', 'app', 'in'],
    ['app', 'out', 'db', 'in'],
    ['app', 'out', 'files', 'in'],
    ['bad', 'out', 'alb', 'in'],
  ]),
  objectives: [
    {
      id: 'retention',
      label: 'Keep backups longer than a plausible dwell time',
      check: (c) => c.every('relational-db', (p) => Number(p.backupRetention ?? 0) >= 30),
      hint: 'Attackers dwell for weeks before triggering. Backups shorter than that are already poisoned.',
    },
    {
      id: 'versioning',
      label: 'Turn on object versioning so overwrites are recoverable',
      check: (c) => c.every('object-store', (p) => p.versioning === true || p.softDelete === true),
      hint: 'Versioning keeps the previous copy of every object, including ones a delete marker hides.',
    },
    {
      id: 'encryption',
      label: 'Encrypt everything with a customer-managed key',
      check: (c) => c.every('relational-db', (p) => p.encryption === 'cmk') && c.every('object-store', (p) => p.encryption === 'cmk'),
      hint: 'A key you control can be revoked instantly, which turns exfiltrated data into unreadable ciphertext.',
    },
    {
      id: 'kms',
      label: 'Add a key management service to the architecture',
      check: (c) => c.has('kms'),
      hint: 'Customer-managed keys need somewhere to live, with an audit trail of every decrypt.',
    },
    {
      id: 'segmentation',
      label: 'Segment the network so one compromise is not total',
      check: (c) => c.has('firewall') && c.some('firewall', (p) => p.inboundScope === 'sg' || p.defaultDeny === true || p.inboundScope === 'asg'),
      hint: 'A security group that references another security group is how you say "only the app tier may reach the database".',
    },
    {
      id: 'iam',
      label: 'Give the application a scoped identity',
      check: (c) => c.has('identity') && c.every('identity', (p) => p.scope === 'scoped' || p.bindingLevel === 'resource'),
      hint: 'Least privilege is what decides whether a compromise reaches one bucket or the whole account.',
    },
    {
      id: 'protection',
      label: 'Turn on deletion protection',
      check: (c) => c.every('relational-db', (p) => p.deletionProtection === true),
      hint: 'The last line of defence against a deliberate or accidental destroy.',
    },
    {
      id: 'survive',
      label: 'Run with no successful compromise',
      check: (c) => c.ranFor(5) && c.metric('compromise') === 0,
    },
  ],
  hints: [
    'A control has to be attached to what it protects. Connect the security group to the application tier, and the IAM role and key to the resources that use them.',
    'Ransomware operators destroy backups before they encrypt, because a victim who can restore does not pay.',
    'Retention has to exceed the dwell time. Thirty days of backups is no protection against sixty days of access.',
    'The controls that matter here are all decided long in advance — immutability, retention, key ownership and segmentation. None of them can be added during the incident.',
  ],
  debrief: [
    'Recovery from ransomware is decided by choices made months earlier. Immutable, versioned backups with retention longer than a plausible dwell time are the whole game.',
    'Customer-managed keys are the other half: revoke the key and the exfiltrated copy becomes unreadable, which turns a breach into a contained incident.',
    'And segmentation plus least privilege determine how far the initial foothold spreads. Every one of these is cheap to configure in advance and impossible to add afterwards.',
  ],
  concepts: ['ransomware-resilience', 'data-durability', 'key-management', 'blast-radius', 'least-privilege'],
}

const theBill: Mission = {
  id: 'the-bill',
  title: 'The Bill',
  tagline: 'Same availability, same latency, half the money.',
  difficulty: 'hard',
  track: 'cost',
  requires: 'black-friday',
  minutes: 15,
  brief: [
    'Finance has flagged this service. It costs more than the revenue it supports, and nobody can explain where the money goes.',
    'Bring the monthly cost under $1,700 without breaking anything: error rate must stay under 1% and p95 latency under 400ms. Note that a chunk of it is data transfer out to your users, which no amount of tuning removes — everything else is yours to fix.',
    'Every resource on the canvas shows its own cost in the Inspector. Start by finding out which ones actually matter.',
  ],
  start: diagram('The Bill', [
    { id: 'users', def: 'core.client', at: [-420, 140], props: { rps: 450, region: 'global' } },
    { id: 'net', def: 'core.internet', at: [-200, 140] },
    { id: 'alb', def: 'aws.alb', at: [40, 140] },
    { id: 'app', def: 'aws.ec2', at: [300, 140], props: { replicas: 14, size: 'c5.2xlarge', autoscale: false } },
    { id: 'db', def: 'aws.rds', at: [580, 60], props: { size: 'db.r5.2xlarge', multiAz: true, readReplicas: 3, backupRetention: 7 } },
    { id: 'nat', def: 'aws.nat', at: [580, 280], props: { perAz: true } },
    { id: 'files', def: 'aws.s3', at: [860, 280], props: { storageClass: 'standard', versioning: true, lifecycle: false } },
    { id: 'orphan', def: 'aws.ebs', at: [860, 60], props: { sizeGb: 2000, volumeType: 'io2' }, label: 'Old volume' },
  ], [
    ['users', 'out', 'net', 'in'],
    ['net', 'out', 'alb', 'in'],
    ['alb', 'out', 'app', 'in'],
    ['app', 'out', 'db', 'in'],
    ['app', 'out', 'files', 'in'],
  ]),
  objectives: [
    {
      id: 'orphans',
      label: 'Remove anything connected to nothing',
      check: (c) => c.noFinding((f) => f.id.startsWith('orphan:')),
      hint: 'The Review panel flags unattached resources. In a real account they are still on the bill.',
    },
    {
      id: 'rightsize',
      label: 'Right-size the application tier to what the traffic needs',
      check: (c) => c.every('vm', (p) => Number(p.replicas ?? 1) <= 6),
      hint: 'Fourteen compute-optimised instances for 450 requests per second is roughly ten times what is needed.',
    },
    {
      id: 'cache',
      label: 'Use a cache instead of read replicas to absorb reads',
      check: (c) => c.has('cache') && c.every('relational-db', (p) => Number(p.readReplicas ?? 0) <= 1),
      hint: 'A cache node costs a fraction of a database replica and absorbs more read load.',
    },
    {
      id: 'endpoint',
      label: 'Keep object storage traffic off the NAT gateway',
      check: (c) => c.has('private-link') || !c.has('nat'),
      hint: 'A gateway VPC endpoint for S3 is free and removes those data processing charges entirely.',
    },
    {
      id: 'lifecycle',
      label: 'Add a storage lifecycle rule',
      check: (c) => c.every('object-store', (p) => p.lifecycle === true),
      hint: 'Old objects on hot storage, and old versions that never expire, accumulate indefinitely.',
    },
    {
      id: 'budget',
      label: 'Get under $1,700 per month',
      check: (c) => c.metric('costPerMonth') > 0 && c.metric('costPerMonth') < 1700,
      hint: 'Select each resource and read its hourly cost. Two or three of them account for nearly all of it.',
    },
    {
      id: 'still-good',
      label: 'Keep errors under 1% and p95 under 400ms',
      sustained: true,
      check: (c) => c.ranFor(15) && c.metric('errorRate') < 0.01 && c.metric('p95LatencyMs') < 400,
      hint: 'Cutting cost is easy; cutting cost without breaking the service is the exercise.',
    },
  ],
  hints: [
    'Select each node and read its cost. Two or three of them will account for nearly all of it.',
    'Read replicas scale reads and cost almost as much as the primary. A cache does the same job for a fraction.',
    'Data transfer is invisible until you look. Gateway endpoints for object storage are free and remove a NAT charge entirely.',
  ],
  debrief: [
    'Cloud waste accumulates rather than being decided. Oversized instances, forgotten volumes, replicas that a cache would have made unnecessary, and data moving through a gateway that charges per gigabyte.',
    'The discipline is attribution: know what each component costs and what it buys. A design that costs ten times more for the same outcome is a worse design, not a more generous one.',
    'And notice that the cheapest architecture here was also the simpler one. That is usually true.',
  ],
  concepts: ['cost-optimisation', 'caching', 'private-connectivity', 'capacity-planning'],
}

const threeNines: Mission = {
  id: 'three-nines',
  title: 'Three Nines',
  tagline: 'Build something that is up 99.9% of the time, and prove it.',
  difficulty: 'hard',
  track: 'reliability',
  requires: 'single-point',
  minutes: 20,
  brief: [
    'You are being asked to commit to 99.9% availability — about 43 minutes of downtime per month — and you need an architecture that can actually hold it.',
    'Dependencies multiply. Every hard dependency you add lowers the ceiling before your own code fails once. Redundancy compounds in the other direction, but only when failures are independent.',
    'Build it, then turn on chaos mode and see whether it holds.',
  ],
  objectives: [
    {
      id: 'redundant-compute',
      label: 'Redundant compute behind a load balancer',
      check: (c) =>
        (c.has('load-balancer-l7') || c.has('k8s-ingress')) &&
        (c.some('vm', (p) => Number(p.replicas ?? 1) >= 3) ||
          c.some('container-service', (p) => Number(p.replicas ?? 1) >= 3) ||
          c.some('k8s-workload', (p) => Number(p.replicas ?? 1) >= 3)),
      hint: 'Three or more instances, with something in front that health-checks them.',
    },
    {
      id: 'zones',
      label: 'Spread across availability zones',
      check: (c) =>
        c.some('vm', (p) => p.zones === 'multi') ||
        c.some('k8s-nodepool', (p) => p.spreadZones === true) ||
        new Set(c.graph.nodes.filter((n) => n.defId.endsWith('.subnet')).map((n) => String(n.props.az ?? 'a'))).size >= 2,
      hint: 'Replica count is not redundancy if every replica shares a datacentre.',
    },
    {
      id: 'ha-data',
      label: 'A data tier that survives losing a zone',
      check: (c) =>
        c.some('relational-db', (p) => p.multiAz === true || p.highAvailability === true || p.zoneRedundant === true) ||
        c.has('nosql-db'),
      hint: 'Multi-AZ on a relational database, or a managed NoSQL store that is regionally redundant by design.',
    },
    {
      id: 'cache-buffer',
      label: 'Something that absorbs load when the database struggles',
      check: (c) => c.has('cache') || c.has('cdn') || c.has('queue'),
      hint: 'A cache, a CDN or a queue all convert a downstream problem into degraded service rather than failure.',
    },
    {
      id: 'observability',
      label: 'Metrics and alerting, with symptom-based alarms',
      check: (c) => c.has('monitoring') && c.some('monitoring', (p) => p.alarmStrategy === 'symptom'),
      hint: 'You cannot hold an objective you are not measuring. Alarm on what users feel, not on CPU.',
    },
    {
      id: 'no-critical',
      label: 'No critical or high reliability findings',
      check: (c) => c.noFinding((f) => f.pillar === 'reliability' && (f.severity === 'critical' || f.severity === 'high')),
    },
    {
      id: 'measured',
      label: 'Reach a modelled availability of 99.9% or better',
      check: (c) => c.metric('availability') >= 0.999,
      hint: 'The Metrics tab shows modelled availability. Every component carrying traffic multiplies into it.',
    },
    {
      id: 'chaos',
      label: 'Survive chaos mode: stay under 2% errors for 40 ticks',
      sustained: true,
      check: (c) => c.ranFor(40) && c.metric('errorRate') < 0.02,
      hint: 'Turn on chaos mode in the Incidents tab and let it run. Random failures will be injected.',
    },
  ],
  hints: [
    'Availability multiplies across hard dependencies. Fewer components on the critical path is itself a reliability strategy.',
    'Redundancy only compounds when failures are independent. Check that your copies do not share a zone, a node or a deployment.',
    'A component that can degrade instead of failing — a cache serving stale, a queue absorbing writes — does not multiply into your availability.',
  ],
  debrief: [
    'Three nines is 43 minutes a month, which sounds generous until you notice that a single un-redundant component at 99.5% has already spent more than three hours of it.',
    'The two levers are: fewer hard dependencies on the critical path, and genuinely independent redundancy for the ones that remain.',
    'The third lever, which the simulation cannot show you, is how fast you recover. Automatic rollback and a practised runbook move time-to-restore more than any amount of architecture.',
  ],
  concepts: ['availability-math', 'redundancy', 'availability-zones', 'slo-sli', 'self-healing'],
}

const blastRadius: Mission = {
  id: 'blast-radius',
  title: 'Blast Radius',
  tagline: 'Assume the container is already owned. Now contain it.',
  difficulty: 'expert',
  track: 'security',
  requires: 'ransom-note',
  minutes: 25,
  brief: [
    'Stop thinking about prevention for a moment. Assume an attacker already has code execution inside your application container — a dependency was compromised, or a bug was exploited before you patched it.',
    'The question is no longer whether they got in. It is what they can reach, what they can read, and whether they can get it out.',
    'Build the architecture where the honest answer to all three is "almost nothing". Three different attackers are probing at once.',
  ],
  start: diagram('Blast Radius', [
    { id: 'users', def: 'core.client', at: [-420, 60], props: { rps: 600, region: 'global' } },
    { id: 'net', def: 'core.internet', at: [-210, 60] },
    { id: 'lateral', def: 'core.attacker', at: [-420, 260], props: { vector: 'lateral-movement', intensity: 8 } },
    { id: 'exfil', def: 'core.attacker', at: [-420, 400], props: { vector: 'data-exfiltration', intensity: 7 } },
    { id: 'escalate', def: 'core.attacker', at: [-420, 540], props: { vector: 'privilege-escalation', intensity: 7 } },
    { id: 'alb', def: 'aws.alb', at: [20, 60] },
    { id: 'app', def: 'aws.ecs-fargate', at: [280, 60], props: { replicas: 3 } },
    { id: 'db', def: 'aws.rds', at: [560, 20], props: { multiAz: true, backupRetention: 30, encryption: 'cmk', publicAccess: false } },
    { id: 'files', def: 'aws.s3', at: [560, 220], props: { versioning: true, encryption: 'cmk' } },
  ], [
    ['users', 'out', 'net', 'in'],
    ['net', 'out', 'alb', 'in'],
    ['alb', 'out', 'app', 'in'],
    ['app', 'out', 'db', 'in'],
    ['app', 'out', 'files', 'in'],
    ['lateral', 'out', 'alb', 'in'],
    ['exfil', 'out', 'alb', 'in'],
    ['escalate', 'out', 'alb', 'in'],
  ]),
  objectives: [
    {
      id: 'segmentation',
      label: 'Segment the network with an identity-referencing firewall',
      check: (c) => c.some('firewall', (p) => p.inboundScope === 'sg' || p.inboundScope === 'asg' || p.targeting === 'service-account' || p.defaultDeny === true),
      hint: 'Reference another security group rather than an IP range. The rule then stays correct as things scale.',
    },
    {
      id: 'egress',
      label: 'Restrict outbound traffic',
      check: (c) => c.some('firewall', (p) => p.egressControl === true || p.denyAllOutbound === true || p.egressDeny === true),
      hint: 'Ingress rules stop them getting in. Egress rules stop the data getting out.',
    },
    {
      id: 'scoped-identity',
      label: 'Give the workload a narrowly scoped identity',
      check: (c) => c.has('identity') && c.every('identity', (p) => (p.scope ?? 'scoped') === 'scoped' && (p.bindingLevel ?? 'resource') === 'resource'),
      hint: 'An IAM role with specific actions on specific resources. Wildcards here are the whole blast radius.',
    },
    {
      id: 'conditions',
      label: 'Add condition keys so a stolen credential is useless elsewhere',
      check: (c) => c.some('identity', (p) => p.conditions === true),
      hint: 'Requiring a source VPC means credentials taken out of your network cannot be used.',
    },
    {
      id: 'secrets',
      label: 'Fetch credentials from a secrets manager, with rotation',
      check: (c) => c.has('secrets') && c.some('secrets', (p) => p.rotation === true),
      hint: 'Rotation bounds how long a leaked credential stays useful.',
    },
    {
      id: 'private-link',
      label: 'Reach storage privately so an endpoint policy can constrain it',
      check: (c) => c.has('private-link'),
      hint: 'A VPC endpoint with a policy stops a compromised workload copying data to someone else\'s bucket.',
    },
    {
      id: 'waf',
      label: 'Inspect and rate-limit inbound requests',
      check: (c) => c.some('waf', (p) => p.mode === 'block' || p.wafMode === 'prevention'),
    },
    {
      id: 'observability',
      label: 'Record what talked to what',
      check: (c) => c.has('monitoring') || c.some('vpc', (p) => p.flowLogs === true),
      hint: 'Without flow logs, "did the compromised container reach the database" is unanswerable.',
    },
    {
      id: 'contained',
      label: 'No attack vector succeeds',
      check: (c) => c.ranFor(8) && c.metric('compromise') === 0,
      hint: 'The Security tab shows residual pressure per vector. Each one needs a different control.',
    },
  ],
  hints: [
    'Controls only protect what they are connected to. Draw a line from the security group or firewall to the workload it guards, and from the IAM role to the workload that assumes it.',
    'Three vectors, three different controls. Lateral movement is stopped by segmentation, exfiltration by egress rules and private endpoints, escalation by scoped IAM.',
    'Notice that none of these are detection tools. They are structural — they change what is possible, not what is noticed.',
    'The Security tab shows each attacker\'s residual pressure after your controls. Watch it drop as you add each layer.',
  ],
  debrief: [
    'Containment is a design property, not an incident response. Every control here had to exist before the compromise to be useful during it.',
    'The three vectors map onto three layers: network segmentation bounds reach, scoped identity bounds capability, and egress control bounds what leaves. Missing any one leaves an open path.',
    'If you can answer "if this container is fully owned, what exactly can it reach?" with a short, specific list, you have done the work. Most systems cannot answer it at all.',
  ],
  concepts: ['blast-radius', 'zero-trust', 'lateral-movement', 'data-exfiltration', 'least-privilege', 'network-segmentation'],
}

const thePager: Mission = {
  id: 'the-pager',
  title: 'The Pager',
  tagline: 'It fires eleven times a night and stayed silent through the real outage.',
  difficulty: 'medium',
  track: 'operations',
  requires: 'single-point',
  minutes: 12,
  brief: [
    'The on-call rota is in revolt. The pager fires on CPU, on memory, on disk, on anything that moves — and last Thursday, when the application spent forty minutes returning errors to every customer, it said nothing at all.',
    'Nobody noticed until a customer emailed. That is the failure you are fixing: not a missing alarm, but an alerting strategy that pages on causes instead of on what users feel, and a telemetry pipeline with holes in it.',
    'Press play. Something is already wrong with the application tier — find it in the numbers, not by guessing.',
  ],
  start: diagram('The Pager', [
    { id: 'users', def: 'core.client', at: [-400, 140], props: { rps: 700 } },
    { id: 'net', def: 'core.internet', at: [-190, 140] },
    { id: 'alb', def: 'aws.alb', at: [40, 140], props: { accessLogs: false, healthPath: '/' } },
    { id: 'app', def: 'aws.ec2', at: [300, 140], props: { replicas: 2, size: 'm5.large', autoscale: false } },
    { id: 'db', def: 'aws.rds', at: [560, 140], props: { multiAz: true, backupRetention: 7, size: 'db.m5.large' } },
    { id: 'cw', def: 'aws.cloudwatch', at: [300, 380], props: { alarmStrategy: 'everything', logRetention: 1 } },
  ], [
    ['users', 'out', 'net', 'in'],
    ['net', 'out', 'alb', 'in'],
    ['alb', 'out', 'app', 'in'],
    ['app', 'out', 'db', 'in'],
    ['app', 'telemetry', 'cw', 'in'],
  ]),
  startIncidents: [{ nodeId: 'app', modeId: 'disk-full' }],
  objectives: [
    {
      id: 'symptom',
      label: 'Alarm on symptoms rather than on everything',
      check: (c) => c.prop('monitoring', 'alarmStrategy', 'symptom'),
      hint: 'Select CloudWatch and change the alarm strategy. A pager that fires on every metric is a pager people mute.',
    },
    {
      id: 'retention',
      label: 'Keep logs long enough to investigate with',
      check: (c) => c.every('monitoring', (p) => Number(p.logRetention ?? 0) >= 30),
      hint: 'One day of retention means an incident reviewed on Monday has no evidence left. Thirty days is a reasonable floor.',
    },
    {
      id: 'db-telemetry',
      label: 'Collect telemetry from the database and the load balancer too',
      check: (c) => sendsTelemetry(c, 'relational-db') && sendsTelemetry(c, 'load-balancer-l7'),
      hint: 'Drag from the telemetry handle on the bottom of each node to CloudWatch. You cannot correlate a slow request with a saturated database if only one of them is reporting.',
    },
    {
      id: 'access-logs',
      label: 'Turn on load balancer access logs',
      check: (c) => c.prop('load-balancer-l7', 'accessLogs', true),
      hint: 'Access logs are the per-request record — status codes, target, response time. Without them you cannot answer "which requests failed".',
    },
    {
      id: 'deep-health',
      label: 'Health-check something that means the application works',
      check: (c) => c.every('load-balancer-l7', (p) => String(p.healthPath ?? '/') !== '/'),
      hint: 'A check against "/" passes whenever the web server is alive, including when every dependency behind it is broken. Point it at a path that exercises the application.',
    },
    {
      id: 'serving',
      label: 'Deal with the failing instance and get the error rate under 2%',
      sustained: true,
      check: (c) => c.ranFor(25) && c.metric('totalServed') > 0 && c.metric('errorRate') < 0.02,
      hint: 'Open the incident in the Observability panel and read the remedy. The root volume filled because the logs never left the box — ship them off it, then mark the incident resolved.',
    },
  ],
  hints: [
    'Work out what users actually experience first. The error rate and p95 in the toolbar are the symptoms; every other metric is a cause you might or might not care about.',
    'The degraded instance still answers its shallow health check against "/". That is exactly why the load balancer keeps sending it traffic.',
    'Two instances with one degraded is one instance of real capacity. Redundancy has to survive losing a member, not just exist.',
  ],
  debrief: [
    'Alerting on causes produces noise; alerting on symptoms produces pages that mean something. Everything else — CPU, memory, queue depth — belongs on a dashboard you look at once the page has told you where to look.',
    'Telemetry with holes in it is worse than none, because it gives you confidence you have not earned. The database was the obvious suspect for forty minutes and nobody could confirm it either way.',
    'And a health check is a contract about what "healthy" means. If it only proves the process is running, the load balancer will keep routing to a process that cannot do its job.',
  ],
  concepts: ['observability', 'golden-signals', 'alerting', 'health-checks', 'log-management'],
}

const shipIt: Mission = {
  id: 'ship-it',
  title: 'Ship It',
  tagline: 'The last deploy was a forty-minute outage. The one before that was fine, probably.',
  difficulty: 'medium',
  track: 'operations',
  requires: 'first-contact',
  minutes: 12,
  brief: [
    'Releases go out every second Thursday, all at once, from a pipeline nobody has changed in two years. The last one replaced every instance simultaneously with a build that could not reach the database, and the rollback was a second deploy that took thirty-five minutes to prepare.',
    'You are not being asked to deploy less often. You are being asked to make deploying boring: small exposure, an automatic way back, and a signal that tells you which of those two you need.',
    'The pipeline is on the canvas. So is the tier it deploys to.',
  ],
  start: diagram('Ship It', [
    { id: 'users', def: 'core.client', at: [-400, 140], props: { rps: 500 } },
    { id: 'net', def: 'core.internet', at: [-190, 140] },
    { id: 'alb', def: 'aws.alb', at: [40, 140], props: { deregistrationDelay: 0 } },
    { id: 'app', def: 'aws.ec2', at: [300, 140], props: { replicas: 3, size: 'm5.large' } },
    { id: 'db', def: 'aws.rds', at: [560, 140], props: { multiAz: true, backupRetention: 7 } },
    { id: 'pipe', def: 'aws.pipeline', at: [300, -120], props: { strategy: 'all-at-once', autoRollback: false, gates: [] } },
  ], [
    ['users', 'out', 'net', 'in'],
    ['net', 'out', 'alb', 'in'],
    ['alb', 'out', 'app', 'in'],
    ['app', 'out', 'db', 'in'],
    ['pipe', 'deploy', 'app', 'deploy'],
  ]),
  objectives: [
    {
      id: 'progressive',
      label: 'Expose a release to a fraction of traffic before all of it',
      check: (c) => c.some('ci-cd', (p) => p.strategy === 'canary' || p.strategy === 'blue-green'),
      hint: 'Canary sends a small percentage first and watches. Blue/green keeps the old version alive so the way back is a traffic switch rather than another deploy.',
    },
    {
      id: 'rollback',
      label: 'Roll back automatically when the release misbehaves',
      check: (c) => c.every('ci-cd', (p) => p.autoRollback === true),
      hint: 'A rollback that waits for a human to notice is measured in the same minutes as the outage.',
    },
    {
      id: 'gates',
      label: 'Verify the build before and after it reaches production',
      check: (c) => c.some('ci-cd', (p) => {
        const gates = Array.isArray(p.gates) ? p.gates.map(String) : []
        return gates.includes('tests') && gates.includes('scan') && gates.includes('smoke')
      }),
      hint: 'Tests and a vulnerability scan before, a smoke test after. The post-deploy check is what turns automatic rollback from a hope into a mechanism.',
    },
    {
      id: 'registry',
      label: 'Build one artefact, store it immutably, and deploy that',
      check: (c) => c.has('registry')
        && c.every('registry', (p) => p.immutableTags === true && p.scanOnPush === true)
        && linked(c, 'registry', ['vm', 'container-service', 'k8s-workload']),
      hint: 'Add a container registry, turn on immutable tags and scanning, and connect it to the compute tier. A mutable tag means you cannot prove what is running, and a rollback may not roll back.',
    },
    {
      id: 'draining',
      label: 'Stop killing requests that are already in flight',
      check: (c) => c.every('load-balancer-l7', (p) => Number(p.deregistrationDelay ?? 0) >= 30),
      hint: 'A deregistration delay of zero drops every in-flight request the moment an instance leaves the pool. It needs to be longer than your slowest request.',
    },
    {
      id: 'signal',
      label: 'Give the rollback something to trigger on',
      check: (c) => c.has('monitoring') && sendsTelemetry(c, 'vm'),
      hint: 'Automatic rollback needs a metric to watch. Add a monitoring service and connect the application tier to it.',
    },
    {
      id: 'serving',
      label: 'Keep serving while you change all of this',
      check: (c) => c.ranFor(20) && c.metric('totalServed') > 0 && c.metric('errorRate') < 0.02,
      hint: 'Press play and let it run. None of these changes should cost you availability.',
    },
  ],
  hints: [
    'The gates are a multi-select on the pipeline. Choose the ones that would have caught the release that broke, not every box available.',
    'Immutable tags and a digest-based deploy are what make "roll back to the previous version" a precise instruction rather than an approximate one.',
    'Connection draining is the unglamorous setting that decides whether a deploy is invisible or produces a burst of 502s.',
  ],
  debrief: [
    'Deployment frequency and change failure rate move together in the right direction. Small changes, deployed often, through a path that is exercised constantly, fail less than large ones deployed rarely.',
    'The measure that matters is how fast you can get back to a working state. Automatic rollback on a post-deploy signal beats any number of approval gates, because a gate that is always granted is a delay rather than a control.',
    'And build once, promote the same artefact. If production runs something that was rebuilt after staging tested it, then staging tested a different piece of software.',
  ],
  concepts: ['ci-cd', 'deployment-strategies', 'release-versioning', 'dora-metrics', 'feature-flags'],
}

const pavedRoad: Mission = {
  id: 'paved-road',
  title: 'The Paved Road',
  tagline: 'Twelve teams, twelve ways of running a service. Build the thirteenth and make it the easy one.',
  difficulty: 'hard',
  track: 'platform',
  requires: 'crashloop',
  minutes: 20,
  brief: [
    'You have joined a platform team of four, supporting around forty services. Every one of them was assembled by hand, and it shows: three of them have no resource limits, one keeps its database password in a ConfigMap, and nobody can say which services would survive losing a zone.',
    'The plan is a golden path — one template that every new service starts from, with the decisions already made correctly. The first version is on the canvas, and it is what a service looks like when it was built by someone in a hurry.',
    'Make it the thing you would be happy for forty teams to copy. Everything you fix here is a decision nobody has to make again.',
  ],
  start: diagram('The Paved Road', [
    { id: 'users', def: 'core.client', at: [-400, 180], props: { rps: 600 } },
    { id: 'net', def: 'core.internet', at: [-190, 180] },
    { id: 'cluster', def: 'k8s.cluster', at: [40, -60], size: [880, 560], props: { rbac: 'cluster-admin', privateEndpoint: false } },
    { id: 'ingress', def: 'k8s.ingress', at: [40, 220], in: 'cluster', props: { tls: false, controller: 'nginx' } },
    { id: 'svc', def: 'k8s.service', at: [240, 220], in: 'cluster' },
    { id: 'pool', def: 'k8s.nodepool', at: [440, 100], size: [380, 320], in: 'cluster', props: { nodeCount: 2, spreadZones: false, autoscale: false } },
    {
      id: 'web', def: 'k8s.deployment', at: [30, 60], in: 'pool',
      props: {
        replicas: 2, cpuRequest: 0, memRequest: 0, memLimit: 0,
        livenessProbe: 'none', readinessProbe: false, pdb: false, antiAffinity: false, runAsNonRoot: false,
      },
    },
    { id: 'cfg', def: 'k8s.config', at: [440, 460], in: 'cluster', props: { secretSource: 'k8s', encryptedAtRest: false } },
    { id: 'db', def: 'aws.rds', at: [990, 220], props: { multiAz: true, backupRetention: 7 } },
  ], [
    ['users', 'out', 'net', 'in'],
    ['net', 'out', 'ingress', 'in'],
    ['ingress', 'out', 'svc', 'in'],
    ['svc', 'out', 'web', 'in'],
    ['web', 'out', 'db', 'in'],
    ['cfg', 'out', 'web', 'config'],
  ]),
  objectives: [
    {
      id: 'probes',
      label: 'Every workload declares what healthy means',
      check: (c) => c.every('k8s-workload', (p) => p.livenessProbe !== 'none' && p.readinessProbe === true),
      hint: 'Without a readiness probe, a Pod receives traffic the moment it starts — before it has connected to anything.',
    },
    {
      id: 'resources',
      label: 'Every workload declares what it needs and what it may not exceed',
      check: (c) => c.every('k8s-workload', (p) => Number(p.cpuRequest ?? 0) > 0 && Number(p.memRequest ?? 0) > 0 && Number(p.memLimit ?? 0) > 0),
      hint: 'A Pod with no requests is scheduled anywhere and evicted first. A Pod with no memory limit can take a node down with it.',
    },
    {
      id: 'disruption',
      label: 'Survive a node going away',
      check: (c) => c.every('k8s-workload', (p) => p.pdb === true && p.antiAffinity === true),
      hint: 'A disruption budget stops a drain taking every replica at once; anti-affinity stops them all being on the same node to begin with.',
    },
    {
      id: 'spread',
      label: 'Spread the nodes across zones and let the pool grow',
      check: (c) => c.every('k8s-nodepool', (p) => p.spreadZones === true && p.autoscale === true),
      hint: 'Replicas in one zone are not redundant against losing that zone, and a fixed pool means a busy Thursday is a Pending Pod.',
    },
    {
      id: 'hpa',
      label: 'Scale on demand rather than on a guess',
      check: (c) => c.has('autoscaler') && c.some('autoscaler', (p) => Number(p.minReplicas ?? 0) >= 2),
      hint: 'Add a Horizontal Pod Autoscaler with a floor of at least two. The floor is the availability decision; the ceiling is the budget one.',
    },
    {
      id: 'secrets',
      label: 'Take secrets from somewhere that can rotate and audit them',
      check: (c) => c.every('k8s-config', (p) => p.secretSource === 'external' && p.encryptedAtRest === true),
      hint: 'A Kubernetes Secret is base64, not encryption, unless encryption at rest is configured. An external secret manager gives you rotation and an access log as well.',
    },
    {
      id: 'network',
      label: 'Default to denying traffic inside the cluster',
      check: (c) => c.some('firewall', (p) => p.defaultDeny === true && p.egressControl === true),
      hint: 'Add a NetworkPolicy with default deny and egress control. Without one, every Pod can reach every other Pod and anything on the internet.',
    },
    {
      id: 'supply-chain',
      label: 'Run images you can identify and have scanned',
      check: (c) => c.has('registry') && c.every('registry', (p) => p.immutableTags === true && p.scanOnPush === true),
      hint: 'Add a registry with immutable tags and scan-on-push, and connect it to the workload. A mutable tag means two nodes can run two different builds of "the same" version.',
    },
    {
      id: 'tls',
      label: 'Terminate TLS at the edge of the cluster',
      check: (c) => c.every('k8s-ingress', (p) => p.tls === true),
      hint: 'The ingress has TLS turned off, which means the paved road ships plaintext by default.',
    },
    {
      id: 'least-privilege',
      label: 'Stop the template from handing out cluster-admin',
      check: (c) => c.every('k8s-cluster', (p) => p.rbac === 'scoped') && c.every('k8s-workload', (p) => p.runAsNonRoot === true),
      hint: 'Two settings: the cluster\'s RBAC posture, and whether the container runs as root. Both are defaults forty teams would inherit.',
    },
    {
      id: 'clean',
      label: 'Leave no critical or high finding in the review',
      check: (c) => c.noFinding((f) => f.severity === 'critical' || f.severity === 'high'),
      hint: 'The Review panel is the closest thing to the conversation a platform team has with itself. Clear it before this becomes the template.',
    },
  ],
  hints: [
    'Work top to bottom through the Review panel, then look at what a new team would have to decide for themselves. Every remaining decision is one you have not made for them.',
    'The settings that matter most here are the ones with no visible effect on a good day: disruption budgets, zone spreading, the secret source, the network policy.',
    'A paved road is only paved if it is easier than the alternative. Everything in this template should be something a team gets without asking.',
  ],
  debrief: [
    'The value of a golden path is not the template. It is that forty teams stop making the same forty decisions, and that improving the path improves every service that took it.',
    'Notice which settings you changed: almost all of them cost nothing and do nothing visible until a node is drained, a zone fails or a credential leaks. That is exactly the category of decision individual teams skip under delivery pressure — and exactly what a platform exists to supply.',
    'Keep the escape hatch. A team with a genuine reason to leave the path should be able to, visibly, with an owner — otherwise they leave it invisibly.',
  ],
  concepts: ['golden-paths', 'platform-engineering', 'internal-developer-platform', 'self-service-guardrails', 'resource-requests-limits'],
}

const theDrill: Mission = {
  id: 'the-drill',
  title: 'The Drill',
  tagline: 'The backups exist. Nobody has ever restored one.',
  difficulty: 'hard',
  track: 'reliability',
  requires: 'three-nines',
  minutes: 18,
  brief: [
    'A migration ran on Tuesday that dropped a column and rewrote four million rows incorrectly. It was noticed on Wednesday. The recovery took eleven hours, most of which was spent discovering what the recovery procedure actually was.',
    'Your job is the recovery path, not the availability of the running system — those are different problems and this architecture has only solved the first one. High availability handles a component failing. It has no answer at all to "somebody destroyed the data on purpose or by accident".',
    'Assume the attacker or the bad migration has your production credentials. Build what survives that.',
  ],
  start: diagram('The Drill', [
    { id: 'users', def: 'core.client', at: [-400, 160], props: { rps: 600 } },
    { id: 'net', def: 'core.internet', at: [-190, 160] },
    { id: 'alb', def: 'aws.alb', at: [40, 160] },
    { id: 'app', def: 'aws.ec2', at: [300, 160], props: { replicas: 3, size: 'm5.large' } },
    { id: 'db', def: 'aws.rds', at: [560, 160], props: { multiAz: true, backupRetention: 1, deletionProtection: false, readReplicas: 0 } },
    { id: 'docs', def: 'aws.s3', at: [560, 400], props: { versioning: false, lifecycle: false, publicAccess: false, encryption: 'provider' } },
    { id: 'cw', def: 'aws.cloudwatch', at: [300, 400] },
  ], [
    ['users', 'out', 'net', 'in'],
    ['net', 'out', 'alb', 'in'],
    ['alb', 'out', 'app', 'in'],
    ['app', 'out', 'db', 'in'],
    ['app', 'out', 'docs', 'in'],
    ['app', 'telemetry', 'cw', 'in'],
  ]),
  startIncidents: [{ nodeId: 'db', modeId: 'failover' }],
  objectives: [
    {
      id: 'retention',
      label: 'Hold backups longer than an attacker dwells',
      check: (c) => c.every('relational-db', (p) => Number(p.backupRetention ?? 0) >= 14),
      hint: 'One day of retention means anything discovered on Wednesday about Monday is unrecoverable. Ransomware in particular sits quietly for weeks before it triggers.',
    },
    {
      id: 'versioning',
      label: 'Make object deletes and overwrites reversible',
      check: (c) => c.every('object-store', (p) => p.versioning === true && p.lifecycle === true),
      hint: 'Versioning keeps the previous object when something overwrites or deletes it. A lifecycle rule stops that becoming an unbounded bill.',
    },
    {
      id: 'deletion-protection',
      label: 'Stop the database being deleted by accident',
      check: (c) => c.every('relational-db', (p) => p.deletionProtection === true),
      hint: 'Deletion protection is the cheapest control in this mission. It is off.',
    },
    {
      id: 'own-key',
      label: 'Hold your own key, and hold it in more than one region',
      check: (c) => c.has('kms') && c.every('kms', (p) => p.rotation === true && p.multiRegion === true) && c.every('object-store', (p) => p.encryption === 'cmk'),
      hint: 'Add a KMS key, turn on rotation and make it multi-region, and point the bucket at it. A backup you cannot decrypt in the recovery region is not a backup.',
    },
    {
      id: 'read-path',
      label: 'Keep a replica so reads survive losing the primary',
      check: (c) => c.every('relational-db', (p) => Number(p.readReplicas ?? 0) >= 1),
      hint: 'A replica is not a backup — it replicates the bad migration faithfully. It is how the site stays readable while you restore.',
    },
    {
      id: 'watch',
      label: 'Notice the failover rather than hearing about it',
      check: (c) => sendsTelemetry(c, 'relational-db') && c.prop('monitoring', 'alarmStrategy', 'symptom'),
      hint: 'Connect the database telemetry to CloudWatch. The failover in progress right now is exactly the event you want to see in a graph.',
    },
    {
      id: 'ride-it-out',
      label: 'Keep the failover from taking the whole site down',
      sustained: true,
      check: (c) => c.ranFor(30) && c.metric('totalServed') > 0 && c.metric('errorRate') < 0.2,
      hint: 'The primary is gone for a minute or two, so the writes that need it will fail. The question is what fraction of the site goes with them — a cache in front absorbs the reads that would otherwise all become errors.',
    },
  ],
  hints: [
    'Separate the two questions: what is my recovery point (how much data can I lose) and what is my recovery time (how long until I am serving again). Every control here answers one or the other.',
    'A replica, a Multi-AZ standby and a backup are three different things. Only one of them survives a DELETE.',
    'If the credentials that run production can also erase the backups, then the backups do not survive a compromise of production.',
  ],
  debrief: [
    'High availability and disaster recovery solve different problems. Multi-AZ handles a building; it does nothing about a bad migration, a deleted account or an attacker with your credentials.',
    'The strategies form a ladder — backup and restore, pilot light, warm standby, active-active — priced by how much downtime and data loss you can accept. Pick the rung from a stated objective, not from ambition.',
    'And the plan is worth what its last rehearsal was worth. Restore from backup on a schedule, time it, and write the number down: that number is your real recovery time, and it is usually longer than anyone guessed.',
  ],
  concepts: ['disaster-recovery', 'rpo-rto', 'replication-lag', 'ransomware-resilience', 'key-management'],
}

const cellDivision: Mission = {
  id: 'cell-division',
  title: 'Cell Division',
  tagline: 'One bad tenant, one poisoned queue, and everybody is down. Make it one eighth of everybody.',
  difficulty: 'expert',
  track: 'reliability',
  requires: 'three-nines',
  minutes: 22,
  brief: [
    'The platform serves every customer from one stack. It is well built — redundant, multi-zone, autoscaled — and none of that helped last month, when one customer\'s import job produced a query that saturated the shared database and every other customer watched their dashboards time out for ninety minutes.',
    'Redundancy protects you from a component failing. It does nothing about a failure that applies to everything at once: a poison message, a bad configuration, one tenant consuming the shared thing.',
    'Split the platform into independent cells, each serving a subset of customers, sharing nothing behind the router. Then break one on purpose and watch how much of the system stays up.',
  ],
  start: diagram('Cell Division', [
    { id: 'users', def: 'core.client', at: [-420, 200], props: { rps: 1200, region: 'global' } },
    { id: 'net', def: 'core.internet', at: [-210, 200] },
    { id: 'alb', def: 'aws.alb', at: [20, 200] },
    { id: 'app', def: 'aws.ec2', at: [290, 200], props: { replicas: 6, size: 'm5.xlarge', autoscale: true, maxReplicas: 12 } },
    { id: 'db', def: 'aws.rds', at: [570, 200], props: { multiAz: true, backupRetention: 7, size: 'db.m5.xlarge' } },
    { id: 'cw', def: 'aws.cloudwatch', at: [290, 430] },
  ], [
    ['users', 'out', 'net', 'in'],
    ['net', 'out', 'alb', 'in'],
    ['alb', 'out', 'app', 'in'],
    ['app', 'out', 'db', 'in'],
    ['app', 'telemetry', 'cw', 'in'],
  ]),
  startIncidents: [{ nodeId: 'db', modeId: 'long-lock' }],
  objectives: [
    {
      id: 'cells',
      label: 'Run at least three independent application tiers',
      check: (c) => c.count('vm') + c.count('container-service') >= 3,
      hint: 'A cell is a complete copy of the stack, not another replica of the same one. Add two more compute tiers beside the first.',
    },
    {
      id: 'data-per-cell',
      label: 'Give every cell its own data store',
      check: (c) => c.count('relational-db') >= 3,
      hint: 'A shared database is the thing that failed. If every cell talks to it, you have three application tiers and one blast radius.',
    },
    {
      id: 'no-sharing',
      label: 'Share nothing between cells',
      check: (c) => {
        const compute = new Set(
          c.graph.nodes.filter((n) => n.defId === 'aws.ec2' || n.defId === 'aws.ecs-fargate').map((n) => n.id),
        )
        const upstreamsOf = new Map<string, Set<string>>()
        for (const e of c.graph.edges) {
          if (!compute.has(e.source)) continue
          const target = c.graph.nodes.find((n) => n.id === e.target)
          if (target?.defId !== 'aws.rds' && target?.defId !== 'aws.aurora') continue
          const set = upstreamsOf.get(e.target) ?? new Set<string>()
          set.add(e.source)
          upstreamsOf.set(e.target, set)
        }
        return upstreamsOf.size >= 3 && [...upstreamsOf.values()].every((s) => s.size === 1)
      },
      hint: 'Each database should have exactly one application tier connected to it. Two cells sharing a store are one cell wearing two hats.',
    },
    {
      id: 'router',
      label: 'Put a thin router in front that health-checks the cells',
      check: (c) => c.has('cdn') || c.prop('dns-zone', 'healthChecks', true),
      hint: 'Something has to map a customer to a cell and stop sending them to a broken one. A CDN or global entry point in front of all three cells is the version that carries requests; DNS with health checks is the cheaper one.',
    },
    {
      id: 'observability',
      label: 'Keep telemetry from every cell',
      check: (c) => sendsTelemetry(c, 'vm') && sendsTelemetry(c, 'relational-db'),
      hint: 'Per-cell metrics are the point. "The error rate is 12%" is useless if you cannot say which cell it is all coming from.',
    },
    {
      id: 'contained',
      label: 'Keep most of the platform serving while one cell is broken',
      sustained: true,
      check: (c) => c.ranFor(30) && c.metric('totalServed') > 0 && c.metric('errorRate') < 0.1,
      hint: 'The lock contention only affects the cell whose database has it. If your error rate is far above a third, traffic is still reaching the broken cell — or the other cells have no capacity to take their share.',
    },
  ],
  hints: [
    'Build the second cell by copying the first: a load balancer or target group, a compute tier, and its own database. Then the third.',
    'Size each cell for its share plus headroom. Cells that are exactly the right size for their own traffic have no room to absorb anything.',
    'The router is now shared by everyone, which means it must be simpler than what it protects and must keep routing even when its own control plane is unavailable.',
  ],
  debrief: [
    'Cells turn a total failure into a partial one. With three cells the worst case is roughly a third of customers; with eight it is an eighth. That is the entire argument, and it is the only control that works against failures which apply to everything at once.',
    'The costs are real: fixed overhead per cell, no cross-cell joins, and anything that must be globally unique needs a home outside the cells — which becomes the shared component you were trying to avoid. Deployments must also go cell by cell, or one bad release still reaches everyone.',
    'Shuffle sharding is the cheaper relative. Give each customer a random combination of workers rather than a fixed block, and a destructive tenant costs its neighbours one endpoint instead of their whole shard.',
  ],
  concepts: ['cell-based-architecture', 'shuffle-sharding', 'blast-radius', 'multi-tenancy', 'static-stability'],
}

export const MISSIONS: Mission[] = [
  firstContact, singlePoint, blackFriday, lockedOut, theFlood,
  crashLoop, ransomNote, theBill, threeNines, blastRadius,
  thePager, shipIt, pavedRoad, theDrill, cellDivision,
]

export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m]))
