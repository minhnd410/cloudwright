import type { ResourceDef } from '../../schema/types'
import {
  autoscaleProps, computePorts, inPort, outPort, replicaProp, sizeProp,
  IDENTITY_IN, TELEMETRY_OUT, TIER_NOTE,
} from '../../schema/presets'

const EC2_SIZES = [
  { value: 't3.micro', label: 't3.micro', meta: { vcpu: 2, memGb: 1, rps: 120, hourly: 0.0104 }, note: 'Burstable — great until the CPU credits run out' },
  { value: 't3.small', label: 't3.small', meta: { vcpu: 2, memGb: 2, rps: 240, hourly: 0.0208 }, note: 'Burstable' },
  { value: 't3.medium', label: 't3.medium', meta: { vcpu: 2, memGb: 4, rps: 420, hourly: 0.0416 }, note: 'Burstable' },
  { value: 'm5.large', label: 'm5.large', meta: { vcpu: 2, memGb: 8, rps: 800, hourly: 0.096 }, note: 'General purpose, sustained performance' },
  { value: 'm5.xlarge', label: 'm5.xlarge', meta: { vcpu: 4, memGb: 16, rps: 1600, hourly: 0.192 }, note: 'General purpose' },
  { value: 'c5.2xlarge', label: 'c5.2xlarge', meta: { vcpu: 8, memGb: 16, rps: 3600, hourly: 0.34 }, note: 'Compute optimised' },
  { value: 'r5.2xlarge', label: 'r5.2xlarge', meta: { vcpu: 8, memGb: 64, rps: 3000, hourly: 0.504 }, note: 'Memory optimised' },
]

function sizeMeta(value: unknown) {
  return EC2_SIZES.find((s) => s.value === value)?.meta ?? EC2_SIZES[3].meta
}

