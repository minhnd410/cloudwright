import type { ResourceDef } from '../../schema/types'
import {
  autoscaleProps, backupProps, computePorts, encryptionProp, inPort, outPort,
  publicAccessProp, replicaProp, IDENTITY_IN, TELEMETRY_OUT, TIER_NOTE,
} from '../../schema/presets'

const vpc: ResourceDef = {
  id: 'gcp.vpc',
  provider: 'gcp',
  name: 'VPC Network',
  short: 'VPC',
  archetype: 'vpc',
  category: 'network',
  icon: 'vpc',
  tagline: 'A global network — the one that genuinely differs from the others',
  description:
    'Google\'s VPC is global, not regional. One network spans every region on the planet, and subnets inside it are regional. Two instances in Tokyo and São Paulo on the same VPC talk over private addresses with no peering, no gateway and no VPN. If you come from AWS or Azure this is the single most important difference to internalise, because it changes how multi-region architectures are built.',
  container: {
    accepts: ['subnet', 'firewall', 'nat', 'private-link', 'vpn'],
    label: 'Regional subnets inside a global network',
    size: { width: 780, height: 460 },
    padding: 28,
  },
  ports: [
    inPort('peer-in', 'Peering', ['peering'], { position: 'top' }),
    outPort('peer-out', 'Peering', ['peering'], { position: 'bottom' }),
  ],
  props: [
    {
      key: 'subnetMode',
      label: 'Subnet mode',
      type: 'select',
      default: 'custom',
      help: 'Auto mode creates a subnet in every region automatically; custom mode creates none until you ask.',
      impact: 'Auto mode uses predictable 10.128.0.0/9 ranges that will eventually collide with something you want to peer. Custom mode is the only sensible choice for production.',
      affects: ['scale'],
      options: [
        { value: 'auto', label: 'Auto mode', note: 'Convenient, collision-prone' },
        { value: 'custom', label: 'Custom mode', note: 'You choose every range' },
      ],
    },
    {
      key: 'flowLogs',
      label: 'VPC flow logs',
      type: 'boolean',
      default: false,
      help: 'Samples connection metadata for analysis.',
      impact: 'The forensic trail for a security investigation, and the data behind Network Intelligence Center\'s topology view.',
      affects: ['security', 'cost'],
    },
  ],
  sim: { mitigates: { 'lateral-movement': 0.2 } },
  cost: { note: 'The network is free. Egress and flow log storage are not.' },
  setup: {
    snippets: [
      {
        label: 'gcloud',
        lang: 'bash',
        code: `gcloud compute networks create prod-vpc --subnet-mode=custom

# Subnets are REGIONAL, the network is GLOBAL
gcloud compute networks subnets create app-us \\
  --network=prod-vpc --region=us-central1 --range=10.10.0.0/20 \\
  --secondary-range=pods=10.20.0.0/16,services=10.30.0.0/20 \\
  --enable-private-ip-google-access \\
  --enable-flow-logs

gcloud compute networks subnets create app-eu \\
  --network=prod-vpc --region=europe-west1 --range=10.11.0.0/20

# These two subnets now route to each other privately. No peering needed.`,
      },
    ],
    docs: [{ label: 'VPC overview', url: 'https://cloud.google.com/vpc/docs/vpc' }],
    gotchas: [
      'The network is global and subnets are regional. Cross-region private connectivity is the default, not something you build.',
      'Enable Private Google Access on subnets so instances without external IPs can still reach Google APIs.',
      'Secondary ranges on a subnet are how GKE gets Pod and Service addresses. Plan them when you create the subnet — retrofitting is painful.',
    ],
  },
  concepts: ['vpc-design', 'cidr-subnetting', 'multi-region'],
  keywords: ['vpc', 'network', 'global', 'gcp network'],
}

const gcpSubnet: ResourceDef = {
  id: 'gcp.subnet',
  provider: 'gcp',
  name: 'Subnet',
  short: 'Subnet',
  archetype: 'subnet',
  category: 'network',
  icon: 'subnet',
  tagline: 'A regional range, spanning every zone in that region',
  description:
    'A GCP subnet is regional and automatically covers every zone in the region — you never create a subnet per zone the way you do on AWS. It can also carry secondary ranges, which is how GKE allocates Pod and Service addresses without consuming the primary range.',
  wantsContainer: ['vpc'],
  container: {
    accepts: ['vm', 'vm-scale-set', 'container-service', 'relational-db', 'nosql-db', 'cache', 'k8s-nodepool', 'load-balancer-l7', 'load-balancer-l4', 'serverless-function', 'bastion', 'nat'],
    label: 'Place resources inside',
    size: { width: 320, height: 240 },
    padding: 24,
  },
  ports: [],
  props: [
    {
      key: 'cidr',
      label: 'Primary range',
      type: 'cidr',
      default: '10.10.0.0/20',
      help: 'The address range for virtual machines in this subnet.',
      impact: 'Unusually, a GCP subnet range can be expanded in place without recreating it — a rare and welcome flexibility.',
      affects: ['scale'],
    },
    {
      key: 'privateGoogleAccess',
      label: 'Private Google Access',
      type: 'boolean',
      default: true,
      help: 'Lets instances without external addresses reach Google APIs over internal routing.',
      impact: 'Without it, an instance with no external IP cannot reach Cloud Storage or any Google API at all, which produces a very confusing set of timeouts.',
      affects: ['security'],
    },
    {
      key: 'secondaryRanges',
      label: 'Secondary ranges (GKE)',
      type: 'boolean',
      default: false,
      help: 'Additional ranges used for GKE Pod and Service addresses.',
      impact: 'VPC-native GKE clusters assign Pod IPs from a secondary range, which keeps Pods natively routable without consuming the primary range.',
      affects: ['scale'],
    },
  ],
  sim: {},
  setup: {
    gotchas: [
      'A subnet covers the whole region, all zones. There is no per-zone subnet.',
      'You can expand a subnet range in place — but never shrink it.',
      'Private Google Access is per-subnet and off by default on custom subnets.',
    ],
    docs: [{ label: 'Subnets', url: 'https://cloud.google.com/vpc/docs/subnets' }],
  },
  concepts: ['cidr-subnetting', 'availability-zones', 'private-connectivity'],
  keywords: ['subnet', 'regional', 'secondary range'],
}

