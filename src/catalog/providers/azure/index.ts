import type { ResourceDef } from '../../schema/types'
import {
  autoscaleProps, backupProps, computePorts, encryptionProp, inPort, outPort,
  publicAccessProp, replicaProp, IDENTITY_IN, TELEMETRY_OUT, TIER_NOTE,
} from '../../schema/presets'

const vnet: ResourceDef = {
  id: 'azure.vnet',
  provider: 'azure',
  name: 'Virtual Network',
  short: 'VNet',
  archetype: 'vpc',
  category: 'network',
  icon: 'vpc',
  tagline: 'Azure\'s isolated network, scoped to one region',
  description:
    'A VNet is Azure\'s private network boundary. Like an AWS VPC it lives in one region and holds subnets, but the details differ in ways that matter: routing is handled by user-defined route tables rather than a per-subnet association model, and a subnet is not tied to an availability zone — the zone is chosen per resource instead.',
  container: {
    accepts: ['subnet', 'firewall', 'nat', 'private-link', 'vpn', 'bastion'],
    label: 'Drop subnets inside',
    size: { width: 760, height: 460 },
    padding: 28,
  },
  ports: [
    inPort('peer-in', 'Peering', ['peering'], { position: 'top' }),
    outPort('peer-out', 'Peering', ['peering'], { position: 'bottom' }),
  ],
  props: [
    {
      key: 'cidr',
      label: 'Address space',
      type: 'cidr',
      default: '10.1.0.0/16',
      help: 'The private range this network allocates from. A VNet can hold several address spaces.',
      impact: 'Overlapping ranges make peering impossible, and peering is not transitive in Azure — two networks peered to a hub cannot reach each other without explicit routing.',
      affects: ['scale'],
    },
    {
      key: 'ddosProtection',
      label: 'DDoS Network Protection',
      type: 'boolean',
      default: false,
      help: 'Adds tuned mitigation, attack telemetry and cost protection on top of the platform-level defence.',
      impact: 'Azure already absorbs common network floods for everyone at no cost. The paid tier buys tuning to your traffic profile, alerting and rapid response.',
      affects: ['security', 'cost'],
    },
  ],
  sim: { mitigates: { 'lateral-movement': 0.2 } },
  cost: { hourly: (p) => (p.ddosProtection ? 2944 / 730 : 0), note: `The VNet is free. DDoS Network Protection is a large flat monthly charge per tenant. ${TIER_NOTE}` },
  setup: {
    snippets: [
      {
        label: 'Azure CLI',
        lang: 'bash',
        code: `az network vnet create \\
  --resource-group prod-rg --name prod-vnet \\
  --address-prefix 10.1.0.0/16 \\
  --subnet-name app --subnet-prefix 10.1.1.0/24

az network vnet subnet create \\
  --resource-group prod-rg --vnet-name prod-vnet \\
  --name data --address-prefix 10.1.2.0/24 \\
  --service-endpoints Microsoft.Sql`,
      },
    ],
    docs: [{ label: 'Virtual Network', url: 'https://learn.microsoft.com/azure/virtual-network/virtual-networks-overview' }],
    gotchas: [
      'Azure reserves five addresses per subnet, and the smallest usable subnet is a /29.',
      'VNet peering is not transitive. Spoke-to-spoke traffic through a hub needs a firewall or a route server in the middle.',
      'Some services demand a dedicated, delegated subnet — Azure Firewall, Bastion and App Service integration among them. Leave room for them when planning.',
    ],
  },
  concepts: ['cidr-subnetting', 'vpc-design', 'network-isolation'],
  keywords: ['vnet', 'virtual network', 'azure network'],
}

const azSubnet: ResourceDef = {
  id: 'azure.subnet',
  provider: 'azure',
  name: 'Subnet',
  short: 'Subnet',
  archetype: 'subnet',
  category: 'network',
  icon: 'subnet',
  tagline: 'An address range inside the VNet, with its own rules and routes',
  description:
    'An Azure subnet holds a range of addresses and is where you attach a network security group and a route table. Unlike AWS, an Azure subnet is not bound to a single availability zone — resources pick their zone individually — so zone redundancy is a property of what you place here, not of the subnet itself.',
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
      key: 'tier',
      label: 'Subnet role',
      type: 'select',
      default: 'private',
      help: 'What this subnet is for, and how traffic leaves it.',
      impact:
        'In Azure, outbound internet access exists by default unless you remove it — the opposite of AWS. A resource with no public IP and no NAT gateway still reaches the internet through implicit outbound access, which is being retired and should never be relied on.',
      affects: ['security'],
      options: [
        { value: 'public', label: 'Public-facing', note: 'Gateways and load balancers' },
        { value: 'private', label: 'Application tier', note: 'Egress via NAT gateway' },
        { value: 'isolated', label: 'Data tier', note: 'Private endpoints only' },
      ],
    },
    {
      key: 'cidr',
      label: 'Address prefix',
      type: 'cidr',
      default: '10.1.1.0/24',
      help: 'The range for this subnet.',
      impact: 'Azure CNI in AKS consumes one address per Pod, so a /24 runs out at a couple of hundred Pods. Size data-plane subnets generously.',
      affects: ['scale'],
    },
    {
      key: 'privateEndpointPolicy',
      label: 'Private endpoints only',
      type: 'boolean',
      default: false,
      help: 'Reaches PaaS services through private IPs inside the VNet rather than their public endpoints.',
      impact: 'Keeps traffic to Azure SQL, Storage and Key Vault entirely inside your network, and lets you disable their public endpoints completely.',
      affects: ['security'],
    },
  ],
  sim: {},
  setup: {
    gotchas: [
      'Default outbound internet access is being retired. Attach a NAT gateway explicitly rather than relying on the implicit path.',
      'A network security group can be attached at both the subnet and the network interface. Both are evaluated, and the effective rules are the intersection — a frequent source of confusion.',
      'Resizing a subnet requires the resources in it to be removed first. Plan ranges with room to grow.',
    ],
    docs: [{ label: 'Subnets', url: 'https://learn.microsoft.com/azure/virtual-network/virtual-network-manage-subnet' }],
  },
  concepts: ['cidr-subnetting', 'public-vs-private-subnet', 'private-connectivity'],
  keywords: ['subnet', 'azure subnet', 'address prefix'],
}