const ec2: ResourceDef = {
  id: 'aws.ec2',
  provider: 'aws',
  name: 'EC2 Instance',
  short: 'EC2',
  archetype: 'vm',
  category: 'compute',
  icon: 'server',
  tagline: 'A virtual machine you own end to end',
  description:
    'A virtual server: you choose the size, the image, the operating system, and you are responsible for everything above the hypervisor — patching, hardening, the agent that ships logs, the process that restarts your app when it dies. Maximum control, maximum operational surface. Almost every other compute service exists to take some of that work away.',
  wantsContainer: ['subnet'],
  ports: computePorts(),
  props: [
    sizeProp(EC2_SIZES, { default: 'm5.large' }),
    replicaProp(),
    ...autoscaleProps(),
    {
      key: 'publicIp',
      label: 'Public IP address',
      type: 'boolean',
      default: false,
      help: 'Gives the instance an internet-routable address.',
      impact:
        'Makes the instance directly addressable from the internet. Application instances should sit in a private subnet behind a load balancer and never have one.',
      affects: ['security'],
      danger: (v) => (v === true ? 'A directly-addressable instance. Every open port becomes an internet-facing attack surface.' : null),
    },
    {
      key: 'imdsv2',
      label: 'Require IMDSv2',
      type: 'boolean',
      default: true,
      help: 'Forces the instance metadata service to require a session token, which browsers and proxies cannot supply.',
      impact:
        'This is the control that stops an SSRF bug from stealing your instance role credentials. With IMDSv1 a single "fetch this URL for me" vulnerability hands an attacker your IAM permissions; with IMDSv2 the same request is rejected.',
      affects: ['security'],
      danger: (v) => (v === false ? 'IMDSv1 allows an SSRF vulnerability in your app to read the instance role credentials directly.' : null),
      advanced: true,
    },
    {
      key: 'ebsOptimized',
      label: 'Detailed monitoring',
      type: 'boolean',
      default: false,
      help: 'Publishes metrics every minute instead of every five.',
      impact: 'Five-minute granularity means an autoscaling event or an alert can be five minutes late. During an incident that is an eternity.',
      affects: ['availability', 'cost'],
      advanced: true,
    },
  ],
  sim: {
    capacity: 800,
    latencyMs: 18,
    availability: 0.995,
    stateful: false,
    vulnerableTo: ['ssrf', 'lateral-movement', 'privilege-escalation', 'port-scan'],
    failureModes: [
      { id: 'host-failure', label: 'Underlying host failure', symptom: 'Instance stops responding to health checks; status check 2/2 fails.', remedy: 'Run more than one instance behind a load balancer and let the ASG replace the dead one automatically.' },
      { id: 'cpu-credit', label: 'Burst credits exhausted', symptom: 'Latency climbs steadily over an hour on a t-family instance while CPU sits pinned at the baseline.', remedy: 'Move to a non-burstable family, or enable unlimited mode and accept the surcharge.' },
      { id: 'disk-full', label: 'Root volume full', symptom: 'Writes fail, logs stop, the app throws IO errors but the instance still passes its network health check.', remedy: 'Ship logs off-box, rotate aggressively, and alarm on disk usage — it is not a default CloudWatch metric.' },
    ],
  },
  cost: {
    hourly: (p) => Number(sizeMeta(p.size).hourly) * Number(p.replicas ?? 1),
    note: `On-demand Linux, us-east-1. Savings Plans cut this by up to 72%, Spot by up to 90%. ${TIER_NOTE}`,
  },
  setup: {
    console: [
      'EC2 → Launch instance. Pick an AMI, a size, and the private subnet.',
      'Attach an IAM instance profile rather than putting keys on the box. Never put keys on the box.',
      'Attach a security group that only allows the load balancer\'s group on your app port.',
      'Skip the SSH key entirely and use Session Manager — no port 22, no key to lose, and every session is logged.',
    ],
    snippets: [
      {
        label: 'AWS CLI',
        lang: 'bash',
        code: `aws ec2 run-instances \\
  --image-id ami-0abcdef1234567890 \\
  --instance-type m5.large \\
  --subnet-id subnet-0private-1a \\
  --security-group-ids sg-app \\
  --iam-instance-profile Name=app-instance-profile \\
  --metadata-options "HttpTokens=required,HttpEndpoint=enabled" \\
  --no-associate-public-ip-address \\
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=app-1}]'

# Connect without opening port 22 to anything
aws ssm start-session --target i-0abc123`,
      },
      {
        label: 'Terraform (auto scaling group)',
        lang: 'hcl',
        code: `resource "aws_launch_template" "app" {
  image_id      = data.aws_ami.al2023.id
  instance_type = "m5.large"
  iam_instance_profile { name = aws_iam_instance_profile.app.name }
  vpc_security_group_ids = [aws_security_group.app.id]

  metadata_options {
    http_tokens   = "required" # IMDSv2 only
    http_endpoint = "enabled"
  }
}

resource "aws_autoscaling_group" "app" {
  min_size            = 2
  max_size            = 10
  desired_capacity    = 3
  vpc_zone_identifier = module.vpc.private_subnets # spread across AZs
  target_group_arns   = [aws_lb_target_group.app.arn]
  health_check_type   = "ELB" # not "EC2" — you want app health, not host health

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  instance_refresh { strategy = "Rolling" }
}`,
      },
    ],
    docs: [
      { label: 'EC2 User Guide', url: 'https://docs.aws.amazon.com/ec2/' },
      { label: 'Instance metadata (IMDSv2)', url: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html' },
    ],
    gotchas: [
      'Set the ASG health check type to ELB, not EC2. The default only notices when the host dies, not when your application hangs.',
      't-family instances are burstable. They are excellent value until a sustained load exhausts the CPU credits, at which point performance drops to the baseline and stays there.',
      'Never bake credentials into an AMI or a user-data script. Use an instance profile, and require IMDSv2 so an SSRF bug cannot read it.',
    ],
  },
  concepts: ['compute-models', 'autoscaling', 'immutable-infrastructure', 'ssrf'],
  keywords: ['ec2', 'vm', 'instance', 'virtual machine', 'server'],
}

const fargate: ResourceDef = {
  id: 'aws.ecs-fargate',
  provider: 'aws',
  name: 'ECS on Fargate',
  short: 'ECS Fargate',
  archetype: 'container-service',
  category: 'compute',
  icon: 'container',
  tagline: 'Containers without a server to patch',
  description:
    'Runs container tasks on capacity AWS manages for you. You declare CPU and memory per task and how many tasks to run; there is no instance to size, patch or SSH into. It is the shortest path from "I have a Dockerfile" to "it is in production", and the operational simplicity is worth the premium over EC2 for most teams.',
  wantsContainer: ['subnet'],
  ports: computePorts(),
  props: [
    {
      key: 'taskSize',
      label: 'Task size',
      type: 'select',
      default: '1vcpu',
      help: 'CPU and memory allocated to each running task.',
      impact: 'Fargate only allows specific CPU/memory pairs. Memory must fall within a band determined by the CPU value, so you cannot ask for 0.25 vCPU with 8 GB.',
      affects: ['capacity', 'cost'],
      options: [
        { value: '0.25vcpu', label: '0.25 vCPU / 0.5 GB', meta: { rps: 90, hourly: 0.0123 } },
        { value: '0.5vcpu', label: '0.5 vCPU / 1 GB', meta: { rps: 190, hourly: 0.0247 } },
        { value: '1vcpu', label: '1 vCPU / 2 GB', meta: { rps: 400, hourly: 0.0494 } },
        { value: '2vcpu', label: '2 vCPU / 4 GB', meta: { rps: 820, hourly: 0.0988 } },
        { value: '4vcpu', label: '4 vCPU / 8 GB', meta: { rps: 1650, hourly: 0.1976 } },
      ],
    },
    replicaProp({ label: 'Desired tasks' }),
    ...autoscaleProps(),
    {
      key: 'gracefulShutdown',
      label: 'Connection draining',
      type: 'number',
      default: 30,
      min: 0,
      max: 300,
      unit: 's',
      help: 'How long a task keeps serving in-flight requests after being told to stop.',
      impact:
        'Set to zero and every deploy drops the requests that were mid-flight — users see 502s during what should be a seamless rollout. It needs to be longer than your slowest request.',
      affects: ['availability'],
      danger: (v) => (Number(v) === 0 ? 'No draining period. Every deploy and every scale-in kills in-flight requests.' : null),
    },
  ],
  sim: {
    capacity: 400,
    latencyMs: 14,
    availability: 0.999,
    vulnerableTo: ['supply-chain', 'lateral-movement', 'ssrf'],
    failureModes: [
      { id: 'oom', label: 'Task killed for exceeding memory', symptom: 'Tasks restart in a loop; stopped reason is "OutOfMemoryError: container killed due to memory usage".', remedy: 'Raise the task memory, or find the leak. A container has a hard memory ceiling, not a soft one.' },
      { id: 'image-pull', label: 'Image pull failure', symptom: 'Tasks never reach RUNNING; events show CannotPullContainerError.', remedy: 'Check the execution role has ECR permissions and that a private subnet has a NAT gateway or ECR/S3 endpoints to reach the registry.' },
    ],
  },
  cost: {
    hourly: (p) => {
      const opt = { '0.25vcpu': 0.0123, '0.5vcpu': 0.0247, '1vcpu': 0.0494, '2vcpu': 0.0988, '4vcpu': 0.1976 }[String(p.taskSize)] ?? 0.0494
      return opt * Number(p.replicas ?? 1)
    },
    note: `Billed per second of vCPU and GB, minimum one minute. Fargate Spot is ~70% cheaper for interruptible work. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'Task definition',
        lang: 'json',
        code: `{
  "family": "web",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::111122223333:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::111122223333:role/web-task-role",
  "containerDefinitions": [{
    "name": "web",
    "image": "111122223333.dkr.ecr.us-east-1.amazonaws.com/web@sha256:abc...",
    "portMappings": [{ "containerPort": 8080 }],
    "healthCheck": {
      "command": ["CMD-SHELL", "curl -f http://localhost:8080/healthz || exit 1"],
      "interval": 15, "timeout": 3, "retries": 3, "startPeriod": 30
    },
    "secrets": [
      { "name": "DB_PASSWORD", "valueFrom": "arn:aws:secretsmanager:us-east-1:111122223333:secret:db-abc" }
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": { "awslogs-group": "/ecs/web", "awslogs-region": "us-east-1", "awslogs-stream-prefix": "ecs" }
    }
  }]
}`,
      },
      {
        label: 'AWS CLI',
        lang: 'bash',
        code: `aws ecs register-task-definition --cli-input-json file://taskdef.json

aws ecs create-service \\
  --cluster prod \\
  --service-name web \\
  --task-definition web \\
  --desired-count 3 \\
  --launch-type FARGATE \\
  --network-configuration 'awsvpcConfiguration={subnets=[subnet-0a,subnet-0b],securityGroups=[sg-app],assignPublicIp=DISABLED}' \\
  --load-balancers 'targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=web,containerPort=8080' \\
  --deployment-configuration 'minimumHealthyPercent=100,maximumPercent=200'`,
      },
    ],
    docs: [{ label: 'Fargate task sizing', url: 'https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-defs.html' }],
    gotchas: [
      'Two roles, and people mix them up constantly: the execution role lets ECS pull the image and write logs; the task role is what your application code uses to call AWS. Your app\'s permissions belong on the task role.',
      'A task in a private subnet still needs a path to ECR and S3 to pull an image — either a NAT gateway or VPC endpoints.',
      'Pin images by digest, not by the `latest` tag. A mutable tag means you cannot say for certain what is running.',
    ],
  },
  concepts: ['containers', 'compute-models', 'twelve-factor', 'supply-chain-security'],
  keywords: ['ecs', 'fargate', 'container', 'docker', 'task'],
}

const lambda: ResourceDef = {
  id: 'aws.lambda',
  provider: 'aws',
  name: 'Lambda Function',
  short: 'Lambda',
  archetype: 'serverless-function',
  category: 'compute',
  icon: 'function',
  tagline: 'Code that runs on demand and costs nothing when idle',
  description:
    'You upload a function; AWS runs it when something invokes it and bills you per millisecond. Scaling is automatic and effectively instant, there is nothing to patch, and an idle function is free. The trade-offs are real though: a hard execution timeout, no local state between invocations, cold starts on the first request into a new environment, and a concurrency model that can stampede a database that was sized for a fixed fleet.',
  ports: [
    inPort('in', 'Invocations', ['http', 'queue', 'stream', 'object']),
    outPort('out', 'Outbound calls', ['http', 'sql', 'nosql', 'cache', 'queue', 'stream', 'object', 'search']),
    IDENTITY_IN,
    TELEMETRY_OUT,
  ],
  props: [
    {
      key: 'memoryMb',
      label: 'Memory',
      type: 'number',
      default: 512,
      min: 128,
      max: 10240,
      step: 128,
      unit: ' MB',
      help: 'Memory allocated to the function — which also determines its share of CPU.',
      impact:
        'CPU scales linearly with memory, so raising it often makes the function finish faster and cost the same or less. Tuning memory is the cheapest performance work in serverless, and almost nobody does it.',
      affects: ['capacity', 'latency', 'cost'],
    },
    {
      key: 'timeoutS',
      label: 'Timeout',
      type: 'number',
      default: 30,
      min: 1,
      max: 900,
      unit: 's',
      help: 'The hard ceiling on a single invocation. The maximum is 15 minutes.',
      impact:
        'When the timeout fires, the invocation is killed with no cleanup. Behind an API Gateway the client has already given up at 29 seconds anyway, so a long timeout there just costs you money for a response nobody will read.',
      affects: ['cost', 'availability'],
    },
    {
      key: 'provisionedConcurrency',
      label: 'Provisioned concurrency',
      type: 'number',
      default: 0,
      min: 0,
      max: 200,
      help: 'Keeps a number of execution environments initialised and warm.',
      impact:
        'Eliminates cold starts for that many concurrent requests, at the price of paying for idle capacity — which is the one thing serverless was supposed to avoid. Worth it for latency-sensitive user-facing paths, wasteful for background work.',
      affects: ['latency', 'cost'],
    },
    {
      key: 'inVpc',
      label: 'Attached to VPC',
      type: 'boolean',
      default: false,
      help: 'Runs the function inside your VPC so it can reach private resources.',
      impact:
        'Required to reach an RDS instance in a private subnet. The cold-start penalty this used to carry is largely gone thanks to shared network interfaces, but a VPC-attached function has no internet access at all unless you route it through a NAT gateway.',
      affects: ['security', 'latency'],
    },
    {
      key: 'reservedConcurrency',
      label: 'Reserved concurrency',
      type: 'number',
      default: 0,
      min: 0,
      max: 1000,
      help: 'Caps how many copies of this function can run at once. Zero means unlimited, up to the account limit.',
      impact:
        'This is the safety valve that stops a Lambda from opening ten thousand connections to a database that accepts five hundred. Uncapped concurrency in front of a relational database is a classic way to take down the database instead of scaling.',
      affects: ['capacity', 'availability'],
    },
  ],
  sim: {
    capacity: 3000,
    latencyMs: 25,
    availability: 0.9995,
    vulnerableTo: ['supply-chain', 'privilege-escalation', 'ssrf'],
    failureModes: [
      { id: 'cold-start', label: 'Cold start latency', symptom: 'p99 latency is many times p50, worst right after a deploy or a quiet period.', remedy: 'Trim the deployment package, initialise clients outside the handler, and use provisioned concurrency for user-facing paths.' },
      { id: 'throttle', label: 'Concurrency throttling', symptom: 'Invocations rejected with a 429 and a spike in the Throttles metric.', remedy: 'Raise the account concurrency limit, or absorb the burst in a queue and let the function drain it.' },
      { id: 'conn-exhaust', label: 'Database connections exhausted', symptom: 'The database reports too many connections while Lambda scales out normally.', remedy: 'Put RDS Proxy in front to pool connections, and set reserved concurrency to something the database can survive.' },
    ],
  },
  cost: {
    perMillionRequests: () => 0.2,
    hourly: (p) => (Number(p.provisionedConcurrency ?? 0) * Number(p.memoryMb ?? 512) / 1024) * 0.000015 * 3600,
    note: `$0.20 per million invocations plus $0.0000166667 per GB-second. The free tier covers a million requests a month, forever. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'AWS CLI',
        lang: 'bash',
        code: `aws lambda create-function \\
  --function-name checkout \\
  --runtime nodejs22.x \\
  --handler index.handler \\
  --role arn:aws:iam::111122223333:role/checkout-role \\
  --zip-file fileb://function.zip \\
  --memory-size 512 --timeout 30 \\
  --environment 'Variables={TABLE=orders}'

# Cap concurrency so a spike cannot drown the database
aws lambda put-function-concurrency \\
  --function-name checkout --reserved-concurrent-executions 50`,
      },
      {
        label: 'Handler shape',
        lang: 'text',
        code: `// Clients go OUTSIDE the handler: they are reused across warm invocations.
const db = new DatabaseClient({ maxConnections: 1 })

export const handler = async (event) => {
  // Everything in here runs on every invocation.
  const body = JSON.parse(event.body ?? '{}')
  const result = await db.query('SELECT 1')
  return { statusCode: 200, body: JSON.stringify(result) }
}`,
      },
    ],
    docs: [{ label: 'Lambda quotas', url: 'https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html' }],
    gotchas: [
      'Initialise SDK clients and database pools outside the handler. Code in the handler runs on every single invocation; code outside it runs once per environment.',
      'A VPC-attached function loses internet access unless you give it a NAT route. Calling a public API from a VPC Lambda without one fails with a timeout, not an error.',
      'Set reserved concurrency whenever a relational database is downstream. Lambda scales faster than the database can accept connections.',
    ],
  },
  concepts: ['serverless', 'cold-starts', 'connection-pooling', 'compute-models'],
  keywords: ['lambda', 'serverless', 'function', 'faas'],
}