const firewall: ResourceDef = {
  id: 'gcp.firewall',
  provider: 'gcp',
  name: 'VPC Firewall Rule',
  short: 'Firewall',
  archetype: 'firewall',
  category: 'security',
  icon: 'shield',
  tagline: 'Stateful rules targeted by tag or service account',
  description:
    'GCP firewall rules are stateful and attach to the network, but they select which instances they apply to by network tag or, better, by service account. Targeting a service account is stronger than tagging: a tag is metadata anyone with instance edit permission can add, while a service account is an identity you control through IAM.',
  wantsContainer: ['vpc'],
  ports: [
    inPort('in', 'Traffic to inspect', ['http', 'tcp', 'udp', 'sql', 'nosql', 'cache']),
    outPort('out', 'Allowed traffic', ['http', 'tcp', 'udp', 'sql', 'nosql', 'cache']),
  ],
  props: [
    {
      key: 'targeting',
      label: 'Rule target',
      type: 'select',
      default: 'service-account',
      help: 'How the rule selects which instances it protects.',
      impact:
        'Service-account targeting is identity-based and cannot be self-granted by anyone who can edit an instance. Network tags can be added by anyone with instance edit permission, which quietly makes them a privilege escalation path.',
      affects: ['security'],
      options: [
        { value: 'all', label: 'All instances in the network' },
        { value: 'tag', label: 'Network tag', note: 'Anyone with instance edit can add one' },
        { value: 'service-account', label: 'Service account', note: 'Identity-based, recommended' },
      ],
    },
    {
      key: 'sourceRange',
      label: 'Source',
      type: 'select',
      default: 'internal',
      help: 'Where connections may originate.',
      impact: 'The default network in a new project allows SSH from anywhere. It is the first thing to remove.',
      affects: ['security'],
      options: [
        { value: 'internal', label: 'Internal ranges' },
        { value: 'lb', label: 'Load balancer health-check ranges', note: '35.191.0.0/16, 130.211.0.0/22' },
        { value: 'iap', label: 'IAP range only', note: '35.235.240.0/20 — for admin access' },
        { value: 'world', label: '0.0.0.0/0', note: 'Public HTTPS only' },
      ],
      danger: (v) => (v === 'world' ? 'Open to the entire internet. Only correct for a public HTTPS listener.' : null),
    },
    {
      key: 'egressDeny',
      label: 'Deny egress by default',
      type: 'boolean',
      default: false,
      help: 'Blocks outbound traffic unless a higher-priority rule allows it.',
      impact: 'Stops a compromised workload calling out to a command-and-control server or copying data out. Egress is allowed by default until you change it.',
      affects: ['security'],
    },
  ],
  sim: { mitigates: { 'port-scan': 0.85, 'lateral-movement': 0.65, 'data-exfiltration': 0.35, ransomware: 0.35 } },
  cost: { note: 'Free.' },
  setup: {
    snippets: [
      {
        label: 'gcloud',
        lang: 'bash',
        code: `# Target by service account, not by tag.
gcloud compute firewall-rules create allow-lb-to-app \\
  --network=prod-vpc --direction=INGRESS --priority=1000 \\
  --action=ALLOW --rules=tcp:8080 \\
  --source-ranges=35.191.0.0/16,130.211.0.0/22 \\
  --target-service-accounts=app@project.iam.gserviceaccount.com

# Admin access via IAP — no bastion, no public IP, and it is audited.
gcloud compute firewall-rules create allow-iap-ssh \\
  --network=prod-vpc --direction=INGRESS --priority=1000 \\
  --action=ALLOW --rules=tcp:22 \\
  --source-ranges=35.235.240.0/20

gcloud compute ssh app-1 --tunnel-through-iap`,
      },
    ],
    docs: [{ label: 'VPC firewall rules', url: 'https://cloud.google.com/firewall/docs/firewalls' }],
    gotchas: [
      'Allow the health check ranges 35.191.0.0/16 and 130.211.0.0/22 or every backend shows as unhealthy with no other symptom.',
      'The default network permits SSH from anywhere. Delete those rules in every new project.',
      'Use Identity-Aware Proxy for administrative access. No public IP, no bastion, and every session is tied to a user identity.',
    ],
  },
  concepts: ['stateful-vs-stateless-firewall', 'least-privilege-network', 'zero-trust'],
  keywords: ['firewall', 'gcp firewall', 'network tag', 'iap'],
}

const globalLb: ResourceDef = {
  id: 'gcp.load-balancer',
  provider: 'gcp',
  name: 'Global Application Load Balancer',
  short: 'Global LB',
  archetype: 'load-balancer-l7',
  category: 'edge',
  icon: 'balancer',
  tagline: 'One anycast IP that works from everywhere on earth',
  description:
    'Google\'s global external Application Load Balancer gives you a single anycast IP address announced from every Google edge location. A user in Sydney and a user in Dublin hit the same address, enter Google\'s network at their nearest edge, and are routed over Google\'s private backbone to the closest healthy backend. Regional failover is automatic and needs no DNS change at all, which is a meaningfully different model from the DNS-based failover the other providers rely on.',
  ports: [
    inPort('in', 'Client requests', ['http', 'grpc']),
    outPort('out', 'To backends', ['http', 'grpc', 'object']),
    inPort('cert', 'TLS certificate', ['tls-cert'], { position: 'top' }),
    TELEMETRY_OUT,
  ],
  props: [
    {
      key: 'cdn',
      label: 'Cloud CDN',
      type: 'boolean',
      default: true,
      help: 'Caches responses at Google\'s edge locations.',
      impact: 'Enabled with one flag on an existing backend. Cache hits are served at the edge and never reach your origin.',
      affects: ['latency', 'cost', 'capacity'],
    },
    {
      key: 'cloudArmor',
      label: 'Cloud Armor',
      type: 'boolean',
      default: false,
      help: 'WAF and DDoS policy applied at the edge, before traffic enters your network.',
      impact: 'Pre-configured rules cover the OWASP top ten; rate limiting and geo-blocking are policy expressions. Enforcement happens at the edge, so blocked traffic costs you nothing downstream.',
      affects: ['security', 'cost'],
    },
    {
      key: 'backendPolicy',
      label: 'Backend selection',
      type: 'select',
      default: 'nearest',
      help: 'How the load balancer picks among healthy backends.',
      impact: 'Nearest-with-overflow sends users to their closest region and spills to the next when it is at capacity — a behaviour that is genuinely hard to reproduce with DNS-based routing.',
      affects: ['latency', 'availability'],
      options: [
        { value: 'nearest', label: 'Nearest with overflow' },
        { value: 'weighted', label: 'Weighted split', note: 'For canary releases' },
      ],
    },
  ],
  sim: {
    capacity: 2000000,
    latencyMs: 6,
    availability: 0.9999,
    mitigates: { 'volumetric-ddos': 0.98 },
    failureModes: [
      { id: 'unhealthy', label: 'All backends unhealthy', symptom: 'HTTP 502; backend health shows everything failing.', remedy: 'The usual cause is a firewall rule not allowing the health check ranges 35.191.0.0/16 and 130.211.0.0/22.' },
    ],
  },
  cost: { hourly: () => 0.025, perGbEgress: () => 0.08, note: `Forwarding rule charge plus data processing and egress. ${TIER_NOTE}` },
  setup: {
    snippets: [
      {
        label: 'gcloud',
        lang: 'bash',
        code: `gcloud compute addresses create web-ip --global

gcloud compute backend-services create web-backend \\
  --global --protocol=HTTP --port-name=http \\
  --health-checks=web-hc --enable-cdn

gcloud compute backend-services add-backend web-backend --global \\
  --instance-group=web-us --instance-group-region=us-central1
gcloud compute backend-services add-backend web-backend --global \\
  --instance-group=web-eu --instance-group-region=europe-west1

# Google-managed certificate — issued and renewed automatically
gcloud compute ssl-certificates create web-cert \\
  --domains=app.example.com --global

# One anycast IP now serves both regions with automatic failover.`,
      },
    ],
    docs: [{ label: 'External Application Load Balancer', url: 'https://cloud.google.com/load-balancing/docs/https' }],
    gotchas: [
      'Allow the health check source ranges in your firewall. This is the single most common reason a new load balancer returns 502.',
      'Google-managed certificates need the DNS record pointing at the load balancer before provisioning completes. It can take up to an hour.',
      'Global forwarding rules can take several minutes to propagate. Do not judge a change in the first sixty seconds.',
    ],
  },
  concepts: ['load-balancing', 'anycast', 'multi-region', 'cdn'],
  keywords: ['load balancer', 'global', 'anycast', 'cloud cdn', 'cloud armor'],
}