const nsg: ResourceDef = {
  id: 'azure.nsg',
  provider: 'azure',
  name: 'Network Security Group',
  short: 'NSG',
  archetype: 'firewall',
  category: 'security',
  icon: 'shield',
  tagline: 'Stateful, prioritised allow and deny rules',
  description:
    'An NSG holds numbered rules evaluated in priority order, lowest number first, with the first match winning. It is stateful like an AWS security group, but unlike one it can express Deny as well as Allow, and it attaches to a subnet, a network interface, or both. Service tags let you write "allow from AzureLoadBalancer" or "deny to Internet" without ever listing an address.',
  wantsContainer: ['vpc'],
  ports: [
    inPort('in', 'Traffic to inspect', ['http', 'tcp', 'udp', 'sql', 'nosql', 'cache']),
    outPort('out', 'Allowed traffic', ['http', 'tcp', 'udp', 'sql', 'nosql', 'cache']),
  ],
  props: [
    {
      key: 'inboundScope',
      label: 'Inbound source',
      type: 'select',
      default: 'asg',
      help: 'Who may open connections to the protected resources.',
      impact:
        'Application security groups let you write rules against logical groups of machines rather than addresses, so the rule stays correct as the fleet changes. Service tags cover Azure-managed ranges that would otherwise be impossible to keep current.',
      affects: ['security'],
      options: [
        { value: 'asg', label: 'Application security group', note: 'Best practice' },
        { value: 'servicetag', label: 'Service tag', note: 'AzureLoadBalancer, Storage, …' },
        { value: 'vnet', label: 'VirtualNetwork', note: 'Everything inside' },
        { value: 'internet', label: 'Internet', note: 'Public HTTPS only' },
      ],
      danger: (v) => (v === 'internet' ? 'Open to the internet. Only ever correct for a public HTTPS listener.' : null),
    },
    {
      key: 'denyAllOutbound',
      label: 'Deny internet egress',
      type: 'boolean',
      default: false,
      help: 'Blocks outbound traffic to the Internet service tag, allowing only what you permit explicitly.',
      impact: 'Egress control is what stops a compromised workload from reaching a command-and-control server or copying your data out. Almost nobody configures it until after an incident.',
      affects: ['security'],
    },
    {
      key: 'flowLogs',
      label: 'NSG flow logs',
      type: 'boolean',
      default: false,
      help: 'Records allowed and denied flows to a storage account.',
      impact: 'The forensic record. Without it you cannot answer what the compromised host talked to.',
      affects: ['security', 'cost'],
    },
  ],
  sim: { mitigates: { 'port-scan': 0.85, 'lateral-movement': 0.6, 'data-exfiltration': 0.3, ransomware: 0.35 } },
  cost: { note: 'NSGs are free; flow log storage is not.' },
  setup: {
    snippets: [
      {
        label: 'Azure CLI',
        lang: 'bash',
        code: `az network nsg create -g prod-rg -n app-nsg

# Lower priority number wins. Leave gaps so you can insert later.
az network nsg rule create -g prod-rg --nsg-name app-nsg \\
  -n allow-lb-https --priority 100 \\
  --source-address-prefixes AzureLoadBalancer \\
  --destination-port-ranges 443 --access Allow --protocol Tcp

az network nsg rule create -g prod-rg --nsg-name app-nsg \\
  -n deny-internet-out --priority 4000 --direction Outbound \\
  --destination-address-prefixes Internet --access Deny --protocol '*'

# What is actually being applied to this NIC?
az network nic list-effective-nsg -g prod-rg -n app-vm-nic`,
      },
    ],
    docs: [{ label: 'Network security groups', url: 'https://learn.microsoft.com/azure/virtual-network/network-security-groups-overview' }],
    gotchas: [
      'Default rules already allow all traffic within the VNet and all outbound to the internet. Your rules layer on top of those, and you may need to deny explicitly.',
      'When an NSG is attached to both the subnet and the NIC, inbound traffic must pass the subnet rules then the NIC rules. Use `list-effective-nsg` rather than reasoning about it.',
      'Priority numbers are evaluated ascending and the first match wins. Leave gaps of 100 between rules.',
    ],
  },
  concepts: ['stateful-vs-stateless-firewall', 'least-privilege-network', 'defence-in-depth'],
  keywords: ['nsg', 'network security group', 'firewall', 'asg'],
}

const frontDoor: ResourceDef = {
  id: 'azure.front-door',
  provider: 'azure',
  name: 'Front Door',
  short: 'Front Door',
  archetype: 'cdn',
  category: 'edge',
  icon: 'cdn',
  tagline: 'Global edge: CDN, WAF and multi-region failover in one',
  description:
    'Front Door terminates connections at Microsoft\'s edge network, caches what it can, applies WAF rules, and routes each request to the healthiest and closest backend — including backends in different regions. It is the component that makes an active-active multi-region architecture practical on Azure, because the failover decision happens at the edge rather than in DNS.',
  ports: [
    inPort('in', 'Viewer requests', ['http']),
    outPort('origin', 'To origins', ['http', 'object']),
    TELEMETRY_OUT,
  ],
  props: [
    {
      key: 'tier',
      label: 'Tier',
      type: 'select',
      default: 'premium',
      help: 'Standard covers CDN and routing; Premium adds managed WAF rules and Private Link to origins.',
      impact: 'Premium can reach origins over Private Link, which lets you remove their public endpoints entirely — the strongest form of origin protection there is.',
      affects: ['security', 'cost'],
      options: [
        { value: 'standard', label: 'Standard', note: 'CDN + routing' },
        { value: 'premium', label: 'Premium', note: 'Managed WAF + Private Link origins' },
      ],
    },
    {
      key: 'wafMode',
      label: 'WAF mode',
      type: 'select',
      default: 'detection',
      help: 'Whether matching requests are blocked or logged.',
      impact: 'Start in detection, read what it would have blocked, then switch to prevention. Blocking untuned on day one rejects real customers.',
      affects: ['security', 'availability'],
      options: [
        { value: 'off', label: 'Disabled' },
        { value: 'detection', label: 'Detection', note: 'Log only — start here' },
        { value: 'prevention', label: 'Prevention', note: 'Block, once tuned' },
      ],
    },
    {
      key: 'healthProbes',
      label: 'Origin health probes',
      type: 'boolean',
      default: true,
      help: 'Probes each origin from multiple edge locations and stops routing to unhealthy ones.',
      impact: 'The mechanism behind automatic regional failover. Without probes, Front Door keeps sending traffic to a dead region.',
      affects: ['availability'],
    },
  ],
  sim: {
    capacity: 2000000,
    latencyMs: 9,
    availability: 0.9999,
    mitigates: { 'volumetric-ddos': 0.985, 'app-ddos': 0.7, 'sql-injection': 0.8, xss: 0.8 },
  },
  cost: { hourly: () => 330 / 730, perGbEgress: () => 0.081, note: `Premium has a base monthly charge plus egress and request fees. ${TIER_NOTE}` },
  setup: {
    snippets: [
      {
        label: 'Azure CLI',
        lang: 'bash',
        code: `az afd profile create -g prod-rg --profile-name prod-afd --sku Premium_AzureFrontDoor

az afd origin-group create -g prod-rg --profile-name prod-afd \\
  --origin-group-name app --probe-path /healthz \\
  --probe-protocol Https --probe-interval-in-seconds 30 \\
  --sample-size 4 --successful-samples-required 3

# Two regions in one origin group = automatic failover at the edge
az afd origin create -g prod-rg --profile-name prod-afd \\
  --origin-group-name app --origin-name eastus \\
  --host-name app-eastus.azurewebsites.net --priority 1 --weight 500 --enabled-state Enabled

az afd origin create -g prod-rg --profile-name prod-afd \\
  --origin-group-name app --origin-name westeu \\
  --host-name app-westeu.azurewebsites.net --priority 1 --weight 500 --enabled-state Enabled`,
      },
    ],
    docs: [{ label: 'Azure Front Door', url: 'https://learn.microsoft.com/azure/frontdoor/front-door-overview' }],
    gotchas: [
      'Lock origins down so they only accept traffic from Front Door — via Private Link on Premium, or by checking the X-Azure-FDID header. Otherwise the WAF is bypassed by hitting the origin directly.',
      'Front Door is global; Application Gateway is regional. They solve different problems and are often used together.',
    ],
  },
  concepts: ['cdn', 'waf', 'multi-region', 'ddos-mitigation'],
  keywords: ['front door', 'cdn', 'waf', 'global', 'edge'],
}

