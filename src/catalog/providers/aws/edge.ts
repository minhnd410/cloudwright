import type { ResourceDef } from '../../schema/types'
import { inPort, outPort, IDENTITY_IN, TELEMETRY_OUT, TIER_NOTE } from '../../schema/presets'

const route53: ResourceDef = {
  id: 'aws.route53',
  provider: 'aws',
  name: 'Route 53',
  short: 'Route 53',
  archetype: 'dns-zone',
  category: 'edge',
  icon: 'dns',
  tagline: 'Authoritative DNS with health-aware routing',
  description:
    'The first hop of every request. Route 53 answers "what address is example.com" and can answer differently depending on where the client is, which endpoints are currently healthy, or what weights you have set. That makes it a routing tool as much as a naming one — and the only mechanism that can move traffic between regions.',
  ports: [
    inPort('in', 'Lookups', ['dns']),
    outPort('out', 'Resolves to', ['dns', 'http']),
    TELEMETRY_OUT,
  ],
  props: [
    {
      key: 'policy',
      label: 'Routing policy',
      type: 'select',
      default: 'simple',
      help: 'How Route 53 chooses which record to return.',
      impact:
        'Failover and latency policies turn DNS into a traffic controller. Failover swings an entire region away when health checks fail; latency-based routing sends each user to whichever region answers them fastest.',
      affects: ['availability', 'latency'],
      options: [
        { value: 'simple', label: 'Simple', note: 'One answer, always' },
        { value: 'weighted', label: 'Weighted', note: 'Percentage splits — canary releases' },
        { value: 'latency', label: 'Latency-based', note: 'Nearest healthy region' },
        { value: 'failover', label: 'Failover', note: 'Primary until it fails health checks' },
        { value: 'geolocation', label: 'Geolocation', note: 'By where the query came from' },
      ],
    },
    {
      key: 'ttl',
      label: 'Record TTL',
      type: 'number',
      default: 300,
      min: 0,
      max: 86400,
      unit: 's',
      help: 'How long resolvers are allowed to cache the answer.',
      impact:
        'TTL is how long a failover takes to reach everyone, because resolvers keep serving the cached answer until it expires. A 3600s TTL means an hour of some users still hitting a dead endpoint. Low TTLs cost more queries and let you move fast — and you cannot lower a TTL retroactively, so lower it *before* the migration, not during it.',
      affects: ['availability', 'cost'],
      danger: (v) => (Number(v) > 3600 ? 'A TTL above an hour means a failover or a migration takes over an hour to fully propagate.' : null),
    },
    {
      key: 'healthChecks',
      label: 'Health checks',
      type: 'boolean',
      default: false,
      help: 'Route 53 probes endpoints from multiple regions and stops returning unhealthy ones.',
      impact:
        'Without health checks, failover routing has nothing to trigger on and DNS will happily send every user to a dead region until a human changes the record.',
      affects: ['availability', 'cost'],
    },
    {
      key: 'dnssec',
      label: 'DNSSEC signing',
      type: 'boolean',
      default: false,
      help: 'Cryptographically signs your DNS responses so resolvers can detect tampering.',
      impact: 'Defends against DNS spoofing and cache poisoning. The operational cost is real — a lapsed key rotation takes your whole domain offline — but so is the attack it prevents.',
      affects: ['security'],
      advanced: true,
    },
  ],
  sim: {
    capacity: 1000000,
    latencyMs: 20,
    availability: 1,
    mitigates: { 'dns-hijack': 0.5 },
    vulnerableTo: ['dns-hijack'],
    failureModes: [
      { id: 'stale-ttl', label: 'Stale cached records', symptom: 'Some users still reach the old endpoint long after the record changed.', remedy: 'Lower TTL well before a planned migration. During an unplanned one, you can only wait out the TTL you set earlier.' },
      { id: 'dangling', label: 'Dangling DNS record', symptom: 'A CNAME still points at a deleted bucket or load balancer name.', remedy: 'Delete records with the resource. A dangling record lets a stranger claim that name and serve content from your domain — subdomain takeover.' },
    ],
  },
  cost: {
    hourly: () => 0.5 / 730,
    perMillionRequests: () => 0.4,
    note: `$0.50 per hosted zone per month plus $0.40 per million queries. Health checks are $0.50 each per month. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'AWS CLI',
        lang: 'bash',
        code: `# Alias records point at AWS resources, resolve to the current addresses,
# and are free to query — always prefer them over CNAME for AWS targets.
aws route53 change-resource-record-sets --hosted-zone-id Z123 --change-batch '{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "www.example.com",
      "Type": "A",
      "AliasTarget": {
        "HostedZoneId": "Z35SXDOTRQ7X7K",
        "DNSName": "dualstack.my-alb-123.us-east-1.elb.amazonaws.com",
        "EvaluateTargetHealth": true
      }
    }
  }]
}'`,
      },
      {
        label: 'Check what is actually cached',
        lang: 'bash',
        code: `dig +trace www.example.com          # walk the delegation from the root
dig @8.8.8.8 www.example.com        # what a public resolver currently returns
dig www.example.com +noall +answer  # the remaining TTL on the cached answer`,
      },
    ],
    docs: [{ label: 'Routing policies', url: 'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-policy.html' }],
    gotchas: [
      'You cannot CNAME the apex of a domain — the RFC forbids it. Route 53 alias records exist precisely to solve this, and they are free to query.',
      'Lower your TTL days before a planned migration. Once the change is live, the old TTL is what governs how long the old answer sticks around.',
      'Delete DNS records when you delete the resource behind them. A dangling CNAME to a released bucket name is a subdomain takeover waiting to happen.',
    ],
  },
  concepts: ['dns-resolution', 'ttl-and-caching', 'multi-region', 'subdomain-takeover'],
  keywords: ['route53', 'dns', 'domain', 'record', 'ttl'],
}