const gce: ResourceDef = {
  id: 'gcp.compute-engine',
  provider: 'gcp',
  name: 'Compute Engine',
  short: 'GCE',
  archetype: 'vm',
  category: 'compute',
  icon: 'server',
  tagline: 'Virtual machines with custom sizing and automatic discounts',
  description:
    'Google\'s virtual machines, with two properties the others lack. Machine types can be custom — you specify exactly how many vCPUs and how much memory rather than picking from a fixed ladder — and sustained use discounts apply automatically, with no commitment, once an instance runs for a meaningful part of the month.',
  wantsContainer: ['subnet'],
  ports: computePorts(),
  props: [
    {
      key: 'machineType',
      label: 'Machine type',
      type: 'select',
      default: 'e2-standard-2',
      help: 'The CPU and memory shape. Custom shapes are also available.',
      impact: 'E2 offers the best price for general workloads, N2 more consistent performance, C3 the highest per-core throughput. Custom types let you avoid paying for memory you do not use.',
      affects: ['capacity', 'cost', 'latency'],
      options: [
        { value: 'e2-small', label: 'e2-small (2 vCPU / 2 GB)', meta: { rps: 250, hourly: 0.0335 } },
        { value: 'e2-standard-2', label: 'e2-standard-2 (2 vCPU / 8 GB)', meta: { rps: 800, hourly: 0.067 } },
        { value: 'n2-standard-4', label: 'n2-standard-4 (4 vCPU / 16 GB)', meta: { rps: 1700, hourly: 0.194 } },
        { value: 'c3-highcpu-8', label: 'c3-highcpu-8 (8 vCPU / 16 GB)', meta: { rps: 4000, hourly: 0.34 } },
      ],
    },
    replicaProp(),
    ...autoscaleProps(),
    {
      key: 'spot',
      label: 'Spot VMs',
      type: 'boolean',
      default: false,
      help: 'Heavily discounted capacity that can be reclaimed at any time with 30 seconds of notice.',
      impact: '60–91% cheaper. Thirty seconds is less warning than other providers give, so graceful shutdown handling has to actually work.',
      affects: ['cost', 'availability'],
    },
    {
      key: 'shieldedVm',
      label: 'Shielded VM',
      type: 'boolean',
      default: true,
      help: 'Secure boot, virtual TPM and integrity monitoring.',
      impact: 'Detects boot-level and kernel-level tampering — the persistence mechanisms an attacker uses to survive a reboot.',
      affects: ['security'],
    },
    {
      key: 'externalIp',
      label: 'External IP',
      type: 'boolean',
      default: false,
      help: 'Gives the instance a public address.',
      impact: 'Rarely needed. Use Private Google Access for Google APIs, Cloud NAT for the internet, and IAP for administrative access.',
      affects: ['security'],
      danger: (v) => (v === true ? 'A directly reachable instance. Use Cloud NAT for egress and IAP for administration instead.' : null),
    },
  ],
  sim: {
    capacity: 800,
    latencyMs: 17,
    availability: 0.995,
    vulnerableTo: ['lateral-movement', 'privilege-escalation', 'port-scan', 'ssrf'],
    failureModes: [
      { id: 'preempt', label: 'Spot VM preempted', symptom: 'Instance terminated with about 30 seconds of notice.', remedy: 'Handle the shutdown signal, drain connections, and keep a base of standard instances for critical capacity.' },
      { id: 'live-migrate', label: 'Live migration', symptom: 'A brief performance dip during host maintenance, with no downtime.', remedy: 'Expected. GCE live-migrates instances during maintenance rather than stopping them — a genuine advantage.' },
    ],
  },
  cost: {
    hourly: (p) => {
      const base = { 'e2-small': 0.0335, 'e2-standard-2': 0.067, 'n2-standard-4': 0.194, 'c3-highcpu-8': 0.34 }[String(p.machineType)] ?? 0.067
      return base * Number(p.replicas ?? 1) * (p.spot ? 0.25 : 1)
    },
    note: `Sustained use discounts apply automatically — up to 30% for an instance running all month, with no commitment. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'gcloud',
        lang: 'bash',
        code: `gcloud compute instances create app-1 \\
  --machine-type=e2-standard-2 \\
  --subnet=app-us --no-address \\
  --service-account=app@project.iam.gserviceaccount.com \\
  --scopes=cloud-platform \\
  --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring \\
  --image-family=debian-12 --image-project=debian-cloud

# Managed instance group with autohealing — the health check
# recreates unhealthy instances, not just removes them from the LB.
gcloud compute instance-groups managed create web-us \\
  --template=web-template --size=3 --region=us-central1
gcloud compute instance-groups managed set-autohealing web-us \\
  --region=us-central1 --health-check=web-hc --initial-delay=300`,
      },
    ],
    docs: [{ label: 'Compute Engine', url: 'https://cloud.google.com/compute/docs' }],
    gotchas: [
      'Regional managed instance groups spread across zones automatically. Zonal groups do not — and that is the default if you use the zonal command.',
      'Autohealing recreates unhealthy instances. Set the initial delay longer than your boot time or healthy instances get killed while still starting.',
      'Attach a service account with narrow IAM roles rather than using the default Compute Engine service account, which is broadly privileged.',
    ],
  },
  concepts: ['compute-models', 'autoscaling', 'availability-zones', 'self-healing'],
  keywords: ['compute engine', 'gce', 'vm', 'instance', 'mig'],
}

const cloudRun: ResourceDef = {
  id: 'gcp.cloud-run',
  provider: 'gcp',
  name: 'Cloud Run',
  short: 'Cloud Run',
  archetype: 'container-service',
  category: 'compute',
  icon: 'container',
  tagline: 'A container, a URL, and a bill of zero when nobody calls it',
  description:
    'Deploy a container that listens on a port and Cloud Run gives you an HTTPS endpoint, automatic scaling from zero to thousands of instances, and per-request billing. Its distinguishing feature is concurrency: unlike most function platforms, one Cloud Run instance handles many simultaneous requests, which makes it dramatically cheaper for I/O-bound work.',
  ports: computePorts(),
  props: [
    {
      key: 'cpu',
      label: 'CPU per instance',
      type: 'select',
      default: '1',
      help: 'vCPU allocated to each container instance.',
      impact: 'Billed per 100ms of use. With CPU throttling on, you are only charged while a request is being handled.',
      affects: ['capacity', 'cost'],
      options: [
        { value: '0.5', label: '0.5 vCPU / 512 MB', meta: { rps: 150, hourly: 0.012 } },
        { value: '1', label: '1 vCPU / 1 GB', meta: { rps: 350, hourly: 0.024 } },
        { value: '2', label: '2 vCPU / 2 GB', meta: { rps: 750, hourly: 0.048 } },
        { value: '4', label: '4 vCPU / 4 GB', meta: { rps: 1500, hourly: 0.096 } },
      ],
    },
    {
      key: 'concurrency',
      label: 'Concurrency per instance',
      type: 'number',
      default: 80,
      min: 1,
      max: 1000,
      help: 'How many requests one instance handles simultaneously.',
      impact:
        'The number that decides your bill. At a concurrency of 1 you behave like a traditional function platform and pay accordingly. At 80, one instance serves 80 concurrent requests — for an I/O-bound service that is an order of magnitude cheaper. Set it too high and requests queue inside an overloaded container.',
      affects: ['capacity', 'cost', 'latency'],
    },
    {
      key: 'minInstances',
      label: 'Minimum instances',
      type: 'number',
      default: 0,
      min: 0,
      max: 100,
      help: 'Instances kept warm at all times.',
      impact: 'Zero means free when idle and a cold start on the next request. One or more removes the cold start for a small fixed cost.',
      affects: ['latency', 'cost'],
    },
    {
      key: 'ingress',
      label: 'Ingress',
      type: 'select',
      default: 'all',
      help: 'Who may reach the service.',
      impact: 'Internal-only restricts access to your VPC and the load balancer, which is how you put Cloud Armor in front and remove the public URL entirely.',
      affects: ['security'],
      options: [
        { value: 'all', label: 'Public', note: 'Anyone with the URL' },
        { value: 'internal-lb', label: 'Internal + load balancer', note: 'Behind Cloud Armor' },
        { value: 'internal', label: 'Internal only' },
      ],
    },
  ],
  sim: {
    capacity: 350,
    latencyMs: 13,
    availability: 0.9995,
    vulnerableTo: ['supply-chain', 'ssrf'],
    failureModes: [
      { id: 'cold-start', label: 'Cold start', symptom: 'The first request after idle takes noticeably longer.', remedy: 'Set minimum instances above zero, or accept it for background work.' },
      { id: 'concurrency-overload', label: 'Queueing inside the container', symptom: 'Latency climbs while instance count stays flat.', remedy: 'Concurrency is set too high for what the container can actually handle. Lower it so scaling kicks in sooner.' },
    ],
  },
  cost: {
    hourly: (p) => ({ '0.5': 0.012, '1': 0.024, '2': 0.048, '4': 0.096 }[String(p.cpu)] ?? 0.024) * Math.max(Number(p.minInstances ?? 0), 0.1),
    perMillionRequests: () => 0.4,
    note: `Per 100ms of vCPU and memory while handling requests, plus $0.40 per million requests. Generous free tier. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'gcloud',
        lang: 'bash',
        code: `gcloud run deploy web \\
  --image=us-docker.pkg.dev/project/repo/web:$GIT_SHA \\
  --region=us-central1 \\
  --cpu=1 --memory=1Gi \\
  --concurrency=80 \\
  --min-instances=1 --max-instances=100 \\
  --service-account=web@project.iam.gserviceaccount.com \\
  --set-secrets=DB_PASSWORD=db-password:latest \\
  --vpc-connector=prod-connector --vpc-egress=private-ranges-only \\
  --ingress=internal-and-cloud-load-balancing \\
  --no-allow-unauthenticated

# Canary: 10% to the new revision, then promote when it looks good
gcloud run services update-traffic web --to-revisions=web-00042-abc=10`,
      },
    ],
    docs: [{ label: 'Cloud Run', url: 'https://cloud.google.com/run/docs' }],
    gotchas: [
      'Concurrency is the single most important setting. The platform default of 80 is often right and is very different from a per-request function model.',
      'Reaching a private Cloud SQL instance or anything in your VPC needs a VPC connector or Direct VPC egress.',
      'Traffic splitting across revisions is built in, so canary deploys need no extra tooling.',
    ],
  },
  concepts: ['containers', 'serverless', 'cold-starts', 'deployment-strategies'],
  keywords: ['cloud run', 'serverless', 'container', 'knative', 'concurrency'],
}