const appGateway: ResourceDef = {
  id: 'azure.app-gateway',
  provider: 'azure',
  name: 'Application Gateway',
  short: 'App Gateway',
  archetype: 'load-balancer-l7',
  category: 'edge',
  icon: 'balancer',
  tagline: 'Regional layer 7 load balancing with an integrated WAF',
  description:
    'A regional reverse proxy that understands HTTP: it routes by hostname and path, terminates TLS, rewrites headers, and can run the OWASP core rule set inline. Where Front Door works at the global edge, Application Gateway sits inside your VNet — which means it can front private backends that have no public presence at all.',
  wantsContainer: ['subnet'],
  ports: [
    inPort('in', 'Client requests', ['http', 'grpc']),
    outPort('out', 'To backend pool', ['http', 'grpc']),
    inPort('cert', 'TLS certificate', ['tls-cert'], { position: 'top' }),
    TELEMETRY_OUT,
  ],
  props: [
    {
      key: 'wafEnabled',
      label: 'WAF enabled',
      type: 'boolean',
      default: true,
      help: 'Runs OWASP managed rules against every request.',
      impact: 'Inline protection against injection and scripting attacks for backends that may never be patched as fast as you would like.',
      affects: ['security', 'cost'],
    },
    {
      key: 'autoscale',
      label: 'Autoscaling (v2)',
      type: 'boolean',
      default: true,
      help: 'Scales capacity units with demand instead of running a fixed instance count.',
      impact: 'The v2 SKU scales and is zone-redundant. The original v1 is neither and is retired.',
      affects: ['capacity', 'cost', 'availability'],
    },
    {
      key: 'zoneRedundant',
      label: 'Zone redundant',
      type: 'boolean',
      default: true,
      help: 'Spreads instances across availability zones in the region.',
      impact: 'Without it the gateway itself is a zone-scoped single point of failure in front of a zone-redundant backend, which defeats the purpose.',
      affects: ['availability'],
    },
  ],
  sim: {
    capacity: 60000,
    latencyMs: 7,
    availability: 0.9995,
    mitigates: { 'sql-injection': 0.8, xss: 0.8, 'app-ddos': 0.4 },
    failureModes: [
      { id: 'backend-unhealthy', label: 'Backend pool unhealthy', symptom: 'HTTP 502 from the gateway; backend health shows every member unhealthy.', remedy: 'Check the probe path, the expected status codes, and whether the NSG allows the gateway subnet to reach the backend port.' },
    ],
  },
  cost: { hourly: (p) => (p.wafEnabled ? 0.36 : 0.246), perGbEgress: () => 0.087, note: `Fixed hourly cost plus capacity units and egress. ${TIER_NOTE}` },
  setup: {
    gotchas: [
      'Application Gateway needs a dedicated subnet that nothing else may use.',
      'Health probes come from within the gateway subnet. The backend NSG must allow it, and it must also allow the GatewayManager service tag on ports 65200–65535 or the gateway silently fails to provision.',
      'The v1 SKU is retired. Anything new should be v2.',
    ],
    docs: [{ label: 'Application Gateway', url: 'https://learn.microsoft.com/azure/application-gateway/overview' }],
  },
  concepts: ['load-balancing', 'waf', 'tls-termination', 'osi-model'],
  keywords: ['application gateway', 'appgw', 'waf', 'layer 7'],
}

const azVm: ResourceDef = {
  id: 'azure.vm',
  provider: 'azure',
  name: 'Virtual Machine',
  short: 'Azure VM',
  archetype: 'vm',
  category: 'compute',
  icon: 'server',
  tagline: 'A virtual server with a managed disk attached',
  description:
    'Azure\'s virtual machine. The important structural difference from EC2 is availability: a single VM carries an SLA only when it uses premium SSD storage, and real redundancy comes from spreading instances across availability zones or from a Virtual Machine Scale Set. A lone VM is not a highly available service no matter which disk you pick.',
  wantsContainer: ['subnet'],
  ports: computePorts(),
  props: [
    {
      key: 'size',
      label: 'VM size',
      type: 'select',
      default: 'D2s_v5',
      help: 'The series and size determine CPU, memory and which disk types are supported.',
      impact: 'B-series are burstable and accumulate credits like AWS t-instances. D-series give sustained performance; E-series are memory-optimised.',
      affects: ['capacity', 'cost', 'latency'],
      options: [
        { value: 'B2s', label: 'B2s (2 vCPU / 4 GB)', meta: { rps: 300, hourly: 0.0416 }, note: 'Burstable' },
        { value: 'D2s_v5', label: 'D2s_v5 (2 vCPU / 8 GB)', meta: { rps: 800, hourly: 0.096 } },
        { value: 'D4s_v5', label: 'D4s_v5 (4 vCPU / 16 GB)', meta: { rps: 1600, hourly: 0.192 } },
        { value: 'E8s_v5', label: 'E8s_v5 (8 vCPU / 64 GB)', meta: { rps: 3000, hourly: 0.504 }, note: 'Memory optimised' },
      ],
    },
    replicaProp(),
    ...autoscaleProps(),
    {
      key: 'zones',
      label: 'Availability zones',
      type: 'select',
      default: 'multi',
      help: 'How instances are distributed across the region\'s physical zones.',
      impact: 'Zone-redundant deployment is what earns the higher SLA. A single zone, or none at all, means a datacentre event takes everything.',
      affects: ['availability'],
      options: [
        { value: 'none', label: 'No zone', note: 'Lowest SLA' },
        { value: 'single', label: 'One zone' },
        { value: 'multi', label: 'Spread across zones', note: 'Highest SLA' },
      ],
      danger: (v) => (v === 'none' ? 'No zone placement. A single datacentre event takes this tier down entirely.' : null),
    },
    {
      key: 'managedIdentity',
      label: 'Managed identity',
      type: 'boolean',
      default: true,
      help: 'Gives the VM an Entra ID identity so it can call Azure services without a stored credential.',
      impact: 'The Azure equivalent of an instance role. No secret is stored anywhere, and tokens rotate automatically.',
      affects: ['security'],
    },
    {
      key: 'justInTime',
      label: 'Just-in-time access',
      type: 'boolean',
      default: false,
      help: 'Keeps management ports closed and opens them briefly, for a specific address, on approved request.',
      impact: 'Turns a permanently open RDP or SSH port into a time-boxed, audited exception. Or use Azure Bastion and never open one at all.',
      affects: ['security'],
    },
  ],
  sim: {
    capacity: 800,
    latencyMs: 18,
    availability: 0.995,
    vulnerableTo: ['lateral-movement', 'privilege-escalation', 'port-scan', 'ssrf'],
    failureModes: [
      { id: 'zone-outage', label: 'Availability zone outage', symptom: 'Every instance in one zone becomes unreachable at once.', remedy: 'Spread the scale set across zones and front it with a zone-redundant load balancer.' },
      { id: 'disk-throttle', label: 'Disk throttled', symptom: 'Latency climbs while CPU is idle; disk queue depth is high.', remedy: 'Premium and Ultra disks have provisioned IOPS tied to size. Grow the disk or enable host caching.' },
    ],
  },
  cost: {
    hourly: (p) => {
      const base = { B2s: 0.0416, D2s_v5: 0.096, D4s_v5: 0.192, E8s_v5: 0.504 }[String(p.size)] ?? 0.096
      return base * Number(p.replicas ?? 1)
    },
    note: `Pay-as-you-go Linux. Reserved instances and the Azure Hybrid Benefit reduce this substantially. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'Azure CLI',
        lang: 'bash',
        code: `az vm create -g prod-rg -n app-1 \\
  --image Ubuntu2204 --size Standard_D2s_v5 \\
  --vnet-name prod-vnet --subnet app \\
  --assign-identity \\
  --public-ip-address "" \\
  --zone 1 \\
  --nsg ""    # attach the subnet NSG instead of creating a per-VM one

# Connect with no open management port at all
az network bastion ssh -n prod-bastion -g prod-rg \\
  --target-resource-id $(az vm show -g prod-rg -n app-1 --query id -o tsv) \\
  --auth-type AAD`,
      },
    ],
    docs: [{ label: 'Virtual Machines', url: 'https://learn.microsoft.com/azure/virtual-machines/overview' }],
    gotchas: [
      '`az vm create` attaches a public IP and a permissive NSG by default. Pass empty values explicitly for anything production.',
      'A single VM only carries an SLA with premium storage. Real availability comes from zones and scale sets.',
      'Use managed identity rather than storing a service principal secret on the machine.',
    ],
  },
  concepts: ['compute-models', 'availability-zones', 'autoscaling'],
  keywords: ['azure vm', 'virtual machine', 'vmss', 'compute'],
}

const containerApps: ResourceDef = {
  id: 'azure.container-apps',
  provider: 'azure',
  name: 'Container Apps',
  short: 'Container Apps',
  archetype: 'container-service',
  category: 'compute',
  icon: 'container',
  tagline: 'Serverless containers with Kubernetes-grade scaling, minus the cluster',
  description:
    'Runs containers on a managed Kubernetes foundation you never see or administer. It includes KEDA-based scaling on events and queue depth, Dapr for service-to-service concerns, built-in revision management for blue-green and canary releases, and the ability to scale to zero. It is the right answer when you want container semantics without owning a cluster.',
  ports: computePorts(),
  props: [
    {
      key: 'cpu',
      label: 'CPU per replica',
      type: 'select',
      default: '0.5',
      help: 'vCPU allocated to each replica. Memory is tied to it in fixed ratios.',
      impact: 'Billed per second of actual use. A workload that scales to zero between bursts costs nothing while idle.',
      affects: ['capacity', 'cost'],
      options: [
        { value: '0.25', label: '0.25 vCPU / 0.5 GB', meta: { rps: 90, hourly: 0.0108 } },
        { value: '0.5', label: '0.5 vCPU / 1 GB', meta: { rps: 190, hourly: 0.0216 } },
        { value: '1', label: '1 vCPU / 2 GB', meta: { rps: 400, hourly: 0.0432 } },
        { value: '2', label: '2 vCPU / 4 GB', meta: { rps: 820, hourly: 0.0864 } },
      ],
    },
    {
      key: 'minReplicas',
      label: 'Minimum replicas',
      type: 'number',
      default: 1,
      min: 0,
      max: 30,
      help: 'Zero allows scale-to-zero when idle.',
      impact: 'Scale to zero makes idle free, and makes the first request after idle pay a cold start. For a background worker that is a bargain; for a login page it is not.',
      affects: ['cost', 'latency'],
    },
    {
      key: 'maxReplicas',
      label: 'Maximum replicas',
      type: 'number',
      default: 10,
      min: 1,
      max: 300,
      help: 'The scaling ceiling.',
      impact: 'Caps both cost and the load you can place on whatever is downstream.',
      affects: ['capacity', 'cost'],
    },
    {
      key: 'scaleRule',
      label: 'Scale trigger',
      type: 'select',
      default: 'http',
      help: 'What KEDA watches to decide the replica count.',
      impact: 'Scaling a queue worker on HTTP traffic is meaningless. Scaling it on queue length means capacity follows the backlog exactly.',
      affects: ['capacity'],
      options: [
        { value: 'http', label: 'Concurrent HTTP requests' },
        { value: 'queue', label: 'Queue length', note: 'For workers' },
        { value: 'cpu', label: 'CPU utilisation' },
        { value: 'cron', label: 'Schedule' },
      ],
    },
  ],
  sim: {
    capacity: 400,
    latencyMs: 15,
    availability: 0.9995,
    vulnerableTo: ['supply-chain', 'ssrf'],
    failureModes: [
      { id: 'cold-start', label: 'Cold start from zero', symptom: 'The first request after an idle period takes seconds.', remedy: 'Set minReplicas to 1 for anything a user waits on.' },
    ],
  },
  cost: {
    hourly: (p) => ({ '0.25': 0.0108, '0.5': 0.0216, '1': 0.0432, '2': 0.0864 }[String(p.cpu)] ?? 0.0216) * Number(p.minReplicas ?? 1),
    note: `Billed per vCPU-second and GB-second of active use, with a monthly free grant. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'Azure CLI',
        lang: 'bash',
        code: `az containerapp create -g prod-rg -n web \\
  --environment prod-env \\
  --image myacr.azurecr.io/web:$GIT_SHA \\
  --target-port 8080 --ingress external \\
  --cpu 0.5 --memory 1Gi \\
  --min-replicas 1 --max-replicas 20 \\
  --user-assigned /subscriptions/.../userAssignedIdentities/web-id \\
  --secrets "db-password=keyvaultref:https://kv.vault.azure.net/secrets/db,identityref:..."

# Canary: send 20% of traffic to the new revision, watch, then promote
az containerapp ingress traffic set -g prod-rg -n web \\
  --revision-weight web--rev1=80 web--rev2=20`,
      },
    ],
    docs: [{ label: 'Container Apps', url: 'https://learn.microsoft.com/azure/container-apps/overview' }],
    gotchas: [
      'Revision-based traffic splitting gives you canary releases with a single command and no extra infrastructure. It is the standout feature.',
      'Scale to zero is excellent for workers and wrong for anything latency-sensitive.',
      'Reach Key Vault and storage through managed identity rather than connection strings.',
    ],
  },
  concepts: ['containers', 'serverless', 'deployment-strategies', 'autoscaling'],
  keywords: ['container apps', 'aca', 'keda', 'dapr', 'serverless containers'],
}