const cloudfront: ResourceDef = {
  id: 'aws.cloudfront',
  provider: 'aws',
  name: 'CloudFront',
  short: 'CloudFront',
  archetype: 'cdn',
  category: 'edge',
  icon: 'cdn',
  tagline: 'Cache and terminate close to the user',
  description:
    'A content delivery network with hundreds of points of presence worldwide. Cached responses are served from the location nearest the user, so the request never crosses an ocean. Even for content it cannot cache, terminating TLS at the edge and carrying the request over AWS\'s own backbone is meaningfully faster than the open internet — and it absorbs volumetric attacks before they ever reach your origin.',
  ports: [
    inPort('in', 'Viewer requests', ['http']),
    outPort('origin', 'Origin requests', ['http', 'object']),
    TELEMETRY_OUT,
  ],
  props: [
    {
      key: 'cachePolicy',
      label: 'Cache behaviour',
      type: 'select',
      default: 'optimized',
      help: 'What CloudFront is allowed to cache and for how long.',
      impact:
        'Cache hit ratio is the whole game. At 95% hits your origin sees one request in twenty and a traffic spike is a non-event; at 0% the CDN is an expensive extra hop. Every header, cookie and query string you include in the cache key multiplies the number of distinct objects and quietly destroys your hit rate.',
      affects: ['latency', 'capacity', 'cost'],
      options: [
        { value: 'disabled', label: 'Caching disabled', note: 'Every request hits the origin' },
        { value: 'optimized', label: 'Optimised for static', note: 'Compress, ignore cookies' },
        { value: 'all-viewer', label: 'Forward everything', note: 'Destroys the hit ratio' },
      ],
      danger: (v) => (v === 'all-viewer' ? 'Forwarding all headers and cookies makes nearly every request a unique cache key. Your hit ratio collapses to near zero.' : null),
    },
    {
      key: 'ttlSeconds',
      label: 'Default TTL',
      type: 'number',
      default: 86400,
      min: 0,
      max: 31536000,
      unit: 's',
      help: 'How long an object stays cached at the edge when the origin does not say otherwise.',
      impact:
        'Long TTLs mean a near-perfect hit rate and stale content after a deploy. The standard answer is to cache aggressively and change the filename on every build, so a new deploy simply asks for a URL nobody has cached.',
      affects: ['latency', 'cost'],
    },
    {
      key: 'oac',
      label: 'Origin Access Control',
      type: 'boolean',
      default: true,
      help: 'Signs requests to an S3 origin so the bucket can stay entirely private.',
      impact:
        'Lets you serve a bucket through CloudFront while the bucket itself blocks all public access. Without it, people make the bucket public — and a public bucket can be read directly, bypassing your WAF, your logging and your cache.',
      affects: ['security'],
      danger: (v) => (v === false ? 'Without origin access control an S3 origin has to be publicly readable, and anyone can bypass CloudFront entirely.' : null),
    },
    {
      key: 'https',
      label: 'HTTPS policy',
      type: 'select',
      default: 'redirect',
      help: 'How CloudFront treats plain HTTP requests.',
      impact:
        'Redirecting to HTTPS costs one extra round trip; allowing HTTP means credentials and session cookies can travel in clear text across whatever network the user is on.',
      affects: ['security', 'latency'],
      options: [
        { value: 'allow', label: 'Allow HTTP and HTTPS', note: 'Do not' },
        { value: 'redirect', label: 'Redirect HTTP to HTTPS' },
        { value: 'https-only', label: 'HTTPS only', note: 'Rejects plain HTTP outright' },
      ],
      danger: (v) => (v === 'allow' ? 'Plain HTTP accepted. Session cookies and credentials can be read on any shared network.' : null),
    },
  ],
  sim: {
    capacity: 5000000,
    latencyMs: 8,
    availability: 0.9999,
    mitigates: { 'volumetric-ddos': 0.985, 'app-ddos': 0.5 },
    failureModes: [
      { id: 'low-hit-rate', label: 'Cache hit ratio collapse', symptom: 'Origin request volume rises sharply while viewer traffic is flat.', remedy: 'Trim the cache key. Stop forwarding cookies and headers the origin does not vary on.' },
      { id: 'stale', label: 'Stale content after deploy', symptom: 'Users see the old build; a hard refresh fixes it for them only.', remedy: 'Fingerprint asset filenames so each build produces new URLs. Invalidation is a fallback, not a strategy.' },
    ],
  },
  cost: {
    perGbEgress: () => 0.085,
    perMillionRequests: () => 1.0,
    note: `About $0.085/GB for the first 10TB to North America and Europe, plus ~$1 per million HTTPS requests. Notably, transfer from S3 or an ALB into CloudFront is free. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'AWS CLI',
        lang: 'bash',
        code: `# Cache-key hygiene is the whole job. Use a managed policy before writing your own.
aws cloudfront create-distribution --distribution-config '{
  "CallerReference": "prod-2026",
  "Origins": { "Quantity": 1, "Items": [{
    "Id": "s3-site",
    "DomainName": "site-assets.s3.us-east-1.amazonaws.com",
    "S3OriginConfig": { "OriginAccessIdentity": "" },
    "OriginAccessControlId": "E1ABCDEF"
  }]},
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-site",
    "ViewerProtocolPolicy": "redirect-to-https",
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "Compress": true
  },
  "Enabled": true, "Comment": "prod"
}'`,
      },
      {
        label: 'Cache headers that matter',
        lang: 'text',
        code: `# Fingerprinted assets — cache forever, the name changes on every build
Cache-Control: public, max-age=31536000, immutable

# HTML — always revalidate so a deploy is visible immediately
Cache-Control: public, max-age=0, must-revalidate

# Serve stale while fetching a fresh copy: fast AND fresh
Cache-Control: public, max-age=60, stale-while-revalidate=600`,
      },
    ],
    docs: [{ label: 'Cache key and origin requests', url: 'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/controlling-the-cache-key.html' }],
    gotchas: [
      'A certificate used by CloudFront must live in us-east-1, no matter which region everything else is in. This trips up almost everyone once.',
      'Invalidations are billed after the first thousand paths per month and take minutes to complete. Versioned filenames are free and instant.',
      'Distribution changes deploy to every edge location and can take several minutes. It is not a fast feedback loop.',
    ],
  },
  concepts: ['caching', 'cdn', 'tls-termination', 'ddos-mitigation'],
  keywords: ['cloudfront', 'cdn', 'cache', 'edge', 'distribution'],
}