const cloudSql: ResourceDef = {
  id: 'gcp.cloud-sql',
  provider: 'gcp',
  name: 'Cloud SQL',
  short: 'Cloud SQL',
  archetype: 'relational-db',
  category: 'database',
  icon: 'database',
  tagline: 'Managed Postgres, MySQL and SQL Server',
  description:
    'Google\'s managed relational database. Its most distinctive operational feature is the Cloud SQL Auth Proxy: a small sidecar that authenticates with IAM and opens an encrypted tunnel, so your application connects to localhost and the database never needs a public address or an allow-listed IP at all.',
  wantsContainer: ['subnet'],
  ports: [
    inPort('in', 'SQL connections', ['sql']),
    outPort('replica', 'Read replicas', ['sql'], { position: 'bottom' }),
    IDENTITY_IN,
    TELEMETRY_OUT,
  ],
  props: [
    {
      key: 'tier',
      label: 'Machine type',
      type: 'select',
      default: 'db-custom-2-8',
      help: 'CPU and memory. Custom shapes are available here too.',
      impact: 'Memory governs the buffer pool, which governs how much of your working set is served without touching disk.',
      affects: ['capacity', 'cost', 'latency'],
      options: [
        { value: 'db-f1-micro', label: 'db-f1-micro', meta: { rps: 100, hourly: 0.015 }, note: 'Development only' },
        { value: 'db-custom-2-8', label: '2 vCPU / 8 GB', meta: { rps: 1200, hourly: 0.21 } },
        { value: 'db-custom-4-16', label: '4 vCPU / 16 GB', meta: { rps: 2400, hourly: 0.42 } },
        { value: 'db-custom-8-32', label: '8 vCPU / 32 GB', meta: { rps: 4800, hourly: 0.84 } },
      ],
    },
    {
      key: 'highAvailability',
      label: 'High availability (regional)',
      type: 'boolean',
      default: false,
      help: 'A synchronous standby in another zone with automatic failover.',
      impact: 'Failover typically completes in under a minute. Doubles the cost, and is the difference between a zone outage being an incident and being an outage.',
      affects: ['availability', 'cost'],
    },
    {
      key: 'readReplicas',
      label: 'Read replicas',
      type: 'number',
      default: 0,
      min: 0,
      max: 10,
      help: 'Asynchronous read-only copies, optionally in other regions.',
      impact: 'Scales reads and gives you a cross-region disaster recovery target you can promote.',
      affects: ['capacity', 'cost'],
    },
    publicAccessProp({
      help: 'Whether the instance has a public IP with authorised networks.',
      impact: 'Use private IP plus the Auth Proxy instead. IAM decides who connects, so there is no address list to maintain and nothing exposed.',
    }),
    encryptionProp(),
    ...backupProps(),
  ],
  sim: {
    capacity: 1200,
    latencyMs: 8,
    stateful: true,
    availability: 0.995,
    vulnerableTo: ['sql-injection', 'data-exfiltration', 'ransomware'],
    failureModes: [
      { id: 'conn-limit', label: 'Connection limit reached', symptom: 'New connections refused while CPU is low.', remedy: 'Use the Auth Proxy with a pooler, or PgBouncer. Serverless compute exhausts connections fast.' },
      { id: 'failover', label: 'Regional failover', symptom: 'Writes fail for under a minute, then recover.', remedy: 'Expected. Applications need connection retry — existing connections are dropped.' },
    ],
  },
  cost: {
    hourly: (p) => {
      const base = { 'db-f1-micro': 0.015, 'db-custom-2-8': 0.21, 'db-custom-4-16': 0.42, 'db-custom-8-32': 0.84 }[String(p.tier)] ?? 0.21
      return base * (p.highAvailability ? 2 : 1) + base * 0.7 * Number(p.readReplicas ?? 0)
    },
    perGbMonth: () => 0.17,
    note: `Committed use discounts reduce this substantially. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'gcloud',
        lang: 'bash',
        code: `gcloud sql instances create prod-pg \\
  --database-version=POSTGRES_16 \\
  --tier=db-custom-2-8 --region=us-central1 \\
  --availability-type=REGIONAL \\
  --no-assign-ip --network=prod-vpc \\
  --backup-start-time=03:00 --enable-point-in-time-recovery \\
  --deletion-protection`,
      },
      {
        label: 'Auth Proxy — no IP allow-list at all',
        lang: 'bash',
        code: `# The proxy authenticates with IAM and opens an encrypted tunnel.
# The database needs no public IP and no authorised networks.
cloud-sql-proxy --private-ip project:us-central1:prod-pg &
psql "host=127.0.0.1 port=5432 dbname=app user=app"

# As a sidecar in Kubernetes:
#   - name: cloud-sql-proxy
#     image: gcr.io/cloud-sql-connectors/cloud-sql-proxy:2
#     args: ["--private-ip", "--structured-logs", "project:region:instance"]
#     securityContext: { runAsNonRoot: true }`,
      },
    ],
    docs: [{ label: 'Cloud SQL', url: 'https://cloud.google.com/sql/docs' }],
    gotchas: [
      'Use the Auth Proxy or the language connectors. They handle TLS and IAM authentication and remove the need for any IP allow-list.',
      'Read replicas can be promoted but cannot be demoted back. Promotion is a one-way door.',
      'Turn on point-in-time recovery. Daily backups alone mean up to a day of data loss.',
    ],
  },
  concepts: ['acid-transactions', 'read-replicas', 'private-connectivity', 'rpo-rto'],
  keywords: ['cloud sql', 'postgres', 'mysql', 'database'],
}

