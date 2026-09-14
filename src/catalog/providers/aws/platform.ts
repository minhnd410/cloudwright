import type { ResourceDef } from '../../schema/types'
import { inPort, outPort, IDENTITY_IN, TELEMETRY_OUT, TIER_NOTE } from '../../schema/presets'

const iamRole: ResourceDef = {
  id: 'aws.iam-role',
  provider: 'aws',
  name: 'IAM Role',
  short: 'IAM Role',
  archetype: 'identity',
  category: 'security',
  icon: 'key',
  tagline: 'Temporary credentials instead of permanent keys',
  description:
    'A role is a set of permissions that something can assume to get short-lived credentials. Nothing holds a long-lived secret: an instance, a task or a function assumes the role, receives credentials that expire in an hour, and they rotate automatically. The blast radius of any compromise is bounded by what that one role could do — which is why the size of the policy attached to it matters enormously.',
  ports: [
    outPort('grant', 'Grants permissions to', ['identity']),
    inPort('trust', 'Trusted by', ['identity'], { position: 'top' }),
  ],
  props: [
    {
      key: 'scope',
      label: 'Permission scope',
      type: 'select',
      default: 'scoped',
      help: 'How narrowly the attached policy is written.',
      impact:
        'Least privilege is not bureaucracy — it is the variable that decides whether a compromised container means one bucket or your whole account. Start from nothing, add what breaks, and use IAM Access Analyzer to generate a policy from what was actually used.',
      affects: ['security'],
      options: [
        { value: 'admin', label: 'AdministratorAccess', note: 'Full control of the account' },
        { value: 'broad', label: 'Service-wide (e.g. s3:*)', note: 'Every bucket, every action' },
        { value: 'scoped', label: 'Specific actions on specific resources', note: 'What you want' },
      ],
      danger: (v) => {
        if (v === 'admin') return 'Administrator access on a workload role. Any compromise of this workload is a compromise of the entire account.'
        if (v === 'broad') return 'Service-wide wildcard permissions. A single application bug can reach every resource in that service.'
        return null
      },
    },
    {
      key: 'conditions',
      label: 'Condition keys',
      type: 'boolean',
      default: false,
      help: 'Extra constraints on when a permission applies — source VPC, source IP, MFA present, tag match.',
      impact:
        'Conditions turn a broad grant into a narrow one without enumerating every resource. Requiring aws:SourceVpc means a stolen credential is useless from outside your network.',
      affects: ['security'],
    },
    {
      key: 'sessionDuration',
      label: 'Maximum session duration',
      type: 'number',
      default: 3600,
      min: 900,
      max: 43200,
      unit: 's',
      help: 'How long credentials issued by assuming this role remain valid.',
      impact: 'Shorter sessions mean a stolen credential expires sooner. Twelve hours of validity is twelve hours of access for whoever took it.',
      affects: ['security'],
      advanced: true,
    },
  ],
  sim: {
    mitigates: { 'privilege-escalation': 0.6, 'lateral-movement': 0.5, 'data-exfiltration': 0.35, ransomware: 0.3 },
  },
  cost: { note: 'Free.' },
  setup: {
    snippets: [
      {
        label: 'Least-privilege policy',
        lang: 'json',
        code: `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:PutObject"],
    "Resource": "arn:aws:s3:::app-uploads/tenant/\${aws:PrincipalTag/tenant}/*",
    "Condition": {
      "StringEquals": { "aws:SourceVpc": "vpc-0abc" },
      "Bool": { "aws:SecureTransport": "true" }
    }
  }]
}`,
      },
      {
        label: 'Trust policy (who may assume it)',
        lang: 'json',
        code: `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ecs-tasks.amazonaws.com" },
    "Action": "sts:AssumeRole",
    "Condition": {
      "ArnLike": { "aws:SourceArn": "arn:aws:ecs:us-east-1:111122223333:*" },
      "StringEquals": { "aws:SourceAccount": "111122223333" }
    }
  }]
}`,
      },
      {
        label: 'Who actually did what',
        lang: 'bash',
        code: `# Generate a least-privilege policy from real usage
aws accessanalyzer start-policy-generation \\
  --policy-generation-details principalArn=arn:aws:iam::111122223333:role/app \\
  --cloud-trail-details 'trails=[{cloudTrailArn=arn:aws:cloudtrail:...,regions=[us-east-1]}],accessRole=arn:aws:iam::...:role/analyzer,startTime=2026-08-01T00:00:00Z'

# When was this role last used, and for what?
aws iam get-role --role-name app --query 'Role.RoleLastUsed'`,
      },
    ],
    docs: [{ label: 'IAM best practices', url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html' }],
    gotchas: [
      'Never create long-lived access keys for a workload. Roles give rotating credentials automatically; a leaked static key is valid until someone notices.',
      'An explicit Deny always wins, and a service control policy at the organisation level overrides any Allow beneath it. That is the guardrail layer.',
      'iam:PassRole is the classic privilege-escalation path: whoever can pass a powerful role to a service they can launch effectively holds that role.',
    ],
  },
  concepts: ['least-privilege', 'authn-vs-authz', 'blast-radius', 'zero-trust'],
  keywords: ['iam', 'role', 'policy', 'permission', 'sts'],
}

const secrets: ResourceDef = {
  id: 'aws.secrets-manager',
  provider: 'aws',
  name: 'Secrets Manager',
  short: 'Secrets',
  archetype: 'secrets',
  category: 'security',
  icon: 'lock',
  tagline: 'Credentials fetched at runtime, rotated automatically',
  description:
    'Stores database passwords, API keys and certificates encrypted with KMS, retrieved at runtime by anything holding the right IAM permission, and rotated on a schedule by a function you configure. The point is not encryption — it is that the secret stops existing in your git history, your CI logs, your container image and your environment files.',
  ports: [outPort('out', 'Provides secrets', ['secret']), IDENTITY_IN],
  props: [
    {
      key: 'rotation',
      label: 'Automatic rotation',
      type: 'boolean',
      default: false,
      help: 'Replaces the credential on a schedule without downtime, updating both the store and the service.',
      impact:
        'An unrotated credential that leaked two years ago is still valid today. Rotation bounds how long a leak is useful, and it forces you to prove your application can actually handle a credential change — which is the part most teams have never tested.',
      affects: ['security'],
    },
    {
      key: 'rotationDays',
      label: 'Rotation interval',
      type: 'number',
      default: 30,
      min: 1,
      max: 365,
      unit: ' days',
      help: 'How often the credential is replaced.',
      impact: 'The maximum useful lifetime of a stolen credential.',
      affects: ['security'],
      visibleWhen: (p) => p.rotation === true,
    },
  ],
  sim: { mitigates: { 'credential-stuffing': 0.4, 'lateral-movement': 0.3, 'data-exfiltration': 0.25 } },
  cost: { hourly: () => 0.4 / 730, perMillionRequests: () => 5, note: `$0.40 per secret per month plus $0.05 per 10,000 API calls. ${TIER_NOTE}` },
  setup: {
    snippets: [
      {
        label: 'AWS CLI',
        lang: 'bash',
        code: `aws secretsmanager create-secret \\
  --name prod/db/credentials \\
  --secret-string '{"username":"app","password":"..."}' \\
  --kms-key-id alias/app

aws secretsmanager rotate-secret \\
  --secret-id prod/db/credentials \\
  --rotation-lambda-arn arn:aws:lambda:...:function:SecretsManagerRotation \\
  --rotation-rules AutomaticallyAfterDays=30`,
      },
      {
        label: 'Fetch once, cache in memory',
        lang: 'text',
        code: `// Outside the handler — fetched once per execution environment,
// not once per request. Secrets Manager calls are billed and rate-limited.
let cached
async function getSecret() {
  if (cached && Date.now() - cached.at < 300_000) return cached.value
  const res = await sm.getSecretValue({ SecretId: 'prod/db/credentials' })
  cached = { value: JSON.parse(res.SecretString), at: Date.now() }
  return cached.value
}`,
      },
    ],
    docs: [{ label: 'Secrets Manager rotation', url: 'https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html' }],
    gotchas: [
      'Cache the fetched secret in memory with a short TTL. Fetching on every request is slow, expensive and will hit the API rate limit under load.',
      'Parameter Store SecureString is free and fine for configuration secrets that do not need rotation. Secrets Manager earns its cost through rotation.',
      'A secret in an environment variable is visible to anything that can read the process environment, and to most crash reporters. Fetch it into memory instead where you can.',
    ],
  },
  concepts: ['secrets-management', 'credential-rotation', 'least-privilege'],
  keywords: ['secrets manager', 'password', 'credential', 'rotation', 'vault'],
}

const kms: ResourceDef = {
  id: 'aws.kms',
  provider: 'aws',
  name: 'KMS Key',
  short: 'KMS',
  archetype: 'kms',
  category: 'security',
  icon: 'key-square',
  tagline: 'Key material you control, and an audit trail of every use',
  description:
    'A managed key whose material never leaves the service. You do not decrypt with it directly — you ask KMS to decrypt a small data key, and use that. What this buys you is control and visibility: every use is logged in CloudTrail, and revoking the key policy makes every object encrypted under it unreadable immediately, no matter who holds the ciphertext.',
  ports: [outPort('out', 'Encrypts', ['key']), IDENTITY_IN],
  props: [
    {
      key: 'rotation',
      label: 'Annual key rotation',
      type: 'boolean',
      default: true,
      help: 'AWS generates new backing material each year and keeps the old material for decrypting existing data.',
      impact: 'Free, invisible, and required by most compliance regimes. There is no reason to have it off.',
      affects: ['security'],
    },
    {
      key: 'multiRegion',
      label: 'Multi-region key',
      type: 'boolean',
      default: false,
      help: 'Replicates the key into other regions so ciphertext can be decrypted there.',
      impact: 'Necessary for cross-region disaster recovery — otherwise the replica region holds data it cannot read. This is a genuinely common and very unpleasant surprise during a failover test.',
      affects: ['availability', 'cost'],
    },
  ],
  sim: { mitigates: { 'data-exfiltration': 0.45, ransomware: 0.2 } },
  cost: { hourly: () => 1 / 730, perMillionRequests: () => 3, note: `$1 per key per month plus $0.03 per 10,000 requests. ${TIER_NOTE}` },
  setup: {
    gotchas: [
      'The key policy, not IAM, is the root of authority on a KMS key. Lock yourself out of the key policy and only AWS Support can help.',
      'Enable S3 Bucket Keys when encrypting many objects with KMS. It cuts KMS request charges by up to 99%, and those charges can otherwise exceed the storage cost.',
      'Replicate keys to your DR region before the disaster. Encrypted snapshots restored in a region without the key are just noise.',
    ],
    docs: [{ label: 'AWS KMS', url: 'https://docs.aws.amazon.com/kms/latest/developerguide/overview.html' }],
  },
  concepts: ['encryption-at-rest', 'key-management', 'compliance'],
  keywords: ['kms', 'key', 'encryption', 'cmk'],
}

const acm: ResourceDef = {
  id: 'aws.acm',
  provider: 'aws',
  name: 'Certificate Manager',
  short: 'ACM',
  archetype: 'certificate',
  category: 'security',
  icon: 'certificate',
  tagline: 'Free TLS certificates that renew themselves',
  description:
    'Issues and renews public TLS certificates at no cost, and attaches them to load balancers, CloudFront and API Gateway. The renewal is the valuable part: an expired certificate is a complete, self-inflicted outage that takes down every client simultaneously, and it happens to somebody every single week.',
  ports: [outPort('out', 'Certificate', ['tls-cert']), TELEMETRY_OUT],
  props: [
    {
      key: 'validation',
      label: 'Validation method',
      type: 'select',
      default: 'dns',
      help: 'How you prove you control the domain.',
      impact:
        'DNS validation renews automatically forever as long as the CNAME record stays in place. Email validation requires a human to click a link every time, which means it will eventually be missed.',
      affects: ['availability'],
      options: [
        { value: 'dns', label: 'DNS (CNAME record)', note: 'Renews automatically' },
        { value: 'email', label: 'Email', note: 'Needs a human every renewal' },
      ],
      danger: (v) => (v === 'email' ? 'Email validation requires manual action at every renewal. One missed email is a total outage.' : null),
    },
  ],
  sim: {
    mitigates: { 'dns-hijack': 0.3 },
    failureModes: [
      { id: 'expired', label: 'Certificate expired', symptom: 'Every client fails TLS at once with a certificate error. Browsers show a full-page interstitial.', remedy: 'Use DNS validation so renewal is automatic, and alarm on DaysToExpiry well before it matters.' },
      { id: 'wrong-region', label: 'Certificate in the wrong region', symptom: 'CloudFront refuses to accept the certificate.', remedy: 'CloudFront requires certificates in us-east-1 regardless of where anything else lives.' },
    ],
  },
  cost: { note: 'Public certificates are free. Private CA is $400/month.' },
  setup: {
    snippets: [
      {
        label: 'AWS CLI',
        lang: 'bash',
        code: `aws acm request-certificate \\
  --domain-name example.com \\
  --subject-alternative-names '*.example.com' \\
  --validation-method DNS

# Then create the CNAME it asks for and LEAVE IT THERE —
# removing it later silently breaks automatic renewal.
aws acm describe-certificate --certificate-arn arn:... \\
  --query 'Certificate.DomainValidationOptions[].ResourceRecord'`,
      },
    ],
    gotchas: [
      'Leave the validation CNAME record in place forever. Deleting it does nothing today and breaks renewal thirteen months later.',
      'ACM certificates cannot be exported. They only work on AWS services that integrate with ACM — you cannot install one on an EC2 instance yourself.',
      'CloudFront certificates must be in us-east-1. This is the single most common ACM mistake.',
    ],
    docs: [{ label: 'AWS Certificate Manager', url: 'https://docs.aws.amazon.com/acm/latest/userguide/acm-overview.html' }],
  },
  concepts: ['tls-handshake', 'certificate-lifecycle', 'pki'],
  keywords: ['acm', 'certificate', 'tls', 'ssl', 'https'],
}

const cloudwatch: ResourceDef = {
  id: 'aws.cloudwatch',
  provider: 'aws',
  name: 'CloudWatch',
  short: 'CloudWatch',
  archetype: 'monitoring',
  category: 'operations',
  icon: 'chart',
  tagline: 'Metrics, logs and alarms — your only view during an incident',
  description:
    'Collects metrics and logs from every AWS service, and lets you alarm on them. During an incident it is the difference between knowing what broke and guessing. The discipline that matters is choosing what to alarm on: page a human for symptoms users can feel, and leave everything else as a dashboard.',
  ports: [
    inPort('in', 'Telemetry', ['telemetry']),
    outPort('alarm', 'Alarms', ['telemetry'], { position: 'right' }),
  ],
  props: [
    {
      key: 'alarmStrategy',
      label: 'Alarm strategy',
      type: 'select',
      default: 'symptom',
      help: 'What you choose to wake a human for.',
      impact:
        'Alarming on causes — CPU, memory, disk — produces a stream of pages for things users never noticed, and people stop reading them. Alarming on symptoms — error rate, latency, a failing user journey — produces fewer pages that always mean something.',
      affects: ['availability'],
      options: [
        { value: 'everything', label: 'Alarm on everything', note: 'Alert fatigue, guaranteed' },
        { value: 'symptom', label: 'Symptom-based (SLO)', note: 'Page on what users feel' },
        { value: 'none', label: 'Dashboards only', note: 'You find out from customers' },
      ],
      danger: (v) => {
        if (v === 'none') return 'No alarms. Your first signal of an outage is a customer telling you.'
        if (v === 'everything') return 'Alarming on every metric produces noise, and noisy pagers get muted.'
        return null
      },
    },
    {
      key: 'logRetention',
      label: 'Log retention',
      type: 'number',
      default: 30,
      min: 1,
      max: 3653,
      unit: ' days',
      help: 'How long log data is kept before deletion.',
      impact:
        'Log groups default to never expiring, which is how CloudWatch quietly becomes a large line item. Retention also sets how far back a security investigation can look — a breach discovered after 200 days needs logs older than that.',
      affects: ['cost', 'security'],
    },
  ],
  sim: {},
  cost: {
    perGbMonth: () => 0.5,
    note: `$0.50 per GB of log ingestion, $0.03 per GB-month of storage, $0.10 per alarm per month. Ingestion dominates. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'Alarm on what users feel',
        lang: 'bash',
        code: `# Not "CPU is high" — "requests are failing".
aws cloudwatch put-metric-alarm \\
  --alarm-name api-5xx-rate \\
  --namespace AWS/ApplicationELB \\
  --metric-name HTTPCode_Target_5XX_Count \\
  --dimensions Name=LoadBalancer,Value=app/prod-alb/abc \\
  --statistic Sum --period 60 \\
  --evaluation-periods 3 --datapoints-to-alarm 2 \\
  --threshold 10 --comparison-operator GreaterThanThreshold \\
  --treat-missing-data notBreaching \\
  --alarm-actions arn:aws:sns:us-east-1:111122223333:oncall

# Stop paying to store logs forever
aws logs put-retention-policy --log-group-name /ecs/web --retention-in-days 30`,
      },
      {
        label: 'Logs Insights during an incident',
        lang: 'text',
        code: `# Which endpoints are failing, and how badly?
fields @timestamp, status, path, duration
| filter status >= 500
| stats count() as errors, avg(duration) as avg_ms by path
| sort errors desc
| limit 20

# Did the errors start at the deploy?
fields @timestamp, @message
| filter @message like /ERROR/
| stats count() by bin(1m)`,
      },
    ],
    docs: [{ label: 'CloudWatch', url: 'https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html' }],
    gotchas: [
      'Log groups never expire by default. Set retention on every single one or the bill grows forever.',
      'Set treat-missing-data deliberately. An alarm that goes to INSUFFICIENT_DATA when the service dies completely is an alarm that does not fire during the worst outage.',
      'Use datapoints-to-alarm to require several bad periods. A single noisy minute should not page anyone at 3am.',
    ],
  },
  concepts: ['observability', 'slo-sli', 'alerting', 'incident-response'],
  keywords: ['cloudwatch', 'metrics', 'logs', 'alarm', 'monitoring'],
}

const ecr: ResourceDef = {
  id: 'aws.ecr',
  provider: 'aws',
  name: 'Elastic Container Registry',
  short: 'ECR',
  archetype: 'registry',
  category: 'operations',
  icon: 'package',
  tagline: 'Where your images live, and where supply-chain attacks start',
  description:
    'A private container registry integrated with IAM. Beyond storage, it scans images for known vulnerabilities and can enforce immutable tags. That last setting matters more than it sounds: with mutable tags, `v1.2.3` today and `v1.2.3` tomorrow can be entirely different software, and you have no way to tell what is actually running.',
  ports: [outPort('out', 'Images', ['image']), IDENTITY_IN],
  props: [
    {
      key: 'scanOnPush',
      label: 'Vulnerability scanning',
      type: 'boolean',
      default: true,
      help: 'Scans each pushed image against known CVE databases.',
      impact: 'Most vulnerabilities in a container come from the base image, not your code. Scanning tells you which ones, and a base image rebuild usually fixes dozens at once.',
      affects: ['security'],
    },
    {
      key: 'immutableTags',
      label: 'Immutable tags',
      type: 'boolean',
      default: false,
      help: 'Refuses to overwrite an existing tag.',
      impact:
        'Makes a tag mean one specific build forever. Without it, rolling back to a tag can pull different content than the one that was running, and "what version is in production" becomes unanswerable.',
      affects: ['security', 'availability'],
      danger: (v) => (v === false ? 'Mutable tags mean you cannot prove what is running in production, and a rollback may not roll back.' : null),
    },
  ],
  sim: { vulnerableTo: ['supply-chain'], mitigates: { 'supply-chain': 0.45 } },
  cost: { perGbMonth: () => 0.1, note: `$0.10 per GB-month of storage. ${TIER_NOTE}` },
  setup: {
    snippets: [
      {
        label: 'Build and push',
        lang: 'bash',
        code: `aws ecr get-login-password --region us-east-1 \\
  | docker login --username AWS --password-stdin 111122223333.dkr.ecr.us-east-1.amazonaws.com

docker build -t web .
docker tag web:latest 111122223333.dkr.ecr.us-east-1.amazonaws.com/web:$GIT_SHA
docker push 111122223333.dkr.ecr.us-east-1.amazonaws.com/web:$GIT_SHA

# Deploy by DIGEST, not by tag — this is what actually runs
aws ecr describe-images --repository-name web --image-ids imageTag=$GIT_SHA \\
  --query 'imageDetails[0].imageDigest' --output text`,
      },
    ],
    gotchas: [
      'Add a lifecycle policy to expire untagged images. A busy CI pipeline will otherwise accumulate hundreds of gigabytes of orphaned layers.',
      'Pulling from ECR inside a private subnet needs a NAT gateway or ECR and S3 VPC endpoints. The image layers themselves come from S3.',
      'Deploy by digest. A tag is a mutable pointer; a digest is the content.',
    ],
    docs: [{ label: 'ECR', url: 'https://docs.aws.amazon.com/AmazonECR/latest/userguide/what-is-ecr.html' }],
  },
  concepts: ['supply-chain-security', 'containers', 'immutable-infrastructure'],
  keywords: ['ecr', 'registry', 'docker', 'image', 'container'],
}

const pipeline: ResourceDef = {
  id: 'aws.pipeline',
  provider: 'aws',
  name: 'CI/CD Pipeline',
  short: 'Pipeline',
  archetype: 'ci-cd',
  category: 'operations',
  icon: 'pipeline',
  tagline: 'How change reaches production — safely or otherwise',
  description:
    'Builds, tests and deploys your code. It is the most common cause of incidents and simultaneously the fastest way out of one, because the ability to roll back in two minutes is worth more than almost any amount of pre-deployment testing. Deployment strategy is the knob that decides how much of your traffic sees a bad release.',
  ports: [
    outPort('deploy', 'Deploys to', ['deploy']),
    outPort('image', 'Pushes image', ['image'], { position: 'bottom' }),
    IDENTITY_IN,
  ],
  props: [
    {
      key: 'strategy',
      label: 'Deployment strategy',
      type: 'select',
      default: 'rolling',
      help: 'How a new version replaces the old one.',
      impact:
        'All-at-once means every user sees a bad release simultaneously. Rolling limits exposure to a fraction at a time. Canary sends a small percentage first and watches error rates before proceeding. Blue-green keeps the old version running so a rollback is a single traffic switch rather than another deploy.',
      affects: ['availability', 'cost'],
      options: [
        { value: 'all-at-once', label: 'All at once', note: 'Fast, and a bad release hits everyone' },
        { value: 'rolling', label: 'Rolling', note: 'Replace a batch at a time' },
        { value: 'canary', label: 'Canary', note: 'Small percentage first, watch, then proceed' },
        { value: 'blue-green', label: 'Blue/green', note: 'Instant rollback, double the capacity briefly' },
      ],
      danger: (v) => (v === 'all-at-once' ? 'Every user gets the new version simultaneously. A bad release is a full outage with no partial signal.' : null),
    },
    {
      key: 'autoRollback',
      label: 'Automatic rollback',
      type: 'boolean',
      default: true,
      help: 'Reverts the deployment when alarms fire during or shortly after it.',
      impact:
        'Cuts recovery time from however long it takes to wake someone up down to a couple of minutes. It is the highest-leverage reliability feature in a pipeline and it is frequently left off.',
      affects: ['availability'],
    },
    {
      key: 'gates',
      label: 'Pipeline gates',
      type: 'multiselect',
      default: ['tests', 'scan'],
      help: 'Checks that must pass before a deployment proceeds.',
      impact: 'Every gate trades deployment speed for confidence. Too few and bad code ships; too many and people start bypassing the pipeline, which is worse.',
      affects: ['security', 'availability'],
      options: [
        { value: 'tests', label: 'Automated tests' },
        { value: 'scan', label: 'Vulnerability scan' },
        { value: 'iac-scan', label: 'Infrastructure-as-code policy check' },
        { value: 'approval', label: 'Manual approval' },
        { value: 'smoke', label: 'Post-deploy smoke test' },
      ],
    },
  ],
  sim: { mitigates: { 'supply-chain': 0.4 } },
  cost: { hourly: () => 1 / 730, note: `About $1 per active pipeline per month plus build minutes. ${TIER_NOTE}` },
  setup: {
    gotchas: [
      'Deploy frequency and change failure rate move together in the right direction, not against each other. Small, frequent changes are easier to reason about and to revert.',
      'Give the pipeline role only what it needs to deploy. A pipeline with administrator access is a supply-chain attack with a very short path.',
      'Practise the rollback. A rollback path you have never exercised is a hypothesis, not a plan.',
    ],
    docs: [{ label: 'Deployment strategies', url: 'https://docs.aws.amazon.com/whitepapers/latest/overview-deployment-options/introduction.html' }],
  },
  concepts: ['ci-cd', 'deployment-strategies', 'dora-metrics', 'supply-chain-security'],
  keywords: ['pipeline', 'cicd', 'deploy', 'codepipeline', 'github actions'],
}

export const awsPlatform: ResourceDef[] = [iamRole, secrets, kms, acm, cloudwatch, ecr, pipeline]