const azFunctions: ResourceDef = {
  id: 'azure.functions',
  provider: 'azure',
  name: 'Azure Functions',
  short: 'Functions',
  archetype: 'serverless-function',
  category: 'compute',
  icon: 'function',
  tagline: 'Event-driven code with a rich set of triggers and bindings',
  description:
    'Functions run in response to triggers — HTTP, queue messages, blob writes, timers, Event Grid — and bindings let you declare inputs and outputs rather than writing client code for them. Which hosting plan you pick changes the behaviour more than anything else: Consumption scales to zero and has cold starts, Premium keeps instances warm and supports VNet integration.',
  ports: [
    inPort('in', 'Triggers', ['http', 'queue', 'stream', 'object']),
    outPort('out', 'Bindings & calls', ['http', 'sql', 'nosql', 'cache', 'queue', 'stream', 'object']),
    IDENTITY_IN,
    TELEMETRY_OUT,
  ],
  props: [
    {
      key: 'plan',
      label: 'Hosting plan',
      type: 'select',
      default: 'consumption',
      help: 'How the function is hosted and billed.',
      impact:
        'Consumption is free when idle and has cold starts. Premium pre-warms instances, removes the timeout ceiling, and allows VNet integration — which you need to reach a private database.',
      affects: ['cost', 'latency', 'security'],
      options: [
        { value: 'consumption', label: 'Consumption', note: 'Scale to zero, cold starts, no VNet' },
        { value: 'premium', label: 'Premium (Elastic)', note: 'Pre-warmed, VNet capable' },
        { value: 'dedicated', label: 'App Service plan', note: 'Fixed capacity you already pay for' },
      ],
    },
    {
      key: 'maxInstances',
      label: 'Maximum scale-out',
      type: 'number',
      default: 100,
      min: 1,
      max: 200,
      help: 'The instance ceiling.',
      impact: 'Also your protection for anything downstream. Unlimited scale-out in front of a small database exhausts its connections rather than serving more traffic.',
      affects: ['capacity', 'availability'],
    },
  ],
  sim: {
    capacity: 2500,
    latencyMs: 30,
    availability: 0.9995,
    failureModes: [
      { id: 'cold-start', label: 'Cold start', symptom: 'p99 far above p50 on the Consumption plan, worst after idle periods.', remedy: 'Move to Premium with pre-warmed instances, or keep the function warm with a timer trigger.' },
    ],
  },
  cost: { perMillionRequests: () => 0.2, note: `Consumption: $0.20 per million executions plus GB-seconds, with a generous free grant. ${TIER_NOTE}` },
  setup: {
    gotchas: [
      'Only the Premium and Dedicated plans support VNet integration. A Consumption function cannot reach a private database.',
      'Functions need a storage account for their own state. Deleting or locking it down too far breaks the function in confusing ways.',
      'Use Application Insights from the start — without it, diagnosing a function is close to impossible.',
    ],
    docs: [{ label: 'Azure Functions hosting', url: 'https://learn.microsoft.com/azure/azure-functions/functions-scale' }],
  },
  concepts: ['serverless', 'cold-starts', 'event-driven'],
  keywords: ['azure functions', 'serverless', 'faas', 'trigger', 'binding'],
}