const firestore: ResourceDef = {
  id: 'gcp.firestore',
  provider: 'gcp',
  name: 'Firestore',
  short: 'Firestore',
  archetype: 'nosql-db',
  category: 'database',
  icon: 'table',
  tagline: 'Document database with real-time listeners and offline sync',
  description:
    'A serverless document database whose defining feature is the real-time listener: a client subscribes to a query and receives updates as they happen, with offline caching and automatic resynchronisation handled by the SDK. It also has security rules — a declarative language evaluated server-side — which let a mobile client talk to the database directly without an API tier in between.',
  ports: [
    inPort('in', 'Document operations', ['nosql']),
    outPort('trigger', 'Change triggers', ['stream'], { position: 'bottom' }),
    IDENTITY_IN,
  ],
  props: [
    {
      key: 'mode',
      label: 'Mode',
      type: 'select',
      default: 'native',
      help: 'Native mode adds real-time listeners and offline support; Datastore mode is the older, higher-throughput API.',
      impact: 'The mode is chosen once per database and cannot be changed.',
      affects: ['capacity'],
      options: [
        { value: 'native', label: 'Native mode', note: 'Real-time, offline, security rules' },
        { value: 'datastore', label: 'Datastore mode', note: 'Higher write throughput' },
      ],
    },
    {
      key: 'securityRules',
      label: 'Security rules',
      type: 'select',
      default: 'scoped',
      help: 'Server-side rules deciding what each authenticated client may read and write.',
      impact:
        'These rules are the entire authorisation layer when clients talk to Firestore directly. A test-mode rule set that allows any read and write is genuinely open to the world, and plenty of applications have shipped that way.',
      affects: ['security'],
      options: [
        { value: 'open', label: 'Test mode (allow all)', note: 'Publicly readable and writable' },
        { value: 'auth', label: 'Any signed-in user', note: 'Any account reads everything' },
        { value: 'scoped', label: 'Per-document ownership', note: 'What you want' },
      ],
      danger: (v) => {
        if (v === 'open') return 'Test-mode rules allow anyone on the internet to read and write your entire database.'
        if (v === 'auth') return 'Any signed-in user can read every document, including other users\' data.'
        return null
      },
    },
    {
      key: 'multiRegion',
      label: 'Multi-region location',
      type: 'boolean',
      default: false,
      help: 'Replicates synchronously across regions.',
      impact: 'Survives a region loss with no data loss, at higher cost and slightly higher write latency.',
      affects: ['availability', 'cost'],
    },
  ],
  sim: {
    capacity: 10000,
    latencyMs: 12,
    stateful: true,
    availability: 0.9999,
    vulnerableTo: ['data-exfiltration'],
    failureModes: [
      { id: 'hot-doc', label: 'Hot document contention', symptom: 'Write latency climbs on a single frequently-updated document.', remedy: 'A single document supports roughly one write per second sustained. Use distributed counters for high-frequency updates.' },
      { id: 'missing-index', label: 'Query needs a composite index', symptom: 'The query fails with an error containing a link that creates the index.', remedy: 'Click the link, or declare indexes in firestore.indexes.json so they deploy with the code.' },
    ],
  },
  cost: { perMillionRequests: () => 600, perGbMonth: () => 0.18, note: `About $0.06 per 100k reads and $0.18 per 100k writes. ${TIER_NOTE}` },
  setup: {
    snippets: [
      {
        label: 'Security rules that actually scope access',
        lang: 'text',
        code: `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Each user reads and writes only their own document.
    match /users/{userId} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;
    }

    // Orders are readable by their owner and writable only by a backend
    // service account — clients can never mutate an order directly.
    match /orders/{orderId} {
      allow read:  if request.auth != null
                   && resource.data.userId == request.auth.uid;
      allow write: if request.auth.token.admin == true;
    }

    // Everything not matched above is denied.
  }
}`,
      },
    ],
    docs: [{ label: 'Firestore security rules', url: 'https://firebase.google.com/docs/firestore/security/get-started' }],
    gotchas: [
      'Security rules are your only authorisation layer when clients connect directly. Test them — the emulator supports unit tests for rules.',
      'A single document sustains roughly one write per second. High-frequency counters need sharding.',
      'Rules are not filters. A query that could return documents the rules forbid fails entirely rather than returning a subset.',
    ],
  },
  concepts: ['nosql-modelling', 'authn-vs-authz', 'eventual-consistency'],
  keywords: ['firestore', 'firebase', 'document', 'nosql', 'realtime'],
}