const asg: ResourceDef = {
  id: 'aws.asg',
  provider: 'aws',
  name: 'Auto Scaling Group',
  short: 'ASG',
  archetype: 'autoscaler',
  category: 'compute',
  icon: 'scale',
  tagline: 'Keeps the right number of healthy instances running',
  description:
    'An Auto Scaling Group has two jobs, and the second one matters more than people expect. It adds and removes instances to track demand — and it continuously replaces instances that fail their health check. Even at a fixed size, an ASG turns "a machine died and someone has to notice" into something that resolves itself in a couple of minutes.',
  ports: [
    inPort('in', 'Scaling signal', ['telemetry']),
    outPort('out', 'Manages', ['schedule']),
  ],
  props: [
    {
      key: 'minSize',
      label: 'Minimum size',
      type: 'number',
      default: 2,
      min: 0,
      max: 100,
      help: 'The floor the group will never scale below.',
      impact: 'Your capacity at the trough, and your protection against a scale-in event leaving you too thin to absorb a sudden spike.',
      affects: ['availability', 'cost'],
    },
    {
      key: 'maxSize',
      label: 'Maximum size',
      type: 'number',
      default: 10,
      min: 1,
      max: 500,
      help: 'The ceiling scaling will never exceed.',
      impact: 'Your cost cap, and also your capacity cap during a genuine traffic event. Both matter; pick knowing which one you are optimising.',
      affects: ['capacity', 'cost'],
    },
    {
      key: 'healthCheckType',
      label: 'Health check type',
      type: 'select',
      default: 'ELB',
      help: 'What counts as a healthy instance.',
      impact:
        'EC2 health checks only notice when the virtual machine itself fails. An application that has deadlocked, run out of memory or is returning 500 to everything still looks perfectly healthy. ELB health checks ask your application, which is the question you actually care about.',
      affects: ['availability'],
      options: [
        { value: 'EC2', label: 'EC2 (host only)', note: 'Misses every application-level failure' },
        { value: 'ELB', label: 'ELB (application)', note: 'The one you want' },
      ],
      danger: (v) => (v === 'EC2' ? 'Host-only health checks: an instance whose application has hung will stay in service indefinitely.' : null),
    },
  ],
  sim: {},
  cost: { note: 'Free. You pay for the instances it launches.' },
  setup: {
    gotchas: [
      'Scaling out takes as long as your slowest boot plus your health check grace period. If a spike arrives in thirty seconds and your instances need three minutes to warm up, autoscaling is not your answer — headroom is.',
      'Target tracking on a load-balancer request-count target usually behaves better than CPU, because it reacts to demand rather than to a symptom of demand.',
      'Spread the group across every availability zone and let it rebalance. A group pinned to one zone is a single-zone architecture with extra steps.',
    ],
    docs: [{ label: 'Auto Scaling health checks', url: 'https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-health-checks.html' }],
  },
  concepts: ['autoscaling', 'health-checks', 'self-healing'],
  keywords: ['asg', 'autoscaling', 'scale', 'elasticity'],
}

export const awsCompute: ResourceDef[] = [ec2, fargate, lambda, asg]
