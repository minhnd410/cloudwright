import type { ResourceDef } from '../../schema/types'
import { inPort, outPort, TIER_NOTE } from '../../schema/presets'

const vpc: ResourceDef = {
  id: 'aws.vpc',
  provider: 'aws',
  name: 'Virtual Private Cloud',
  short: 'VPC',
  archetype: 'vpc',
  category: 'network',
  icon: 'vpc',
  tagline: 'Your own isolated network inside AWS',
  description:
    'A logically isolated slice of the AWS network that you control completely: the address range, the subnets, the route tables, the gateways. Nothing enters or leaves without a route and a rule that allows it. A VPC lives in one region and spans every availability zone in it.',
  container: {
    accepts: ['subnet', 'availability-zone', 'internet-gateway', 'nat', 'firewall', 'private-link', 'vpn', 'bastion'],
    label: 'Drop subnets and gateways inside',
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
      label: 'CIDR block',
      type: 'cidr',
      default: '10.0.0.0/16',
      help: 'The private IPv4 range the whole network draws addresses from. /16 gives you 65,536 addresses.',
      impact:
        'This is effectively permanent — you can add secondary ranges later but never shrink or renumber without rebuilding. Overlapping CIDRs are the number one reason two networks can never be peered, and it is always discovered two years too late.',
      affects: ['scale'],
      danger: (v) =>
        String(v).endsWith('/24')
          ? 'A /24 leaves only 256 addresses for the entire network. Subnetting that across zones will run out fast.'
          : null,
    },
    {
      key: 'dnsHostnames',
      label: 'DNS hostnames',
      type: 'boolean',
      default: true,
      help: 'Gives instances internal DNS names resolvable inside the VPC.',
      impact: 'Required for private endpoints and most managed services to resolve to private addresses rather than public ones.',
      affects: ['security'],
    },
    {
      key: 'flowLogs',
      label: 'VPC Flow Logs',
      type: 'boolean',
      default: false,
      help: 'Records metadata about every accepted and rejected connection in the network.',
      impact:
        'Without flow logs, a security investigation has no record of what talked to what. With them, you can answer "did the compromised host reach the database" in minutes instead of never. They cost storage, and they are always worth it.',
      affects: ['security', 'cost'],
    },
  ],
  sim: { mitigates: { 'lateral-movement': 0.2 } },
  cost: {
    hourly: (p) => (p.flowLogs ? 0.02 : 0),
    note: `The VPC itself is free; flow log ingestion is not. ${TIER_NOTE}`,
  },
  setup: {
    console: [
      'VPC console → Create VPC → choose "VPC and more" to get subnets, route tables and gateways in one shot.',
      'Pick a CIDR that does not overlap any network you might ever peer with, including your office and your other accounts.',
      'Create at least two availability zones. Anything less is a single-zone architecture wearing a disguise.',
      'Enable flow logs to CloudWatch Logs or S3 before you need them.',
    ],
    snippets: [
      {
        label: 'AWS CLI',
        lang: 'bash',
        code: `# Create the VPC
aws ec2 create-vpc \\
  --cidr-block 10.0.0.0/16 \\
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=prod-vpc}]'

# DNS hostnames are required for private endpoints to resolve
aws ec2 modify-vpc-attribute --vpc-id vpc-0abc --enable-dns-hostnames

# Turn on flow logs
aws ec2 create-flow-logs \\
  --resource-type VPC --resource-ids vpc-0abc \\
  --traffic-type ALL \\
  --log-destination-type cloud-watch-logs \\
  --log-group-name /aws/vpc/flowlogs \\
  --deliver-logs-permission-arn arn:aws:iam::111122223333:role/flow-logs`,
      },
      {
        label: 'Terraform',
        lang: 'hcl',
        code: `module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "prod-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["us-east-1a", "us-east-1b", "us-east-1c"]
  public_subnets  = ["10.0.0.0/20",  "10.0.16.0/20",  "10.0.32.0/20"]
  private_subnets = ["10.0.64.0/20", "10.0.80.0/20",  "10.0.96.0/20"]

  enable_nat_gateway   = true
  single_nat_gateway   = false # one per AZ: costs more, survives a zone loss
  enable_dns_hostnames = true

  enable_flow_log                      = true
  create_flow_log_cloudwatch_log_group = true
  create_flow_log_cloudwatch_iam_role  = true
}`,
      },
    ],
    docs: [
      { label: 'VPC User Guide', url: 'https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html' },
      { label: 'VPC sizing guidance', url: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-cidr-blocks.html' },
    ],
    gotchas: [
      'You cannot change or shrink the primary CIDR after creation. Plan the address space before you plan anything else.',
      'AWS reserves five addresses in every subnet — the first four and the last — so a /28 gives you eleven usable, not sixteen.',
      'The default VPC has public subnets and an internet gateway already wired. Convenient for a demo, wrong for production.',
    ],
  },
  concepts: ['cidr-subnetting', 'vpc-design', 'network-isolation'],
  keywords: ['vpc', 'network', 'vnet', 'cidr', 'isolation'],
}