const gcs: ResourceDef = {
  id: 'gcp.cloud-storage',
  provider: 'gcp',
  name: 'Cloud Storage',
  short: 'GCS',
  archetype: 'object-store',
  category: 'storage',
  icon: 'bucket',
  tagline: 'Object storage with one API across every storage class',
  description:
    'Google\'s object store. Its cleanest design decision is that every storage class — Standard through Archive — uses the same API with the same millisecond latency; only the price of storing versus reading changes. There is no rehydration step and no waiting hours for an archive restore, which makes lifecycle policies much less risky to adopt.',
  ports: [
    inPort('in', 'Object operations', ['object']),
    outPort('event', 'Pub/Sub notifications', ['queue', 'stream'], { position: 'bottom' }),
    IDENTITY_IN,
  ],
  props: [
    {
      key: 'uniformAccess',
      label: 'Uniform bucket-level access',
      type: 'boolean',
      default: true,
      help: 'Disables per-object ACLs so IAM is the only access control.',
      impact:
        'Per-object ACLs are how buckets leak: a single object gets marked public and nobody notices because the bucket policy still looks correct. Uniform access makes that impossible.',
      affects: ['security'],
      danger: (v) => (v === false ? 'Per-object ACLs are enabled. One object can be made public without any change to the bucket policy.' : null),
    },
    {
      key: 'storageClass',
      label: 'Storage class',
      type: 'select',
      default: 'standard',
      help: 'The trade between storage price and retrieval price.',
      impact: 'Every class has the same API and the same latency. Colder classes have minimum storage durations and retrieval charges instead.',
      affects: ['cost'],
      options: [
        { value: 'standard', label: 'Standard', note: '$0.020/GB-month' },
        { value: 'nearline', label: 'Nearline', note: '30-day minimum' },
        { value: 'coldline', label: 'Coldline', note: '90-day minimum' },
        { value: 'archive', label: 'Archive', note: '365-day minimum, still millisecond access' },
      ],
    },
    {
      key: 'versioning',
      label: 'Object versioning',
      type: 'boolean',
      default: false,
      help: 'Retains previous generations of overwritten and deleted objects.',
      impact: 'Your recovery path from a bad deploy or a malicious delete.',
      affects: ['durability', 'cost'],
    },
    {
      key: 'retentionLock',
      label: 'Retention policy lock',
      type: 'boolean',
      default: false,
      help: 'Makes objects immutable for a set period, and the policy itself permanent.',
      impact:
        'Once locked, not even a project owner can delete the data before the retention period expires. That is precisely what makes it a real ransomware control — and why it deserves care, because it genuinely cannot be undone.',
      affects: ['durability', 'security'],
    },
  ],
  sim: {
    capacity: 90000,
    latencyMs: 24,
    stateful: true,
    availability: 0.9999,
    vulnerableTo: ['data-exfiltration', 'ransomware'],
  },
  cost: {
    perGbMonth: (p) => ({ standard: 0.02, nearline: 0.01, coldline: 0.004, archive: 0.0012 }[String(p.storageClass)] ?? 0.02),
    perGbEgress: () => 0.12,
    note: `Egress to the internet is the charge that surprises people. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'gcloud',
        lang: 'bash',
        code: `gcloud storage buckets create gs://prod-assets \\
  --location=US --uniform-bucket-level-access \\
  --public-access-prevention

gcloud storage buckets update gs://prod-assets --versioning

# Lifecycle: tier down as data ages, expire old versions
cat > lifecycle.json <<'JSON'
{"rule":[
  {"action":{"type":"SetStorageClass","storageClass":"NEARLINE"},
   "condition":{"age":30}},
  {"action":{"type":"Delete"},
   "condition":{"daysSinceNoncurrentTime":90}}
]}
JSON
gcloud storage buckets update gs://prod-assets --lifecycle-file=lifecycle.json`,
      },
    ],
    docs: [{ label: 'Cloud Storage', url: 'https://cloud.google.com/storage/docs' }],
    gotchas: [
      'Turn on public access prevention and uniform bucket-level access at creation. Both are far easier to set than to retrofit.',
      'Colder classes have minimum storage durations. Deleting a Coldline object after a week still bills you for ninety days.',
      'Bucket names are globally unique across all of Google Cloud.',
    ],
  },
  concepts: ['object-storage', 'data-durability', 'ransomware-resilience', 'least-privilege'],
  keywords: ['cloud storage', 'gcs', 'bucket', 'object'],
}

const pubsub: ResourceDef = {
  id: 'gcp.pubsub',
  provider: 'gcp',
  name: 'Pub/Sub',
  short: 'Pub/Sub',
  archetype: 'queue',
  category: 'messaging',
  icon: 'queue',
  tagline: 'Global messaging that is a queue and a stream at once',
  description:
    'Publishers write to a topic; each subscription receives its own independent copy of every message. That makes one service behave as a queue when there is one subscription and as a fan-out stream when there are many — and subscriptions can replay from a snapshot or seek back in time. It is global by default, with no capacity to provision.',
  ports: [
    inPort('in', 'Publish', ['queue', 'stream']),
    outPort('out', 'Subscriptions', ['queue', 'stream']),
    outPort('dlq', 'Dead letter', ['queue'], { position: 'bottom' }),
    IDENTITY_IN,
  ],
  props: [
    {
      key: 'deliveryMode',
      label: 'Delivery mode',
      type: 'select',
      default: 'push',
      help: 'Whether Pub/Sub pushes to an endpoint or your consumer pulls.',
      impact: 'Push suits Cloud Run and Functions and scales with them automatically. Pull gives the consumer control over its own rate, which matters when the downstream system is fragile.',
      affects: ['capacity'],
      options: [
        { value: 'push', label: 'Push to HTTPS endpoint' },
        { value: 'pull', label: 'Pull', note: 'Consumer controls the rate' },
      ],
    },
    {
      key: 'orderingKeys',
      label: 'Ordering keys',
      type: 'boolean',
      default: false,
      help: 'Guarantees ordered delivery for messages sharing a key.',
      impact: 'Ordering per entity while unrelated messages still flow in parallel. It does reduce throughput and pins delivery to a region.',
      affects: ['capacity'],
    },
    {
      key: 'deadLetter',
      label: 'Dead letter topic',
      type: 'boolean',
      default: false,
      help: 'Moves messages aside after repeated delivery failures.',
      impact: 'Without one, a message that always fails is redelivered until the retention period expires, consuming capacity the whole time.',
      affects: ['availability'],
      danger: (v) => (v === false ? 'No dead letter topic. A permanently failing message is redelivered for the full retention period.' : null),
    },
    {
      key: 'retentionDays',
      label: 'Message retention',
      type: 'number',
      default: 7,
      min: 1,
      max: 31,
      unit: ' days',
      help: 'How long messages are retained, including for replay.',
      impact: 'Retention plus snapshots means you can rewind a subscription and reprocess after fixing a consumer bug.',
      affects: ['durability'],
    },
  ],
  sim: {
    capacity: 200000,
    latencyMs: 12,
    stateful: true,
    availability: 0.9999,
    failureModes: [
      { id: 'redelivery', label: 'Repeated redelivery', symptom: 'The same message arrives many times; the acknowledgement deadline keeps expiring.', remedy: 'Extend the ack deadline or acknowledge sooner. Consumers must be idempotent — delivery is at-least-once.' },
      { id: 'backlog', label: 'Subscription backlog growing', symptom: 'The oldest unacknowledged message age climbs steadily.', remedy: 'Scale consumers on backlog size. Pub/Sub will hold the messages; your consumer is the constraint.' },
    ],
  },
  cost: { perGbMonth: () => 40, note: `About $40 per TB of message throughput. ${TIER_NOTE}` },
  setup: {
    snippets: [
      {
        label: 'gcloud',
        lang: 'bash',
        code: `gcloud pubsub topics create orders
gcloud pubsub topics create orders-dlq

gcloud pubsub subscriptions create orders-worker \\
  --topic=orders \\
  --ack-deadline=60 \\
  --message-retention-duration=7d \\
  --dead-letter-topic=orders-dlq --max-delivery-attempts=5 \\
  --push-endpoint=https://worker-abc.run.app/events \\
  --push-auth-service-account=pubsub-invoker@project.iam.gserviceaccount.com

# Replay: rewind this subscription to an earlier point in time
gcloud pubsub subscriptions seek orders-worker --time=2026-09-14T10:00:00Z`,
      },
    ],
    docs: [{ label: 'Pub/Sub', url: 'https://cloud.google.com/pubsub/docs/overview' }],
    gotchas: [
      'Delivery is at-least-once. Duplicates are part of the contract, so consumers must be idempotent.',
      'Each subscription gets its own copy. Adding a subscriber never affects the existing ones.',
      'Seek and snapshots let you replay history. That is the feature that turns a bad deploy into a reprocessing job instead of data loss.',
    ],
  },
  concepts: ['async-messaging', 'event-streaming', 'idempotency', 'dead-letter-queue'],
  keywords: ['pubsub', 'pub/sub', 'messaging', 'topic', 'subscription'],
}