const alb: ResourceDef = {
  id: 'aws.alb',
  provider: 'aws',
  name: 'Application Load Balancer',
  short: 'ALB',
  archetype: 'load-balancer-l7',
  category: 'edge',
  icon: 'balancer',
  tagline: 'Layer 7 routing with real health checks',
  description:
    'An ALB understands HTTP. It can route on hostname, path, header or method, terminate TLS, and — crucially — it checks the health of each target by making an actual request and reading the status code. That last part is what turns a fleet of instances into a service: a target that starts failing is pulled out of rotation within seconds, without anyone being paged.',
  wantsContainer: ['subnet'],
  ports: [
    inPort('in', 'Client requests', ['http', 'grpc']),
    outPort('out', 'To targets', ['http', 'grpc']),
    inPort('cert', 'TLS certificate', ['tls-cert'], { position: 'top' }),
    TELEMETRY_OUT,
  ],
  props: [
    {
      key: 'scheme',
      label: 'Scheme',
      type: 'select',
      default: 'internet-facing',
      help: 'Whether the load balancer has public addresses or only private ones.',
      impact: 'Internet-facing balancers need public subnets. Internal ones are for service-to-service traffic inside the network and are never reachable from outside.',
      affects: ['security'],
      options: [
        { value: 'internet-facing', label: 'Internet-facing' },
        { value: 'internal', label: 'Internal' },
      ],
    },
    {
      key: 'algorithm',
      label: 'Routing algorithm',
      type: 'select',
      default: 'round-robin',
      help: 'How requests are distributed across healthy targets.',
      impact:
        'Round robin assumes every request costs the same. Least outstanding requests adapts when some requests are slow or some targets are struggling, which usually gives a better tail latency on a mixed workload.',
      affects: ['latency', 'capacity'],
      options: [
        { value: 'round-robin', label: 'Round robin' },
        { value: 'least-outstanding', label: 'Least outstanding requests', note: 'Better for uneven request costs' },
      ],
    },
    {
      key: 'healthPath',
      label: 'Health check path',
      type: 'text',
      default: '/healthz',
      help: 'The path the load balancer requests to decide whether a target is healthy.',
      impact:
        'A health check that only returns 200 from a web framework proves nothing except that the process is alive. One that also verifies the database connection catches real failures — but be careful: if the check fails when the database is down, every target is pulled out at once and you have turned a degraded service into a complete outage.',
      affects: ['availability'],
    },
    {
      key: 'deregistrationDelay',
      label: 'Deregistration delay',
      type: 'number',
      default: 30,
      min: 0,
      max: 3600,
      unit: 's',
      help: 'How long the balancer keeps sending in-flight requests to a target that is being removed.',
      impact: 'Too short and deploys drop live requests. Too long and a scale-in event takes many minutes to complete.',
      affects: ['availability'],
    },
    {
      key: 'stickySessions',
      label: 'Sticky sessions',
      type: 'boolean',
      default: false,
      help: 'Pins a client to the same target using a cookie.',
      impact:
        'A workaround for applications that keep session state in memory. It also means load is no longer evenly distributed, and losing one target logs out every user pinned to it. The better fix is to move session state to a shared cache.',
      affects: ['availability', 'capacity'],
    },
    {
      key: 'accessLogs',
      label: 'Access logs to S3',
      type: 'boolean',
      default: false,
      help: 'Writes a line for every request, including the target it chose and how long each phase took.',
      impact: 'The only record of what actually happened at the edge. Without it, "was it slow for everyone or just that one customer" is unanswerable.',
      affects: ['security', 'cost'],
    },
  ],
  sim: {
    capacity: 100000,
    latencyMs: 6,
    availability: 0.9999,
    mitigates: { 'volumetric-ddos': 0.35 },
    failureModes: [
      { id: 'all-unhealthy', label: 'All targets unhealthy', symptom: 'Every request returns 503 and the HealthyHostCount metric is zero.', remedy: 'Check the health check path, port and expected status code, and whether the target security group allows the load balancer\'s group.' },
      { id: 'surge', label: 'Surge queue overflow', symptom: 'Rejected connections and a climbing RejectedConnectionCount while targets look idle.', remedy: 'Scale out the target group. The balancer itself scales, but it cannot invent capacity behind it.' },
    ],
  },
  cost: {
    hourly: () => 0.0225,
    perGbEgress: () => 0.09,
    note: `About $16/month plus capacity units, plus $0.09/GB of data transfer out to the internet. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'AWS CLI',
        lang: 'bash',
        code: `aws elbv2 create-load-balancer \\
  --name prod-alb --type application --scheme internet-facing \\
  --subnets subnet-0pub-a subnet-0pub-b \\
  --security-groups sg-alb

aws elbv2 create-target-group \\
  --name app-tg --protocol HTTP --port 8080 --vpc-id vpc-0abc \\
  --target-type ip \\
  --health-check-path /healthz \\
  --health-check-interval-seconds 15 \\
  --healthy-threshold-count 2 --unhealthy-threshold-count 3 \\
  --matcher HttpCode=200

aws elbv2 create-listener \\
  --load-balancer-arn arn:...:loadbalancer/app/prod-alb/abc \\
  --protocol HTTPS --port 443 \\
  --certificates CertificateArn=arn:aws:acm:...:certificate/xyz \\
  --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 \\
  --default-actions Type=forward,TargetGroupArn=arn:...:targetgroup/app-tg/abc`,
      },
    ],
    docs: [{ label: 'Application Load Balancer', url: 'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html' }],
    gotchas: [
      'An ALB needs subnets in at least two availability zones. It will refuse to be created with one.',
      'Two kinds of health check exist and they should not be identical. A shallow check ("am I running") belongs on the load balancer; a deep check ("can I reach the database") belongs on a separate endpoint used by monitoring — otherwise a database blip pulls every target out at once.',
      'An ALB\'s address changes over time. Always point DNS at it with an alias record, never by hardcoding an IP.',
    ],
  },
  concepts: ['load-balancing', 'health-checks', 'osi-model', 'tls-termination'],
  keywords: ['alb', 'load balancer', 'elb', 'layer 7', 'ingress'],
}

const nlb: ResourceDef = {
  id: 'aws.nlb',
  provider: 'aws',
  name: 'Network Load Balancer',
  short: 'NLB',
  archetype: 'load-balancer-l4',
  category: 'edge',
  icon: 'balancer',
  tagline: 'Layer 4, extreme throughput, static addresses',
  description:
    'An NLB operates at the transport layer. It forwards TCP and UDP connections without looking inside them, which makes it dramatically faster and cheaper at very high throughput — and means it cannot route by path, cannot read a header, and cannot tell a healthy application from one that accepts connections and returns 500 to all of them. Choose it for non-HTTP protocols, for static IP requirements, and for throughput an ALB would struggle with.',
  wantsContainer: ['subnet'],
  ports: [
    inPort('in', 'Client connections', ['tcp', 'udp', 'http']),
    outPort('out', 'To targets', ['tcp', 'udp', 'http']),
    TELEMETRY_OUT,
  ],
  props: [
    {
      key: 'staticIp',
      label: 'Static Elastic IPs',
      type: 'boolean',
      default: true,
      help: 'Pins one unchanging IP address per availability zone.',
      impact: 'The reason NLBs exist for many teams: a partner firewall can allow-list a fixed address, which an ALB\'s rotating addresses make impossible.',
      affects: ['availability'],
    },
    {
      key: 'preserveClientIp',
      label: 'Preserve client IP',
      type: 'boolean',
      default: true,
      help: 'Targets see the original client address rather than the load balancer\'s.',
      impact: 'Rate limiting and geo-blocking in your application depend on seeing the real client address. With this off, every request appears to come from the load balancer.',
      affects: ['security'],
    },
  ],
  sim: {
    capacity: 1000000,
    latencyMs: 1,
    availability: 0.9999,
    mitigates: { 'volumetric-ddos': 0.4 },
  },
  cost: { hourly: () => 0.0225, perGbEgress: () => 0.09, note: `Similar hourly rate to an ALB, plus $0.09/GB of data transfer out. ${TIER_NOTE}` },
  setup: {
    gotchas: [
      'With client IP preservation on, target security groups must allow the *client* range, not the load balancer — a genuinely surprising interaction that breaks connectivity silently.',
      'An NLB cannot terminate HTTP or route on a path. If you find yourself wanting either, you wanted an ALB.',
      'NLB health checks can be TCP-only. A TCP check passing means a socket opened, nothing more.',
    ],
    docs: [{ label: 'Network Load Balancer', url: 'https://docs.aws.amazon.com/elasticloadbalancing/latest/network/introduction.html' }],
  },
  concepts: ['load-balancing', 'osi-model'],
  keywords: ['nlb', 'layer 4', 'tcp', 'static ip'],
}

const apigw: ResourceDef = {
  id: 'aws.apigw',
  provider: 'aws',
  name: 'API Gateway',
  short: 'API Gateway',
  archetype: 'api-gateway',
  category: 'edge',
  icon: 'gateway',
  tagline: 'The front door for APIs: auth, throttling, contracts',
  description:
    'Takes the cross-cutting concerns out of every service behind it. Authentication and authorisation, per-client rate limits, request validation against a schema, usage plans and API keys, and a stable contract that lets you change what is behind it. Particularly natural in front of Lambda, where it supplies the HTTP layer the function does not have.',
  ports: [
    inPort('in', 'API requests', ['http']),
    outPort('out', 'To backend', ['http', 'grpc']),
    IDENTITY_IN,
    TELEMETRY_OUT,
  ],
  props: [
    {
      key: 'apiType',
      label: 'API type',
      type: 'select',
      default: 'http',
      help: 'HTTP APIs are the cheaper, faster, simpler option; REST APIs carry the older, richer feature set.',
      impact: 'HTTP APIs cost roughly a third as much and add less latency. Choose REST only when you need a feature HTTP APIs lack, such as request/response transformation or WAF integration.',
      affects: ['cost', 'latency'],
      options: [
        { value: 'http', label: 'HTTP API', note: '~$1.00 per million' },
        { value: 'rest', label: 'REST API', note: '~$3.50 per million, more features' },
      ],
    },
    {
      key: 'authorizer',
      label: 'Authorisation',
      type: 'select',
      default: 'none',
      help: 'How the gateway decides whether a caller is allowed in.',
      impact:
        'Doing auth at the gateway means every service behind it can assume the caller is already authenticated. A JWT authorizer validates the token signature at the edge, so an invalid token never costs you a backend invocation.',
      affects: ['security', 'cost'],
      options: [
        { value: 'none', label: 'None (public)', note: 'Anyone can call it' },
        { value: 'jwt', label: 'JWT / OIDC', note: 'Validated at the edge' },
        { value: 'iam', label: 'IAM (SigV4)', note: 'For service-to-service' },
        { value: 'lambda', label: 'Lambda authorizer', note: 'Custom logic, cacheable' },
      ],
      danger: (v) => (v === 'none' ? 'An unauthenticated public API. Anyone who finds the URL can invoke your backend, and they will find it.' : null),
    },
    {
      key: 'throttleRps',
      label: 'Throttle limit',
      type: 'number',
      default: 1000,
      min: 1,
      max: 100000,
      unit: ' req/s',
      help: 'The steady-state request rate the gateway will accept before returning 429.',
      impact:
        'This is the circuit breaker that protects everything behind it. A gateway that passes an unbounded flood straight through to your compute tier has not protected anything — it has only forwarded the problem.',
      affects: ['capacity', 'security', 'availability'],
    },
  ],
  sim: {
    capacity: 10000,
    latencyMs: 12,
    availability: 0.9995,
    mitigates: { 'app-ddos': 0.5, 'credential-stuffing': 0.35 },
    failureModes: [
      { id: 'throttled', label: 'Requests throttled', symptom: 'Clients receive 429 with a Retry-After; the 4XXError metric spikes.', remedy: 'Raise the limit if the traffic is legitimate; keep it if it is not. Throttling is doing its job either way.' },
      { id: 'integration-timeout', label: 'Integration timeout', symptom: '504 after 29 seconds regardless of what the backend does.', remedy: 'API Gateway caps integrations at 29 seconds. Long work belongs on a queue with a job-status endpoint.' },
    ],
  },
  cost: {
    perMillionRequests: (p) => (p.apiType === 'rest' ? 3.5 : 1.0),
    note: `HTTP APIs ~$1.00 per million requests, REST APIs ~$3.50. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'AWS CLI (HTTP API + Lambda)',
        lang: 'bash',
        code: `aws apigatewayv2 create-api \\
  --name orders --protocol-type HTTP \\
  --target arn:aws:lambda:us-east-1:111122223333:function:orders

# Validate JWTs at the edge so bad tokens never reach the backend
aws apigatewayv2 create-authorizer \\
  --api-id abc123 --name oidc --authorizer-type JWT \\
  --identity-source '$request.header.Authorization' \\
  --jwt-configuration 'Audience=my-app,Issuer=https://auth.example.com'

aws apigatewayv2 update-stage \\
  --api-id abc123 --stage-name '$default' \\
  --default-route-settings 'ThrottlingBurstLimit=2000,ThrottlingRateLimit=1000'`,
      },
    ],
    docs: [{ label: 'API Gateway', url: 'https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html' }],
    gotchas: [
      'The integration timeout is capped at 29 seconds. Anything longer must become an asynchronous job.',
      'Throttling is per-stage by default. Add usage plans when you need per-customer limits — otherwise one noisy client consumes everyone\'s budget.',
      'Turn on access logging explicitly. It is off by default, and you will want it during the first incident.',
    ],
  },
  concepts: ['api-gateway-pattern', 'rate-limiting', 'authn-vs-authz'],
  keywords: ['api gateway', 'rest', 'http api', 'throttle', 'authorizer'],
}