const subnet: ResourceDef = {
  id: 'aws.subnet',
  provider: 'aws',
  name: 'Subnet',
  short: 'Subnet',
  archetype: 'subnet',
  category: 'network',
  icon: 'subnet',
  tagline: 'A slice of the VPC pinned to one availability zone',
  description:
    'A subnet is a contiguous range of addresses inside your VPC that lives in exactly one availability zone. Its route table is what makes it public or private: a default route to an internet gateway makes it public, a default route to a NAT gateway makes it private-with-egress, and no default route at all makes it fully isolated. Nothing else about the subnet decides this.',
  wantsContainer: ['vpc'],
  container: {
    accepts: ['vm', 'vm-scale-set', 'container-service', 'relational-db', 'nosql-db', 'cache', 'k8s-nodepool', 'load-balancer-l7', 'load-balancer-l4', 'serverless-function', 'bastion', 'nat', 'search'],
    label: 'Place resources inside',
    size: { width: 320, height: 240 },
    padding: 24,
  },
  ports: [],
  props: [
    {
      key: 'tier',
      label: 'Subnet tier',
      type: 'select',
      default: 'private',
      help: 'What the default route points at — which is the only thing that makes a subnet public or private.',
      impact:
        'Public subnets can receive inbound connections from the internet and their resources can have public IPs. Private subnets reach out through a NAT gateway but cannot be reached back. Isolated subnets have no internet path in either direction, which is where a database belongs.',
      affects: ['security'],
      options: [
        { value: 'public', label: 'Public', note: 'Default route → internet gateway' },
        { value: 'private', label: 'Private (NAT egress)', note: 'Default route → NAT gateway' },
        { value: 'isolated', label: 'Isolated', note: 'No default route at all' },
      ],
      danger: (v) => (v === 'public' ? 'Resources here can be given public IPs and reached from the internet. Only load balancers, NAT gateways and bastions belong in a public subnet.' : null),
    },
    {
      key: 'cidr',
      label: 'CIDR block',
      type: 'cidr',
      default: '10.0.64.0/20',
      help: 'This subnet\'s address range, carved out of the VPC range.',
      impact:
        'Sets how many resources fit. A /20 gives 4,091 usable addresses — generous for instances, and genuinely necessary for Kubernetes, where every Pod consumes a VPC address under the default CNI.',
      affects: ['scale'],
    },
    {
      key: 'az',
      label: 'Availability zone',
      type: 'select',
      default: 'a',
      help: 'The physical datacentre group this subnet lives in.',
      impact:
        'A subnet never spans zones. Surviving a zone failure means having a subnet in each zone, with resources in each, and something in front that routes around the dead one.',
      affects: ['availability'],
      options: [
        { value: 'a', label: 'us-east-1a' },
        { value: 'b', label: 'us-east-1b' },
        { value: 'c', label: 'us-east-1c' },
      ],
    },
    {
      key: 'autoAssignPublicIp',
      label: 'Auto-assign public IPv4',
      type: 'boolean',
      default: false,
      help: 'Gives every instance launched here a public address automatically.',
      impact:
        'A quiet way to put a machine on the internet without meaning to. Combined with a permissive security group, this is the classic path to a compromised instance.',
      affects: ['security'],
      danger: (v, p) =>
        v === true && p.tier !== 'public'
          ? 'Auto-assigning public IPs in a non-public subnet is almost always a mistake.'
          : null,
    },
  ],
  sim: {},
  cost: { note: 'Subnets are free. What costs money is the NAT gateway a private subnet routes through.' },
  setup: {
    snippets: [
      {
        label: 'AWS CLI',
        lang: 'bash',
        code: `aws ec2 create-subnet \\
  --vpc-id vpc-0abc \\
  --cidr-block 10.0.64.0/20 \\
  --availability-zone us-east-1a \\
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=private-1a}]'

# A subnet is "private" because of its route table, nothing else.
aws ec2 create-route-table --vpc-id vpc-0abc
aws ec2 create-route \\
  --route-table-id rtb-0priv \\
  --destination-cidr-block 0.0.0.0/0 \\
  --nat-gateway-id nat-0abc
aws ec2 associate-route-table --route-table-id rtb-0priv --subnet-id subnet-0abc`,
      },
    ],
    docs: [{ label: 'Subnets for your VPC', url: 'https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html' }],
    gotchas: [
      'Public vs private is a property of the route table, not a checkbox on the subnet. Two subnets with identical settings differ only by where 0.0.0.0/0 points.',
      'Size subnets for Kubernetes before you need it. With the default VPC CNI every Pod takes a real subnet address, and a /24 runs out at about 250 Pods.',
      'Spread subnets across at least three zones where the region offers them. Two zones means losing one costs you half your capacity at the worst possible moment.',
    ],
  },
  concepts: ['cidr-subnetting', 'public-vs-private-subnet', 'availability-zones'],
  keywords: ['subnet', 'cidr', 'az', 'public', 'private', 'route table'],
}