const secretManager: ResourceDef = {
  id: 'gcp.secret-manager',
  provider: 'gcp',
  name: 'Secret Manager',
  short: 'Secret Manager',
  archetype: 'secrets',
  category: 'security',
  icon: 'lock',
  tagline: 'Versioned secrets with IAM access and audit logging',
  description:
    'Stores secrets as immutable versions — adding a new value creates a new version rather than replacing the old one, so rollback is trivial and you can always see what a workload was actually reading. Access is granted per-secret through IAM and every access is logged.',
  ports: [outPort('out', 'Provides secrets', ['secret']), IDENTITY_IN],
  props: [
    {
      key: 'replication',
      label: 'Replication',
      type: 'select',
      default: 'automatic',
      help: 'Where the secret material is stored.',
      impact: 'Automatic replication is global and simplest. User-managed replication pins storage to chosen regions for data residency requirements.',
      affects: ['availability'],
      options: [
        { value: 'automatic', label: 'Automatic (global)' },
        { value: 'user-managed', label: 'User-managed regions', note: 'For data residency' },
      ],
    },
    {
      key: 'versionPinning',
      label: 'Pin to a version',
      type: 'boolean',
      default: false,
      help: 'Reference a specific version instead of `latest`.',
      impact: 'Pinning makes deployments reproducible but means rotation requires a deploy. Using `latest` picks up rotation automatically and makes it harder to know what is in use.',
      affects: ['security', 'availability'],
    },
  ],
  sim: { mitigates: { 'credential-stuffing': 0.4, 'lateral-movement': 0.3 } },
  cost: { hourly: () => 0.06 / 730, perMillionRequests: () => 30, note: `$0.06 per secret version per month plus $0.03 per 10,000 accesses. ${TIER_NOTE}` },
  setup: {
    snippets: [
      {
        label: 'gcloud',
        lang: 'bash',
        code: `echo -n "$PASSWORD" | gcloud secrets create db-password \\
  --data-file=- --replication-policy=automatic

# Grant one service account access to one secret. Nothing broader.
gcloud secrets add-iam-policy-binding db-password \\
  --member=serviceAccount:web@project.iam.gserviceaccount.com \\
  --role=roles/secretmanager.secretAccessor

# Rotating = adding a version. The old one stays for rollback.
echo -n "$NEW_PASSWORD" | gcloud secrets versions add db-password --data-file=-`,
      },
    ],
    docs: [{ label: 'Secret Manager', url: 'https://cloud.google.com/secret-manager/docs' }],
    gotchas: [
      'Grant the accessor role on individual secrets, never at the project level — project-level access means every secret.',
      'Old versions persist and are billed until you destroy them. Disable them first so you can re-enable if a rotation goes wrong.',
      'Enable data access audit logs for Secret Manager. They are not on by default, and they are exactly what you want after an incident.',
    ],
  },
  concepts: ['secrets-management', 'credential-rotation', 'least-privilege'],
  keywords: ['secret manager', 'secrets', 'gcp secrets'],
}

const cloudArmor: ResourceDef = {
  id: 'gcp.cloud-armor',
  provider: 'gcp',
  name: 'Cloud Armor',
  short: 'Cloud Armor',
  archetype: 'waf',
  category: 'security',
  icon: 'waf',
  tagline: 'WAF and DDoS policy enforced at Google\'s edge',
  description:
    'Security policies attached to a backend service and enforced at the edge, before traffic enters your network. Pre-configured rules cover the OWASP categories, and the rules language lets you express rate limits, geography and bot signals. Because enforcement happens at the edge, blocked traffic never consumes your capacity or your egress.',
  ports: [
    inPort('in', 'Requests to inspect', ['http']),
    outPort('out', 'Clean requests', ['http']),
    TELEMETRY_OUT,
  ],
  props: [
    {
      key: 'mode',
      label: 'Enforcement',
      type: 'select',
      default: 'preview',
      help: 'Preview logs what would have been blocked; enforce actually blocks it.',
      impact: 'Always run in preview first and read the logs. Untuned OWASP rules reject real traffic — file uploads and rich text editors are the usual casualties.',
      affects: ['security', 'availability'],
      options: [
        { value: 'preview', label: 'Preview (log only)', note: 'Start here' },
        { value: 'enforce', label: 'Enforce', note: 'Once tuned' },
      ],
    },
    {
      key: 'rateLimit',
      label: 'Rate limit per client',
      type: 'number',
      default: 600,
      min: 10,
      max: 100000,
      unit: ' req/min',
      help: 'Throttles or bans a client that exceeds the rate.',
      impact: 'Cheap, effective, and applied at the edge — the request costs you nothing once it is rejected there.',
      affects: ['security'],
    },
    {
      key: 'adaptiveProtection',
      label: 'Adaptive Protection',
      type: 'boolean',
      default: false,
      help: 'Machine-learned baselines that detect and suggest rules for layer 7 attacks.',
      impact: 'Detects application-layer floods that look like normal traffic in aggregate, and proposes a rule you can apply in one click.',
      affects: ['security', 'cost'],
    },
  ],
  sim: {
    capacity: 1000000,
    latencyMs: 1,
    mitigates: {
      'volumetric-ddos': 0.9, 'app-ddos': 0.75, 'sql-injection': 0.8,
      xss: 0.8, 'credential-stuffing': 0.55, 'port-scan': 0.5,
    },
  },
  cost: { hourly: () => 5 / 730, perMillionRequests: () => 0.75, note: `$5 per policy per month, $1 per rule, $0.75 per million requests. ${TIER_NOTE}` },
  setup: {
    snippets: [
      {
        label: 'gcloud',
        lang: 'bash',
        code: `gcloud compute security-policies create prod-armor

# OWASP preconfigured rules — in PREVIEW first, always.
gcloud compute security-policies rules create 1000 \\
  --security-policy=prod-armor \\
  --expression="evaluatePreconfiguredExpr('sqli-v33-stable')" \\
  --action=deny-403 --preview

# Rate limit with an automatic ban for repeat offenders
gcloud compute security-policies rules create 2000 \\
  --security-policy=prod-armor \\
  --src-ip-ranges="*" --action=rate-based-ban \\
  --rate-limit-threshold-count=600 --rate-limit-threshold-interval-sec=60 \\
  --ban-duration-sec=600 --conform-action=allow \\
  --exceed-action=deny-429 --enforce-on-key=IP

gcloud compute backend-services update web-backend \\
  --global --security-policy=prod-armor`,
      },
    ],
    docs: [{ label: 'Cloud Armor', url: 'https://cloud.google.com/armor/docs/cloud-armor-overview' }],
    gotchas: [
      'Preview mode first, every time. Read the logs for a week before enforcing.',
      'The OWASP rules have sensitivity levels. Level 1 is the least noisy starting point; higher levels catch more and block more legitimate traffic.',
      'Policies attach to backend services, so they only cover traffic arriving through the load balancer. Anything reachable directly bypasses them.',
    ],
  },
  concepts: ['waf', 'owasp-top-10', 'rate-limiting', 'ddos-mitigation'],
  keywords: ['cloud armor', 'waf', 'ddos', 'security policy'],
}