const azureSql: ResourceDef = {
  id: 'azure.sql',
  provider: 'azure',
  name: 'Azure SQL Database',
  short: 'Azure SQL',
  archetype: 'relational-db',
  category: 'database',
  icon: 'database',
  tagline: 'Managed SQL Server with automatic tuning and threat detection',
  description:
    'A fully managed relational database where patching, backups and high availability are handled for you. Its distinguishing features are operational: automatic index tuning that watches your workload and acts, and built-in threat detection that flags likely SQL injection and anomalous access patterns against the database itself.',
  wantsContainer: ['subnet'],
  ports: [
    inPort('in', 'SQL connections', ['sql']),
    outPort('replica', 'Geo-replication', ['sql'], { position: 'bottom' }),
    IDENTITY_IN,
    TELEMETRY_OUT,
  ],
  props: [
    {
      key: 'tier',
      label: 'Service tier',
      type: 'select',
      default: 'general',
      help: 'The performance and availability tier.',
      impact:
        'Business Critical keeps replicas on local SSD with a readable secondary and the fastest failover. Hyperscale separates compute from storage and scales to 100 TB with near-instant restores. General Purpose is the sensible default.',
      affects: ['capacity', 'availability', 'cost'],
      options: [
        { value: 'serverless', label: 'Serverless', note: 'Auto-pauses when idle' },
        { value: 'general', label: 'General Purpose', meta: { rps: 1200, hourly: 0.25 } },
        { value: 'business', label: 'Business Critical', meta: { rps: 4000, hourly: 0.9 }, note: 'Local SSD, readable replica' },
        { value: 'hyperscale', label: 'Hyperscale', meta: { rps: 6000, hourly: 0.6 }, note: 'Up to 100 TB, fast restore' },
      ],
    },
    {
      key: 'zoneRedundant',
      label: 'Zone redundant',
      type: 'boolean',
      default: false,
      help: 'Replicas in separate availability zones inside the region.',
      impact: 'Survives losing a datacentre without losing the database. Roughly a 30% premium.',
      affects: ['availability', 'cost'],
    },
    {
      key: 'geoReplication',
      label: 'Active geo-replication',
      type: 'boolean',
      default: false,
      help: 'A readable secondary in a different region.',
      impact: 'Your regional disaster recovery, and a read scale-out. Failover is manual unless you configure a failover group, and cross-region replication is asynchronous — so a hard failover can lose recent transactions.',
      affects: ['availability', 'cost'],
    },
    publicAccessProp({
      help: 'Whether the database accepts connections from outside the VNet.',
      impact: 'Turn it off and use a private endpoint. Azure SQL public endpoints are constantly probed, and the firewall rule "allow Azure services" permits every Azure tenant, not just yours.',
    }),
    ...backupProps(),
    {
      key: 'threatDetection',
      label: 'Microsoft Defender for SQL',
      type: 'boolean',
      default: false,
      help: 'Alerts on likely SQL injection, unusual access patterns and credential anomalies.',
      impact: 'Catches attacks that reached the database anyway. It is detection, not prevention — the query should have been parameterised.',
      affects: ['security', 'cost'],
    },
  ],
  sim: {
    capacity: 1200,
    latencyMs: 9,
    stateful: true,
    availability: 0.9995,
    vulnerableTo: ['sql-injection', 'data-exfiltration', 'credential-stuffing'],
    failureModes: [
      { id: 'dtu-throttle', label: 'Resource limit reached', symptom: 'Queries queue and time out; DTU or vCore utilisation is pinned at 100%.', remedy: 'Scale the tier, or fix the query — the automatic tuning recommendations usually name the missing index.' },
      { id: 'firewall', label: 'Blocked by firewall rule', symptom: 'Client cannot connect; error names the client IP address.', remedy: 'Add the address, or better, use a private endpoint and turn public access off.' },
    ],
  },
  cost: {
    hourly: (p) => {
      const base = { serverless: 0.12, general: 0.25, business: 0.9, hyperscale: 0.6 }[String(p.tier)] ?? 0.25
      return base * (p.zoneRedundant ? 1.3 : 1) * (p.geoReplication ? 2 : 1)
    },
    note: `vCore pricing. Reserved capacity and the Azure Hybrid Benefit reduce this considerably. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'Azure CLI',
        lang: 'bash',
        code: `az sql server create -g prod-rg -n prod-sql \\
  --enable-ad-only-auth --external-admin-name "SQL Admins" \\
  --external-admin-sid $GROUP_OBJECT_ID

az sql db create -g prod-rg -s prod-sql -n appdb \\
  --edition GeneralPurpose --family Gen5 --capacity 4 \\
  --zone-redundant --backup-storage-redundancy Zone

# Turn the public endpoint off entirely and reach it privately
az sql server update -g prod-rg -n prod-sql --enable-public-network false
az network private-endpoint create -g prod-rg -n sql-pe \\
  --vnet-name prod-vnet --subnet data \\
  --private-connection-resource-id $(az sql server show -g prod-rg -n prod-sql --query id -o tsv) \\
  --group-id sqlServer --connection-name sql-pe-conn`,
      },
    ],
    docs: [{ label: 'Azure SQL Database', url: 'https://learn.microsoft.com/azure/azure-sql/database/sql-database-paas-overview' }],
    gotchas: [
      'The "Allow Azure services and resources to access this server" firewall rule allows every Azure subscription in the world, not only yours. It is not the convenience toggle it appears to be.',
      'Prefer Entra ID authentication over SQL logins — you get MFA, conditional access and central revocation.',
      'Automatic tuning genuinely works. Turn on index recommendations and let it apply them in a non-production environment first.',
    ],
  },
  concepts: ['acid-transactions', 'sql-injection', 'private-connectivity', 'rpo-rto'],
  keywords: ['azure sql', 'sql server', 'database', 'mssql'],
}

const cosmos: ResourceDef = {
  id: 'azure.cosmos',
  provider: 'azure',
  name: 'Cosmos DB',
  short: 'Cosmos DB',
  archetype: 'nosql-db',
  category: 'database',
  icon: 'table',
  tagline: 'Globally distributed NoSQL with tunable consistency',
  description:
    'A multi-model, globally distributed database whose defining feature is that consistency is a dial rather than a fixed property. Five levels sit between strong and eventual, and where you set it decides your latency, your availability during a partition, and your cost. It is the clearest practical illustration of the CAP theorem in any commercial product.',
  ports: [
    inPort('in', 'API requests', ['nosql']),
    outPort('feed', 'Change feed', ['stream'], { position: 'bottom' }),
    IDENTITY_IN,
    TELEMETRY_OUT,
  ],
  props: [
    {
      key: 'consistency',
      label: 'Consistency level',
      type: 'select',
      default: 'session',
      help: 'How up-to-date a read is guaranteed to be.',
      impact:
        'Strong consistency costs twice the request units for a read and forces reads to the write region. Session — the default — guarantees you always read your own writes, which is what most applications actually need and is far cheaper.',
      affects: ['latency', 'cost', 'availability'],
      options: [
        { value: 'strong', label: 'Strong', note: 'Linearizable, 2× read cost, single region reads' },
        { value: 'bounded', label: 'Bounded staleness', note: 'Lag bounded by time or versions' },
        { value: 'session', label: 'Session', note: 'Read your own writes — the sensible default' },
        { value: 'prefix', label: 'Consistent prefix', note: 'Order preserved, freshness not' },
        { value: 'eventual', label: 'Eventual', note: 'Cheapest and fastest' },
      ],
    },
    {
      key: 'throughputMode',
      label: 'Throughput mode',
      type: 'select',
      default: 'autoscale',
      help: 'How request units are provisioned.',
      impact:
        'Everything in Cosmos is priced in request units. A read of a 1 KB item costs about one RU; a complex cross-partition query costs far more. Autoscale ranges between 10% and 100% of the maximum you set.',
      affects: ['capacity', 'cost'],
      options: [
        { value: 'manual', label: 'Manual RU/s', note: 'Cheapest when steady' },
        { value: 'autoscale', label: 'Autoscale', note: '10–100% of the ceiling' },
        { value: 'serverless', label: 'Serverless', note: 'Per-request, for spiky low volume' },
      ],
    },
    {
      key: 'multiRegionWrite',
      label: 'Multi-region writes',
      type: 'boolean',
      default: false,
      help: 'Accepts writes in every configured region.',
      impact: 'Local write latency everywhere and survival of a regional outage, at the cost of conflict resolution you must design for. Last-writer-wins silently discards one of two concurrent updates.',
      affects: ['availability', 'latency', 'cost'],
    },
    {
      key: 'partitionKeyQuality',
      label: 'Partition key distribution',
      type: 'select',
      default: 'high',
      help: 'How evenly your data and traffic spread across logical partitions.',
      impact:
        'A logical partition is capped at 20 GB and a share of throughput. A poorly chosen key creates a hot partition that throttles with 429s while the container as a whole looks fine — and the key cannot be changed afterwards.',
      affects: ['capacity', 'latency'],
      options: [
        { value: 'high', label: 'Well distributed' },
        { value: 'medium', label: 'Somewhat skewed' },
        { value: 'low', label: 'Hot partition', note: 'Throttling ahead' },
      ],
      danger: (v) => (v === 'low' ? 'A hot logical partition throttles at its own RU share and is capped at 20 GB, regardless of total provisioning.' : null),
    },
  ],
  sim: {
    capacity: 20000,
    latencyMs: 5,
    stateful: true,
    availability: 0.9999,
    vulnerableTo: ['data-exfiltration'],
    failureModes: [
      { id: 'throttle-429', label: 'Request rate too large (429)', symptom: 'The SDK retries automatically; latency climbs and some requests eventually fail.', remedy: 'Raise RU/s, or find the cross-partition query burning them. Log RU charge per operation — it is returned on every response.' },
      { id: 'hot-partition', label: 'Hot logical partition', symptom: 'Throttling on one partition key while overall consumption is modest.', remedy: 'Choose a higher-cardinality key. This is not fixable after the fact without a migration.' },
    ],
  },
  cost: {
    hourly: (p) => (p.throughputMode === 'serverless' ? 0 : 0.008 * 400 * (p.multiRegionWrite ? 2 : 1)),
    note: `About $0.008 per 100 RU/s per hour, multiplied by each write region. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'Azure CLI',
        lang: 'bash',
        code: `az cosmosdb create -g prod-rg -n prod-cosmos \\
  --default-consistency-level Session \\
  --locations regionName=eastus failoverPriority=0 isZoneRedundant=true \\
  --locations regionName=westeurope failoverPriority=1 isZoneRedundant=true \\
  --enable-automatic-failover true

az cosmosdb sql container create -g prod-rg -a prod-cosmos -d appdb -n orders \\
  --partition-key-path "/customerId" \\
  --max-throughput 4000   # autoscale between 400 and 4000 RU/s`,
      },
      {
        label: 'Always log the RU charge',
        lang: 'text',
        code: `const { resource, headers } = await container.item(id, pk).read()
console.log('RU charge:', headers['x-ms-request-charge'])

// Cost intuition:
//   point read of a 1 KB item      ~1 RU
//   write of a 1 KB item           ~5 RU
//   query within one partition     ~3-10 RU
//   cross-partition query          tens to thousands of RU
//
// Every 429 you ever see traces back to one of these being larger
// than you assumed. Log it in development and the surprises stop.`,
      },
    ],
    docs: [{ label: 'Cosmos DB consistency levels', url: 'https://learn.microsoft.com/azure/cosmos-db/consistency-levels' }],
    gotchas: [
      'The partition key is permanent. Choosing it badly means migrating to a new container later.',
      'Cross-partition queries cost far more RU than you expect. Design the key around your queries.',
      'Session consistency is the default and is right for most applications. Reach for Strong only when you can name the specific guarantee you need.',
    ],
  },
  concepts: ['cap-theorem', 'eventual-consistency', 'partition-keys', 'nosql-modelling'],
  keywords: ['cosmos', 'cosmosdb', 'nosql', 'globally distributed', 'ru'],
}