const igw: ResourceDef = {
  id: 'aws.igw',
  provider: 'aws',
  name: 'Internet Gateway',
  short: 'IGW',
  archetype: 'internet-gateway',
  category: 'network',
  icon: 'gateway',
  tagline: 'The door between your VPC and the internet',
  description:
    'A horizontally scaled, redundant component that lets traffic pass between your VPC and the internet in both directions. It performs one-to-one NAT for instances that hold a public IP. There is nothing to size and nothing to pay for — but without a route pointing at it, it does nothing at all.',
  wantsContainer: ['vpc'],
  ports: [
    inPort('in', 'From VPC', ['http', 'tcp', 'udp']),
    outPort('out', 'To internet', ['http', 'tcp', 'udp']),
  ],
  sim: { availability: 0.99999 },
  cost: { note: 'Free. You pay for data transfer out of AWS, not for the gateway.' },
  setup: {
    snippets: [
      {
        label: 'AWS CLI',
        lang: 'bash',
        code: `aws ec2 create-internet-gateway
aws ec2 attach-internet-gateway --vpc-id vpc-0abc --internet-gateway-id igw-0abc

# The gateway does nothing until a route table points at it
aws ec2 create-route \\
  --route-table-id rtb-0public \\
  --destination-cidr-block 0.0.0.0/0 \\
  --gateway-id igw-0abc`,
      },
    ],
    gotchas: [
      'One internet gateway per VPC, and it must be attached before routes can reference it.',
      'An instance needs three things to be reachable: a public IP, a route to the IGW, and a security group that allows the port. Missing any one of them is the usual cause of "why can I not reach my server".',
    ],
  },
  concepts: ['public-vs-private-subnet', 'nat-vs-igw'],
  keywords: ['igw', 'internet gateway', 'egress', 'ingress'],
}