const cloudMonitoring: ResourceDef = {
  id: 'gcp.monitoring',
  provider: 'gcp',
  name: 'Cloud Monitoring & Logging',
  short: 'Ops Suite',
  archetype: 'monitoring',
  category: 'operations',
  icon: 'chart',
  tagline: 'Metrics, logs, traces and a built-in SLO engine',
  description:
    'Google\'s operations suite, notable for treating service level objectives as first-class objects. You define an SLI and a target, and it computes your error budget and burn rate automatically — then alerts on the burn rate rather than on a raw threshold, which is the difference between a page that means "you will miss your target" and one that means "a number went up briefly".',
  ports: [
    inPort('in', 'Telemetry', ['telemetry']),
    outPort('alert', 'Alerts', ['telemetry']),
  ],
  props: [
    {
      key: 'sloEnabled',
      label: 'Service level objectives',
      type: 'boolean',
      default: false,
      help: 'Defines availability and latency targets, and tracks the remaining error budget.',
      impact:
        'Alerting on error-budget burn rate rather than on instantaneous thresholds is the single biggest improvement most teams can make to their paging. A fast burn pages immediately; a slow burn opens a ticket.',
      affects: ['availability'],
    },
    {
      key: 'logRetention',
      label: 'Log retention',
      type: 'number',
      default: 30,
      min: 1,
      max: 3650,
      unit: ' days',
      help: 'How long log entries are kept.',
      impact: 'Ingestion dominates the cost. Route high-volume, low-value logs to a cheaper sink and keep the queryable window for what you will actually search.',
      affects: ['cost', 'security'],
    },
  ],
  sim: {},
  cost: { perGbMonth: () => 0.5, note: `$0.50 per GB of log ingestion after a free allowance. ${TIER_NOTE}` },
  setup: {
    snippets: [
      {
        label: 'Alert on burn rate, not on a threshold',
        lang: 'text',
        code: `# Target: 99.9% availability over 30 days.
# Error budget = 0.1% of requests = 43 minutes of downtime per month.
#
# Burn rate = how fast you are consuming that budget.
#   burn 14.4x for 1 hour   → 2% of the month's budget gone → PAGE
#   burn 6x for 6 hours     → 10% of the budget gone        → PAGE
#   burn 1x for 3 days      → on track to exhaust it        → TICKET
#
# This is why "CPU > 80%" is a bad alert and "we are burning
# our availability budget 14x faster than sustainable" is a good one:
# the second one is always worth waking someone up for.

# Logging query: what changed when the errors started?
resource.type="cloud_run_revision"
severity>=ERROR
timestamp>="2026-09-15T10:00:00Z"`,
      },
    ],
    docs: [{ label: 'SLO monitoring', url: 'https://cloud.google.com/stackdriver/docs/solutions/slo-monitoring' }],
    gotchas: [
      'Use log exclusions for high-volume, low-value entries. Health check logs alone can dominate an ingestion bill.',
      'Burn-rate alerting requires an SLO to be defined first. Defining one honestly is most of the value.',
    ],
  },
  concepts: ['observability', 'slo-sli', 'error-budgets', 'alerting'],
  keywords: ['cloud monitoring', 'logging', 'slo', 'stackdriver', 'trace'],
}

const gcpIam: ResourceDef = {
  id: 'gcp.service-account',
  provider: 'gcp',
  name: 'Service Account',
  short: 'Service Account',
  archetype: 'identity',
  category: 'security',
  icon: 'key',
  tagline: 'A machine identity with roles bound at a resource level',
  description:
    'A service account is an identity that a workload runs as. GCP\'s IAM model binds roles at a level in the resource hierarchy — organisation, folder, project or individual resource — and permissions inherit downward. Workload Identity Federation extends this to workloads running outside Google entirely, so a GitHub Actions job can authenticate without a downloadable key.',
  ports: [
    outPort('grant', 'Grants access to', ['identity']),
    inPort('assign', 'Assigned to', ['identity'], { position: 'top' }),
  ],
  props: [
    {
      key: 'bindingLevel',
      label: 'Role binding level',
      type: 'select',
      default: 'resource',
      help: 'Where in the hierarchy the role is granted.',
      impact: 'Roles inherit downward. Editor at the project level is write access to every resource in the project, which is far more than almost any workload needs.',
      affects: ['security'],
      options: [
        { value: 'org', label: 'Organisation', note: 'Everything, everywhere' },
        { value: 'project', label: 'Project' },
        { value: 'resource', label: 'Individual resource', note: 'Least privilege' },
      ],
      danger: (v) => (v === 'org' ? 'An organisation-level binding grants this identity access across every project in the organisation.' : null),
    },
    {
      key: 'keyType',
      label: 'Credential type',
      type: 'select',
      default: 'workload-identity',
      help: 'How the workload proves who it is.',
      impact:
        'A downloaded service account key is a permanent credential in a JSON file. It gets committed to repositories, pasted into CI variables and forgotten. Workload Identity Federation removes the key entirely — the workload exchanges its own platform token for a short-lived one.',
      affects: ['security'],
      options: [
        { value: 'workload-identity', label: 'Workload Identity Federation', note: 'No key at all' },
        { value: 'attached', label: 'Attached to the resource', note: 'Metadata server, no key' },
        { value: 'json-key', label: 'Downloaded JSON key', note: 'Avoid' },
      ],
      danger: (v) => (v === 'json-key' ? 'A downloaded service account key is a long-lived credential in a file. These leak through repositories and CI logs constantly.' : null),
    },
  ],
  sim: { mitigates: { 'privilege-escalation': 0.55, 'lateral-movement': 0.45, 'credential-stuffing': 0.4 } },
  cost: { note: 'Free.' },
  setup: {
    snippets: [
      {
        label: 'Workload Identity Federation for CI',
        lang: 'bash',
        code: `# Let GitHub Actions authenticate with no downloadable key at all.
gcloud iam workload-identity-pools create github --location=global

gcloud iam workload-identity-pools providers create-oidc github-provider \\
  --location=global --workload-identity-pool=github \\
  --issuer-uri=https://token.actions.githubusercontent.com \\
  --attribute-mapping='google.subject=assertion.sub,attribute.repository=assertion.repository' \\
  --attribute-condition='assertion.repository == "myorg/myrepo"'

# Only this repository can impersonate this service account.
gcloud iam service-accounts add-iam-policy-binding deployer@project.iam.gserviceaccount.com \\
  --role=roles/iam.workloadIdentityUser \\
  --member="principalSet://iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/github/attribute.repository/myorg/myrepo"`,
      },
    ],
    docs: [{ label: 'Workload Identity Federation', url: 'https://cloud.google.com/iam/docs/workload-identity-federation' }],
    gotchas: [
      'Disable service account key creation with an organisation policy. It removes an entire class of credential leak.',
      'The default Compute Engine service account is broadly privileged and attached automatically. Replace it with a narrow one.',
      'Use the Policy Analyzer to find who can actually reach a resource. Inherited bindings are easy to lose track of.',
    ],
  },
  concepts: ['least-privilege', 'zero-trust', 'blast-radius', 'supply-chain-security'],
  keywords: ['service account', 'iam', 'workload identity', 'gcp iam'],
}

export const gcpResources: ResourceDef[] = [
  vpc, gcpSubnet, firewall, globalLb, gce, cloudRun, cloudSql, firestore,
  gcs, pubsub, secretManager, cloudArmor, cloudMonitoring, gcpIam,
]