const waf: ResourceDef = {
  id: 'aws.waf',
  provider: 'aws',
  name: 'AWS WAF',
  short: 'WAF',
  archetype: 'waf',
  category: 'security',
  icon: 'waf',
  tagline: 'Inspects HTTP requests and blocks the hostile ones',
  description:
    'A web application firewall reads the actual content of each request — the URI, the headers, the body — and matches it against rules. Managed rule groups cover the well-known attack classes out of the box, and rate-based rules stop one address from hammering your login endpoint. It is a layer of defence, not a substitute for writing safe code: a WAF that blocks SQL injection is protecting an application that should not have been vulnerable in the first place.',
  ports: [
    inPort('in', 'Requests to inspect', ['http']),
    outPort('out', 'Clean requests', ['http']),
    TELEMETRY_OUT,
  ],
  props: [
    {
      key: 'mode',
      label: 'Rule action',
      type: 'select',
      default: 'count',
      help: 'Whether matching requests are blocked or merely recorded.',
      impact:
        'Always start in count mode. Real traffic contains things that look like attacks, and a new rule set in block mode on day one will reject legitimate customers. Watch the counts for a week, tune, then switch to block.',
      affects: ['security', 'availability'],
      options: [
        { value: 'count', label: 'Count only', note: 'Observe first — always start here' },
        { value: 'block', label: 'Block', note: 'Enforce, once tuned' },
      ],
    },
    {
      key: 'managedRules',
      label: 'Managed rule groups',
      type: 'multiselect',
      default: ['common', 'bad-inputs'],
      help: 'Pre-built rule sets maintained and updated by AWS.',
      impact: 'The core rule set covers the OWASP Top 10 classes. The IP reputation list blocks known botnets and scanners before they cost you anything.',
      affects: ['security'],
      options: [
        { value: 'common', label: 'Core rule set', note: 'Broad OWASP coverage' },
        { value: 'bad-inputs', label: 'Known bad inputs', note: 'Exploit payload signatures' },
        { value: 'sqli', label: 'SQL database', note: 'SQL injection patterns' },
        { value: 'ip-rep', label: 'IP reputation', note: 'Known botnets and scanners' },
        { value: 'bot', label: 'Bot control', note: 'Scrapers and automation' },
      ],
    },
    {
      key: 'rateLimit',
      label: 'Rate-based rule',
      type: 'number',
      default: 2000,
      min: 100,
      max: 100000,
      unit: ' req / 5 min per IP',
      help: 'Blocks any single source address exceeding this rate.',
      impact:
        'The most effective single rule you can write. It stops credential stuffing and application-layer floods from one source cheaply, long before they reach your compute. It does nothing against a distributed attack from thousands of addresses — that is what the layers in front are for.',
      affects: ['security'],
    },
  ],
  sim: {
    capacity: 500000,
    latencyMs: 2,
    mitigates: {
      'sql-injection': 0.85,
      xss: 0.85,
      'app-ddos': 0.7,
      'credential-stuffing': 0.6,
      'port-scan': 0.4,
      ssrf: 0.3,
    },
  },
  cost: {
    hourly: () => (5 + 1 * 3) / 730,
    perMillionRequests: () => 0.6,
    note: `$5 per web ACL per month, $1 per rule per month, $0.60 per million requests. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'Rate-based rule',
        lang: 'json',
        code: `{
  "Name": "rate-limit-per-ip",
  "Priority": 1,
  "Statement": {
    "RateBasedStatement": {
      "Limit": 2000,
      "AggregateKeyType": "IP"
    }
  },
  "Action": { "Block": {} },
  "VisibilityConfig": {
    "SampledRequestsEnabled": true,
    "CloudWatchMetricsEnabled": true,
    "MetricName": "rate-limit-per-ip"
  }
}`,
      },
      {
        label: 'Attach to a load balancer',
        lang: 'bash',
        code: `aws wafv2 associate-web-acl \\
  --web-acl-arn arn:aws:wafv2:us-east-1:111122223333:regional/webacl/prod/abc \\
  --resource-arn arn:aws:elasticloadbalancing:us-east-1:111122223333:loadbalancer/app/prod-alb/abc`,
      },
    ],
    docs: [{ label: 'AWS WAF', url: 'https://docs.aws.amazon.com/waf/latest/developerguide/waf-chapter.html' }],
    gotchas: [
      'Run every new rule in count mode first and read the sampled requests. Blocking real customers is a worse outage than the attack you were preventing.',
      'A WAF sees only what passes through it. If your origin is reachable directly — a public bucket, an unprotected instance IP — the WAF is trivially bypassed.',
      'A WAF attached to CloudFront must be created in us-east-1 with the CLOUDFRONT scope; one attached to an ALB is regional. They are not interchangeable.',
    ],
  },
  concepts: ['owasp-top-10', 'waf', 'rate-limiting', 'defence-in-depth'],
  keywords: ['waf', 'firewall', 'owasp', 'sqli', 'xss'],
}

const shield: ResourceDef = {
  id: 'aws.shield',
  provider: 'aws',
  name: 'Shield Advanced',
  short: 'Shield',
  archetype: 'ddos-shield',
  category: 'security',
  icon: 'shield-check',
  tagline: 'Managed DDoS protection at the network edge',
  description:
    'Shield Standard is on for every AWS customer automatically and absorbs the common network-layer floods at no cost. Shield Advanced adds detection tuned to your traffic, access to the AWS response team during an attack, WAF included at no extra charge, and — the part finance cares about — reimbursement of the scaling charges an attack causes.',
  ports: [
    inPort('in', 'Ingress traffic', ['http', 'tcp', 'udp']),
    outPort('out', 'Scrubbed traffic', ['http', 'tcp', 'udp']),
  ],
  sim: {
    mitigates: { 'volumetric-ddos': 0.99, 'app-ddos': 0.6 },
    latencyMs: 1,
  },
  cost: { hourly: () => 3000 / 730, note: `Shield Advanced is $3,000 per month per organisation with a 1-year commitment. Shield Standard is free and automatic. ${TIER_NOTE}` },
  setup: {
    gotchas: [
      'Shield Standard already protects you against the ordinary network flood. Advanced is about response support, cost protection and L7 detection.',
      'The genuine defence against a volumetric attack is architectural: serve through a CDN, keep origins private, and never publish the origin address.',
    ],
    docs: [{ label: 'AWS Shield', url: 'https://docs.aws.amazon.com/waf/latest/developerguide/shield-chapter.html' }],
  },
  concepts: ['ddos-mitigation', 'defence-in-depth'],
  keywords: ['shield', 'ddos', 'protection'],
}

export const awsEdge: ResourceDef[] = [route53, cloudfront, alb, nlb, apigw, waf, shield]