const blobStorage: ResourceDef = {
  id: 'azure.storage',
  provider: 'azure',
  name: 'Storage Account (Blob)',
  short: 'Blob Storage',
  archetype: 'object-store',
  category: 'storage',
  icon: 'bucket',
  tagline: 'Object storage with configurable replication',
  description:
    'Azure\'s object store. The knob that has no direct AWS equivalent is replication: you choose explicitly between three copies in one datacentre, three copies spread across zones, or additional asynchronous copies in a paired region hundreds of kilometres away. That choice is your durability and your regional disaster recovery, priced accordingly.',
  ports: [
    inPort('in', 'Blob operations', ['object']),
    outPort('event', 'Event Grid events', ['queue', 'stream'], { position: 'bottom' }),
    IDENTITY_IN,
  ],
  props: [
    {
      key: 'replication',
      label: 'Replication',
      type: 'select',
      default: 'zrs',
      help: 'How many copies exist and where.',
      impact:
        'LRS keeps three copies in one datacentre — a fire there is total loss. ZRS spreads them across zones in the region. GRS adds an asynchronous copy in the paired region, which is your protection against losing a region entirely.',
      affects: ['durability', 'availability', 'cost'],
      options: [
        { value: 'lrs', label: 'LRS', note: '3 copies, one datacentre' },
        { value: 'zrs', label: 'ZRS', note: '3 copies across zones' },
        { value: 'grs', label: 'GRS', note: 'ZRS plus an async copy in the paired region' },
        { value: 'ragrs', label: 'RA-GRS', note: 'GRS with a readable secondary' },
      ],
    },
    {
      key: 'publicAccess',
      label: 'Allow public blob access',
      type: 'boolean',
      default: false,
      help: 'Permits anonymous read access to containers configured for it.',
      impact: 'Disable at the account level and the per-container setting cannot override it. Serve public content through Front Door instead.',
      affects: ['security'],
      danger: (v) => (v === true ? 'Anonymous blob access is permitted. Any container set to public is readable by the entire internet.' : null),
    },
    {
      key: 'softDelete',
      label: 'Soft delete & versioning',
      type: 'boolean',
      default: true,
      help: 'Retains deleted and overwritten blobs for a retention period.',
      impact: 'Your undo button, and a meaningful ransomware defence when combined with an immutability policy that even an administrator cannot bypass.',
      affects: ['durability', 'cost'],
    },
    encryptionProp(),
    {
      key: 'accessTier',
      label: 'Access tier',
      type: 'select',
      default: 'hot',
      help: 'The trade between storage price and access price.',
      impact: 'Cool and Archive are far cheaper to store and progressively more expensive and slower to read. Archive retrieval is measured in hours.',
      affects: ['cost', 'latency'],
      options: [
        { value: 'hot', label: 'Hot', note: 'Frequent access' },
        { value: 'cool', label: 'Cool', note: '30-day minimum' },
        { value: 'cold', label: 'Cold', note: '90-day minimum' },
        { value: 'archive', label: 'Archive', note: 'Rehydration takes hours' },
      ],
    },
  ],
  sim: {
    capacity: 80000,
    latencyMs: 28,
    stateful: true,
    availability: 0.9999,
    vulnerableTo: ['data-exfiltration', 'ransomware'],
  },
  cost: {
    perGbMonth: (p) => {
      const tier = { hot: 0.018, cool: 0.01, cold: 0.0036, archive: 0.00099 }[String(p.accessTier)] ?? 0.018
      const repl = { lrs: 1, zrs: 1.25, grs: 2, ragrs: 2.5 }[String(p.replication)] ?? 1.25
      return tier * repl
    },
    perGbEgress: () => 0.087,
    note: `Storage plus replication multiplier, plus transaction and egress charges. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'Azure CLI',
        lang: 'bash',
        code: `az storage account create -g prod-rg -n prodassets \\
  --sku Standard_ZRS --kind StorageV2 \\
  --allow-blob-public-access false \\
  --min-tls-version TLS1_2 \\
  --https-only true \\
  --allow-shared-key-access false   # force Entra ID auth, no account keys

az storage account blob-service-properties update \\
  -g prod-rg -n prodassets \\
  --enable-versioning true \\
  --enable-delete-retention true --delete-retention-days 30`,
      },
    ],
    docs: [{ label: 'Storage redundancy', url: 'https://learn.microsoft.com/azure/storage/common/storage-redundancy' }],
    gotchas: [
      'Disable shared key access. Account keys are effectively root credentials for the storage account and they get shared, committed and forgotten.',
      'A SAS token cannot be revoked individually unless it was issued against a stored access policy. Use user-delegation SAS backed by Entra ID.',
      'Changing replication from LRS to GRS is online; going the other way, or changing regions, requires a data copy.',
    ],
  },
  concepts: ['object-storage', 'data-durability', 'ransomware-resilience'],
  keywords: ['blob', 'storage account', 'azure storage', 'container'],
}

const keyVault: ResourceDef = {
  id: 'azure.key-vault',
  provider: 'azure',
  name: 'Key Vault',
  short: 'Key Vault',
  archetype: 'secrets',
  category: 'security',
  icon: 'lock',
  tagline: 'Secrets, keys and certificates with an audit trail',
  description:
    'One service for three related things: secrets, cryptographic keys, and TLS certificates with automatic renewal. Access is granted through Entra ID — ideally with RBAC rather than the older access-policy model — and every operation is logged. Combined with managed identity, an application can read a secret with no credential of its own anywhere.',
  ports: [outPort('out', 'Secrets, keys, certificates', ['secret', 'key', 'tls-cert']), IDENTITY_IN],
  props: [
    {
      key: 'accessModel',
      label: 'Access model',
      type: 'select',
      default: 'rbac',
      help: 'How permissions on the vault are granted.',
      impact: 'RBAC is granular, inheritable and manageable at scale. Access policies are per-vault, hard to audit, and the legacy path.',
      affects: ['security'],
      options: [
        { value: 'rbac', label: 'Azure RBAC', note: 'Recommended' },
        { value: 'policy', label: 'Access policies', note: 'Legacy' },
      ],
    },
    {
      key: 'purgeProtection',
      label: 'Purge protection',
      type: 'boolean',
      default: true,
      help: 'Prevents permanent deletion of the vault or its contents during the soft-delete retention period.',
      impact: 'Stops an attacker — or a mistake — from destroying the keys that your encrypted data depends on. Note that it cannot be turned off once enabled.',
      affects: ['durability', 'security'],
    },
    {
      key: 'privateEndpoint',
      label: 'Private endpoint only',
      type: 'boolean',
      default: false,
      help: 'Removes the public endpoint and reaches the vault over a private IP in your VNet.',
      impact: 'A stolen token is useless from outside your network. This is the control that converts credential theft into a non-event.',
      affects: ['security'],
    },
  ],
  sim: { mitigates: { 'credential-stuffing': 0.45, 'lateral-movement': 0.35, 'data-exfiltration': 0.3 } },
  cost: { perMillionRequests: () => 30, note: `$0.03 per 10,000 operations for standard secrets. ${TIER_NOTE}` },
  setup: {
    snippets: [
      {
        label: 'Azure CLI',
        lang: 'bash',
        code: `az keyvault create -g prod-rg -n prod-kv \\
  --enable-rbac-authorization true \\
  --enable-purge-protection true \\
  --retention-days 90

# Grant a managed identity read access — no secret anywhere in the app
az role assignment create \\
  --role "Key Vault Secrets User" \\
  --assignee $APP_IDENTITY_PRINCIPAL_ID \\
  --scope $(az keyvault show -n prod-kv --query id -o tsv)`,
      },
    ],
    docs: [{ label: 'Key Vault', url: 'https://learn.microsoft.com/azure/key-vault/general/overview' }],
    gotchas: [
      'Key Vault has request throttling limits. Cache fetched secrets in memory rather than reading on every request.',
      'Purge protection cannot be disabled once enabled. That is the point, and it does surprise people in development subscriptions.',
      'Certificates in Key Vault can auto-renew through an integrated CA, which removes an entire class of outage.',
    ],
  },
  concepts: ['secrets-management', 'credential-rotation', 'least-privilege'],
  keywords: ['key vault', 'secrets', 'certificates', 'kms'],
}

const azMonitor: ResourceDef = {
  id: 'azure.monitor',
  provider: 'azure',
  name: 'Azure Monitor',
  short: 'Monitor',
  archetype: 'monitoring',
  category: 'operations',
  icon: 'chart',
  tagline: 'Metrics, logs and traces queried with KQL',
  description:
    'Collects platform metrics, application telemetry and logs into Log Analytics, where you query them with KQL — a genuinely good query language that makes correlating a latency spike with a deployment a one-liner. Application Insights adds distributed tracing and an automatic dependency map.',
  ports: [
    inPort('in', 'Telemetry', ['telemetry']),
    outPort('alert', 'Alerts', ['telemetry']),
  ],
  props: [
    {
      key: 'appInsights',
      label: 'Application Insights',
      type: 'boolean',
      default: true,
      help: 'Application-level tracing, dependency tracking and a live metrics stream.',
      impact: 'Turns "the site is slow" into "this SQL call takes 1.8 seconds on this endpoint". The end-to-end transaction view is the fastest path from symptom to cause.',
      affects: ['availability', 'cost'],
    },
    {
      key: 'retentionDays',
      label: 'Log retention',
      type: 'number',
      default: 30,
      min: 7,
      max: 730,
      unit: ' days',
      help: 'How long queryable log data is kept.',
      impact: 'Ingestion is the dominant cost. Long retention also determines how far back a breach investigation can reach.',
      affects: ['cost', 'security'],
    },
  ],
  sim: {},
  cost: { perGbMonth: () => 2.76, note: `About $2.76 per GB ingested into Log Analytics. Sampling matters. ${TIER_NOTE}` },
  setup: {
    snippets: [
      {
        label: 'KQL during an incident',
        lang: 'text',
        code: `// Which dependency got slow, and when?
dependencies
| where timestamp > ago(1h)
| summarize p50=percentile(duration,50), p95=percentile(duration,95), count()
    by target, bin(timestamp, 1m)
| order by p95 desc

// Failed requests grouped by the exception behind them
requests
| where success == false and timestamp > ago(30m)
| join kind=inner (exceptions) on operation_Id
| summarize count() by name, type, outerMessage
| order by count_ desc

// Did it start at the deploy?
requests
| where timestamp > ago(3h)
| summarize failRate = 100.0*countif(success==false)/count() by bin(timestamp, 5m)
| render timechart`,
      },
    ],
    docs: [{ label: 'Azure Monitor', url: 'https://learn.microsoft.com/azure/azure-monitor/overview' }],
    gotchas: [
      'Log Analytics bills by ingestion volume. Sample verbose telemetry, or the observability bill outgrows the compute bill.',
      'Set the retention period deliberately. Security investigations routinely need to look back further than the default.',
    ],
  },
  concepts: ['observability', 'distributed-tracing', 'slo-sli', 'alerting'],
  keywords: ['azure monitor', 'log analytics', 'application insights', 'kql'],
}

const serviceBus: ResourceDef = {
  id: 'azure.service-bus',
  provider: 'azure',
  name: 'Service Bus',
  short: 'Service Bus',
  archetype: 'queue',
  category: 'messaging',
  icon: 'queue',
  tagline: 'Enterprise messaging with ordering, sessions and transactions',
  description:
    'A message broker with the features that queue-based integration in larger systems tends to need: FIFO ordering through sessions, duplicate detection, scheduled delivery, transactions across queues, and publish-subscribe through topics with per-subscriber filters. Richer and more expensive than a basic queue, and worth it when those guarantees matter.',
  ports: [
    inPort('in', 'Messages in', ['queue']),
    outPort('out', 'Messages out', ['queue']),
    outPort('dlq', 'Dead letter', ['queue'], { position: 'bottom' }),
    IDENTITY_IN,
  ],
  props: [
    {
      key: 'entityType',
      label: 'Entity type',
      type: 'select',
      default: 'queue',
      help: 'Point-to-point queue, or publish-subscribe topic.',
      impact: 'A queue delivers each message to exactly one consumer. A topic delivers to every matching subscription, each with its own filter and its own dead letter queue.',
      affects: ['capacity'],
      options: [
        { value: 'queue', label: 'Queue', note: 'One consumer per message' },
        { value: 'topic', label: 'Topic + subscriptions', note: 'Fan-out with filters' },
      ],
    },
    {
      key: 'sessions',
      label: 'Sessions (FIFO)',
      type: 'boolean',
      default: false,
      help: 'Guarantees ordered processing within a session id.',
      impact: 'Ordering per entity — per customer, per order — while different sessions still process in parallel. It is the useful middle ground between global ordering and none.',
      affects: ['capacity'],
    },
    {
      key: 'maxDeliveryCount',
      label: 'Max delivery attempts',
      type: 'number',
      default: 10,
      min: 1,
      max: 100,
      help: 'How many times a message is retried before it goes to the dead letter queue.',
      impact: 'The dead letter queue exists by default here, which is a real advantage — a poison message steps aside without you having configured anything.',
      affects: ['availability'],
    },
  ],
  sim: {
    capacity: 20000,
    latencyMs: 15,
    stateful: true,
    availability: 0.9999,
    failureModes: [
      { id: 'dlq-fill', label: 'Dead letter queue filling up', symptom: 'Messages accumulate in the DLQ; no visible errors in the main flow.', remedy: 'Alarm on DLQ depth. Nobody notices a silent dead letter queue until a customer asks where their order went.' },
    ],
  },
  cost: { hourly: () => 10 / 730, note: `Standard tier: base charge plus operations. Premium is priced per messaging unit. ${TIER_NOTE}` },
  setup: {
    gotchas: [
      'Always alarm on dead letter queue depth. It is the quietest failure mode in any messaging system.',
      'Sessions give ordering per key without serialising the whole queue.',
      'Use the peek-lock receive mode with an explicit complete. Receive-and-delete loses the message if your handler crashes.',
    ],
    docs: [{ label: 'Service Bus', url: 'https://learn.microsoft.com/azure/service-bus-messaging/service-bus-messaging-overview' }],
  },
  concepts: ['async-messaging', 'dead-letter-queue', 'idempotency', 'backpressure'],
  keywords: ['service bus', 'queue', 'topic', 'messaging', 'dlq'],
}

const azRedis: ResourceDef = {
  id: 'azure.redis',
  provider: 'azure',
  name: 'Azure Cache for Redis',
  short: 'Redis',
  archetype: 'cache',
  category: 'database',
  icon: 'cache',
  tagline: 'Managed Redis for caching, sessions and rate limiting',
  description:
    'A managed Redis service. The tier decides everything that matters operationally: Basic is a single node with no SLA and no replication, Standard gives you a replicated pair with automatic failover, and Premium adds clustering, persistence, zone redundancy and VNet injection.',
  wantsContainer: ['subnet'],
  ports: [inPort('in', 'Cache operations', ['cache']), IDENTITY_IN, TELEMETRY_OUT],
  props: [
    {
      key: 'tier',
      label: 'Tier',
      type: 'select',
      default: 'standard',
      help: 'Determines replication, clustering, persistence and network isolation.',
      impact: 'Basic has a single node — a restart loses everything and there is no SLA at all. Anything production starts at Standard.',
      affects: ['availability', 'cost'],
      options: [
        { value: 'basic', label: 'Basic', note: 'Single node, no SLA' },
        { value: 'standard', label: 'Standard', note: 'Replicated pair, automatic failover' },
        { value: 'premium', label: 'Premium', note: 'Clustering, persistence, VNet, zones' },
      ],
      danger: (v) => (v === 'basic' ? 'Basic tier has a single node and no SLA. A restart empties the cache and there is no failover.' : null),
    },
    {
      key: 'zoneRedundant',
      label: 'Zone redundant',
      type: 'boolean',
      default: false,
      help: 'Places replicas in different availability zones.',
      impact: 'Survives a zone outage. Premium tier only.',
      affects: ['availability', 'cost'],
    },
  ],
  sim: {
    capacity: 80000,
    latencyMs: 1,
    stateful: true,
    availability: 0.999,
    failureModes: [
      { id: 'stampede', label: 'Cache stampede', symptom: 'A popular key expires and every request misses at once.', remedy: 'Jittered TTLs, a recompute lock, and serve-stale-while-revalidating.' },
    ],
  },
  cost: { hourly: (p) => ({ basic: 0.022, standard: 0.055, premium: 0.27 }[String(p.tier)] ?? 0.055), note: TIER_NOTE },
  setup: {
    gotchas: [
      'Premium is the only tier with VNet injection or private endpoints. Lower tiers are reached over a public endpoint with TLS.',
      'Redis is single-threaded for command execution. One KEYS or a large SCAN on a big keyspace blocks everything else.',
      'Alarm on evictions and on used memory against the limit — a cache degrades quietly.',
    ],
    docs: [{ label: 'Azure Cache for Redis', url: 'https://learn.microsoft.com/azure/azure-cache-for-redis/cache-overview' }],
  },
  concepts: ['caching', 'cache-invalidation', 'thundering-herd'],
  keywords: ['redis', 'cache', 'azure cache', 'session'],
}

const managedIdentity: ResourceDef = {
  id: 'azure.managed-identity',
  provider: 'azure',
  name: 'Managed Identity',
  short: 'Managed ID',
  archetype: 'identity',
  category: 'security',
  icon: 'key',
  tagline: 'An Entra ID identity for a resource, with no credential to store',
  description:
    'Gives an Azure resource its own identity in Entra ID. The resource requests a token from a local endpoint, Azure issues it, and it rotates automatically — there is no secret in your configuration, your repository or your key vault. It is the single most effective step away from connection strings and service principal secrets.',
  ports: [
    outPort('grant', 'Grants access to', ['identity']),
    inPort('assign', 'Assigned to', ['identity'], { position: 'top' }),
  ],
  props: [
    {
      key: 'identityType',
      label: 'Identity type',
      type: 'select',
      default: 'user-assigned',
      help: 'System-assigned identities share the resource lifecycle; user-assigned ones are independent and reusable.',
      impact: 'A user-assigned identity can be created and granted permissions before the workload exists, and survives the resource being recreated — which makes it far easier to manage in infrastructure as code.',
      affects: ['security'],
      options: [
        { value: 'system-assigned', label: 'System-assigned', note: 'Deleted with the resource' },
        { value: 'user-assigned', label: 'User-assigned', note: 'Independent and reusable' },
      ],
    },
    {
      key: 'scope',
      label: 'Role scope',
      type: 'select',
      default: 'resource',
      help: 'The level at which the role assignment applies.',
      impact: 'Azure RBAC inherits downward. Contributor at the subscription level is administrative access to everything in it, which is rarely what anyone intended to grant.',
      affects: ['security'],
      options: [
        { value: 'subscription', label: 'Subscription', note: 'Everything, inherited down' },
        { value: 'resource-group', label: 'Resource group' },
        { value: 'resource', label: 'Single resource', note: 'Least privilege' },
      ],
      danger: (v) => (v === 'subscription' ? 'A role assignment at subscription scope is inherited by every resource in it.' : null),
    },
  ],
  sim: { mitigates: { 'credential-stuffing': 0.55, 'privilege-escalation': 0.5, 'lateral-movement': 0.45 } },
  cost: { note: 'Free.' },
  setup: {
    snippets: [
      {
        label: 'Azure CLI',
        lang: 'bash',
        code: `az identity create -g prod-rg -n web-identity

az role assignment create \\
  --assignee $(az identity show -g prod-rg -n web-identity --query principalId -o tsv) \\
  --role "Storage Blob Data Reader" \\
  --scope $(az storage account show -g prod-rg -n prodassets --query id -o tsv)

# In code: no secret anywhere
# const cred = new DefaultAzureCredential()
# const client = new BlobServiceClient(url, cred)`,
      },
    ],
    docs: [{ label: 'Managed identities', url: 'https://learn.microsoft.com/entra/identity/managed-identities-azure-resources/overview' }],
    gotchas: [
      'Role assignments can take a few minutes to propagate. A fresh assignment failing immediately is usually just timing.',
      'DefaultAzureCredential tries several mechanisms in order, which is convenient locally and occasionally confusing in production. Log which one it picked.',
      'Prefer user-assigned identities in infrastructure as code — permissions survive the resource being replaced.',
    ],
  },
  concepts: ['least-privilege', 'zero-trust', 'authn-vs-authz', 'secrets-management'],
  keywords: ['managed identity', 'entra', 'rbac', 'service principal'],
}

export const azureResources: ResourceDef[] = [
  vnet, azSubnet, nsg, frontDoor, appGateway, azVm, containerApps, azFunctions,
  azureSql, cosmos, blobStorage, keyVault, azMonitor, serviceBus, azRedis, managedIdentity,
]