const nat: ResourceDef = {
  id: 'aws.nat',
  provider: 'aws',
  name: 'NAT Gateway',
  short: 'NAT GW',
  archetype: 'nat',
  category: 'network',
  icon: 'nat',
  tagline: 'Outbound internet for private resources, one way only',
  description:
    'Lets instances in a private subnet reach the internet — to pull packages, call APIs, fetch updates — while remaining unreachable from it. Connections can only be initiated from the inside. It is a managed, zone-scoped service: a NAT gateway lives in one availability zone, and if that zone fails, so does egress for everything routing through it.',
  wantsContainer: ['subnet'],
  ports: [
    inPort('in', 'From private subnets', ['http', 'tcp', 'udp']),
    outPort('out', 'To internet gateway', ['http', 'tcp', 'udp']),
  ],
  props: [
    {
      key: 'perAz',
      label: 'One per availability zone',
      type: 'boolean',
      default: false,
      help: 'Deploys a NAT gateway in every zone instead of sharing a single one.',
      impact:
        'A single NAT gateway is a zone-scoped single point of failure and sends all cross-zone traffic through one zone, which you also pay for. One per zone costs roughly three times as much and removes both problems.',
      affects: ['availability', 'cost'],
      danger: (v) => (v === false ? 'A single NAT gateway means losing one availability zone kills outbound internet for your whole private tier.' : null),
    },
  ],
  sim: { availability: 0.9995, capacity: 45000 },
  cost: {
    hourly: (p) => 0.045 * (p.perAz ? 3 : 1),
    perGbEgress: () => 0.045,
    note: `About $33/month per gateway before a byte moves, plus $0.045 per GB processed. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'AWS CLI',
        lang: 'bash',
        code: `# A NAT gateway needs an Elastic IP and lives in a PUBLIC subnet
aws ec2 allocate-address --domain vpc
aws ec2 create-nat-gateway \\
  --subnet-id subnet-0public-1a \\
  --allocation-id eipalloc-0abc

# Private subnets route their default route at it
aws ec2 create-route \\
  --route-table-id rtb-0private-1a \\
  --destination-cidr-block 0.0.0.0/0 \\
  --nat-gateway-id nat-0abc`,
      },
    ],
    docs: [{ label: 'NAT gateways', url: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html' }],
    gotchas: [
      'The NAT gateway goes in a public subnet, and the private subnets route to it. Putting it in the private subnet is the classic first-time mistake.',
      'Data processing charges add up fast. Pulling container images through NAT on every deploy is a surprisingly large line item — a VPC endpoint or ECR pull-through cache is far cheaper.',
      'Use VPC endpoints for S3 and DynamoDB. Gateway endpoints are free and keep that traffic off the NAT entirely.',
    ],
  },
  concepts: ['nat-vs-igw', 'public-vs-private-subnet', 'cost-optimisation'],
  keywords: ['nat', 'egress', 'outbound', 'private'],
}

const securityGroup: ResourceDef = {
  id: 'aws.sg',
  provider: 'aws',
  name: 'Security Group',
  short: 'Security Group',
  archetype: 'firewall',
  category: 'security',
  icon: 'shield',
  tagline: 'A stateful firewall attached to the resource, not the subnet',
  description:
    'A security group is an allow-list of inbound and outbound rules attached to a network interface. It is stateful: if you allow a connection in, the reply is automatically allowed back out, regardless of your outbound rules. There is no deny rule — anything not explicitly allowed is denied. Security groups can reference each other, which is how you say "only the web tier may reach the database" without naming a single IP address.',
  wantsContainer: ['vpc'],
  ports: [
    inPort('protect-in', 'Traffic to inspect', ['http', 'tcp', 'udp', 'sql', 'nosql', 'cache']),
    outPort('protect-out', 'Allowed traffic', ['http', 'tcp', 'udp', 'sql', 'nosql', 'cache']),
  ],
  props: [
    {
      key: 'inboundScope',
      label: 'Inbound source',
      type: 'select',
      default: 'sg',
      help: 'Who is allowed to open connections to the resources this group protects.',
      impact:
        'Referencing another security group is the strongest option: the rule follows the resources automatically as they scale, with no IP list to maintain. 0.0.0.0/0 on anything except a load balancer on 443 is how instances get compromised.',
      affects: ['security'],
      options: [
        { value: 'sg', label: 'Another security group', note: 'Best practice — self-maintaining' },
        { value: 'vpc', label: 'VPC CIDR only', note: 'Everything inside the network' },
        { value: 'office', label: 'Specific IP ranges', note: 'Office or VPN ranges' },
        { value: 'world', label: '0.0.0.0/0 (anywhere)', note: 'Only ever for public HTTPS' },
      ],
      danger: (v) => (v === 'world' ? 'Open to the entire internet. Automated scanners will find and probe this within minutes of it going live.' : null),
    },
    {
      key: 'ports',
      label: 'Allowed ports',
      type: 'multiselect',
      default: ['443'],
      help: 'Which destination ports accept connections.',
      impact:
        'Every open port is an entry point that needs a patched service behind it. SSH and RDP open to the world are the two most exploited ports on the internet — use SSM Session Manager instead and open neither.',
      affects: ['security'],
      options: [
        { value: '22', label: '22 — SSH' },
        { value: '3389', label: '3389 — RDP' },
        { value: '80', label: '80 — HTTP' },
        { value: '443', label: '443 — HTTPS' },
        { value: '3306', label: '3306 — MySQL' },
        { value: '5432', label: '5432 — PostgreSQL' },
        { value: '6379', label: '6379 — Redis' },
        { value: '27017', label: '27017 — MongoDB' },
        { value: 'all', label: 'All ports' },
      ],
      danger: (v, p) => {
        const list = Array.isArray(v) ? v : []
        if (p.inboundScope !== 'world') return null
        if (list.includes('all')) return 'All ports open to the entire internet. This is the single most dangerous rule you can write.'
        if (list.includes('22') || list.includes('3389')) return 'SSH or RDP exposed to the internet. These are the most brute-forced ports there are — use SSM Session Manager instead.'
        if (list.some((x) => ['3306', '5432', '6379', '27017'].includes(x))) return 'A database port open to the internet. Unauthenticated Redis and MongoDB in particular are scanned and drained continuously.'
        return null
      },
    },
  ],
  sim: {
    mitigates: {
      'port-scan': 0.85,
      'lateral-movement': 0.55,
      'credential-stuffing': 0.1,
      ransomware: 0.35,
    },
  },
  cost: { note: 'Free.' },
  setup: {
    snippets: [
      {
        label: 'AWS CLI',
        lang: 'bash',
        code: `aws ec2 create-security-group \\
  --group-name app-tier --description "App tier" --vpc-id vpc-0abc

# Reference the load balancer's group rather than an IP range.
# The rule then stays correct as the fleet scales.
aws ec2 authorize-security-group-ingress \\
  --group-id sg-app \\
  --protocol tcp --port 8080 --source-group sg-alb

# The database only accepts connections from the app tier
aws ec2 authorize-security-group-ingress \\
  --group-id sg-db \\
  --protocol tcp --port 5432 --source-group sg-app`,
      },
      {
        label: 'Terraform',
        lang: 'hcl',
        code: `resource "aws_security_group" "db" {
  name   = "db-tier"
  vpc_id = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.app.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}`,
      },
    ],
    docs: [{ label: 'Security groups', url: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html' }],
    gotchas: [
      'Security groups are stateful; network ACLs are not. If you add a NACL you must allow the ephemeral return ports 1024–65535 or replies vanish and you get a silent timeout.',
      'There is no deny rule. To block something specific you need a network ACL or a firewall.',
      'Referencing a security group instead of a CIDR is the single highest-value habit here — the rule keeps meaning the right thing forever.',
    ],
  },
  concepts: ['stateful-vs-stateless-firewall', 'least-privilege-network', 'defence-in-depth'],
  keywords: ['security group', 'sg', 'firewall', 'ingress', 'egress', 'nsg'],
}

const nacl: ResourceDef = {
  id: 'aws.nacl',
  provider: 'aws',
  name: 'Network ACL',
  short: 'NACL',
  archetype: 'firewall',
  category: 'security',
  icon: 'filter',
  tagline: 'A stateless subnet-level filter with explicit deny',
  description:
    'Network ACLs sit at the subnet boundary and evaluate numbered rules in order until one matches. Unlike security groups they are stateless — the reply to an allowed connection is a separate packet that must be allowed by its own rule — and unlike security groups they can explicitly deny. That makes them the right tool for blocking a specific hostile range, and the wrong tool for everyday access control.',
  wantsContainer: ['vpc'],
  ports: [
    inPort('in', 'Subnet traffic', ['http', 'tcp', 'udp']),
    outPort('out', 'Permitted traffic', ['http', 'tcp', 'udp']),
  ],
  props: [
    {
      key: 'denyList',
      label: 'Explicit deny rules',
      type: 'boolean',
      default: false,
      help: 'Blocks specific source ranges outright, before any security group is consulted.',
      impact: 'The only way to block a known-bad range at the network layer. Security groups cannot express "deny".',
      affects: ['security'],
    },
    {
      key: 'ephemeralAllowed',
      label: 'Allow ephemeral ports 1024–65535',
      type: 'boolean',
      default: true,
      help: 'Permits the return traffic of connections your resources initiated.',
      impact:
        'Because NACLs are stateless, forgetting this silently breaks every outbound connection. The symptom is a hanging request with no error and no log line, which is why this catches so many people.',
      affects: ['availability'],
      danger: (v) => (v === false ? 'Stateless filtering with no ephemeral port range: outbound replies are dropped and every connection hangs until it times out.' : null),
    },
  ],
  sim: { mitigates: { 'port-scan': 0.6, 'volumetric-ddos': 0.15, 'lateral-movement': 0.35 } },
  cost: { note: 'Free.' },
  setup: {
    gotchas: [
      'Rules are evaluated in ascending number order and the first match wins. Leave gaps of 100 so you can insert rules later.',
      'Every subnet has a NACL. If you did not create one, it is the default, which allows everything both ways.',
      'Use NACLs for coarse blocks and security groups for everything else. Trying to run fine-grained access control with stateless rules is a good way to spend a weekend debugging.',
    ],
    docs: [{ label: 'Network ACLs', url: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html' }],
  },
  concepts: ['stateful-vs-stateless-firewall', 'defence-in-depth'],
  keywords: ['nacl', 'acl', 'stateless', 'deny'],
}

const vpcEndpoint: ResourceDef = {
  id: 'aws.vpc-endpoint',
  provider: 'aws',
  name: 'VPC Endpoint (PrivateLink)',
  short: 'VPC Endpoint',
  archetype: 'private-link',
  category: 'network',
  icon: 'link',
  tagline: 'Reach AWS services without touching the internet',
  description:
    'Puts an AWS service endpoint inside your own network. Traffic to S3, DynamoDB, Secrets Manager or another account\'s service travels over the AWS backbone instead of out through a NAT gateway and across the public internet. Gateway endpoints (S3, DynamoDB) are free and work by route table entry; interface endpoints place an actual network interface in your subnet and bill per hour and per GB.',
  wantsContainer: ['vpc'],
  ports: [
    inPort('in', 'From private subnets', ['http', 'object', 'nosql', 'secret']),
    outPort('out', 'To AWS service', ['http', 'object', 'nosql', 'secret']),
  ],
  props: [
    {
      key: 'endpointType',
      label: 'Endpoint type',
      type: 'select',
      default: 'gateway',
      help: 'Gateway endpoints use route tables; interface endpoints use a private IP in your subnet.',
      impact:
        'Gateway endpoints are free but only exist for S3 and DynamoDB. Interface endpoints work for almost everything else and cost about $0.01 per hour per zone plus data processing — still usually cheaper than the NAT charges they replace.',
      affects: ['cost', 'security'],
      options: [
        { value: 'gateway', label: 'Gateway (S3, DynamoDB)', note: 'Free' },
        { value: 'interface', label: 'Interface (PrivateLink)', note: '~$0.01/hr per AZ + data' },
      ],
    },
  ],
  sim: { mitigates: { 'data-exfiltration': 0.4 } },
  cost: {
    hourly: (p) => (p.endpointType === 'interface' ? 0.01 * 3 : 0),
    note: `Gateway endpoints are free. Interface endpoints bill per hour per zone. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'AWS CLI',
        lang: 'bash',
        code: `# Free gateway endpoint — keeps S3 traffic off the NAT gateway entirely
aws ec2 create-vpc-endpoint \\
  --vpc-id vpc-0abc \\
  --service-name com.amazonaws.us-east-1.s3 \\
  --route-table-ids rtb-0private-1a rtb-0private-1b

# Interface endpoint for Secrets Manager
aws ec2 create-vpc-endpoint \\
  --vpc-id vpc-0abc \\
  --vpc-endpoint-type Interface \\
  --service-name com.amazonaws.us-east-1.secretsmanager \\
  --subnet-ids subnet-0priv-a subnet-0priv-b \\
  --security-group-ids sg-endpoints \\
  --private-dns-enabled`,
      },
    ],
    gotchas: [
      'Interface endpoints need "private DNS enabled" and DNS hostnames on the VPC, or the service name still resolves to a public address and the endpoint is bypassed silently.',
      'Attach an endpoint policy. Without one, an endpoint to S3 can reach every bucket on AWS, including an attacker\'s — which is exactly the exfiltration path it was meant to close.',
    ],
    docs: [{ label: 'AWS PrivateLink', url: 'https://docs.aws.amazon.com/vpc/latest/privatelink/what-is-privatelink.html' }],
  },
  concepts: ['private-connectivity', 'data-exfiltration', 'cost-optimisation'],
  keywords: ['privatelink', 'endpoint', 'vpce', 'private'],
}

export const awsNetwork: ResourceDef[] = [vpc, subnet, igw, nat, securityGroup, nacl, vpcEndpoint]
