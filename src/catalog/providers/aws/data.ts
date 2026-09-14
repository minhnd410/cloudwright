import type { ResourceDef } from '../../schema/types'
import {
  backupProps, encryptionProp, inPort, outPort, multiAzProp, publicAccessProp,
  IDENTITY_IN, TELEMETRY_OUT, TIER_NOTE,
} from '../../schema/presets'

const DB_SIZES = [
  { value: 'db.t3.micro', label: 'db.t3.micro', meta: { rps: 150, conns: 85, hourly: 0.017 }, note: 'Burstable, dev only' },
  { value: 'db.t3.medium', label: 'db.t3.medium', meta: { rps: 600, conns: 340, hourly: 0.068 }, note: 'Burstable' },
  { value: 'db.m5.large', label: 'db.m5.large', meta: { rps: 1400, conns: 680, hourly: 0.171 }, note: 'General purpose' },
  { value: 'db.m5.xlarge', label: 'db.m5.xlarge', meta: { rps: 2800, conns: 1365, hourly: 0.342 }, note: 'General purpose' },
  { value: 'db.r5.2xlarge', label: 'db.r5.2xlarge', meta: { rps: 6000, conns: 5000, hourly: 0.96 }, note: 'Memory optimised — bigger buffer pool' },
]

const rds: ResourceDef = {
  id: 'aws.rds',
  provider: 'aws',
  name: 'RDS (PostgreSQL / MySQL)',
  short: 'RDS',
  archetype: 'relational-db',
  category: 'database',
  icon: 'database',
  tagline: 'Managed relational database with real transactions',
  description:
    'A managed relational engine — Postgres, MySQL, MariaDB, SQL Server or Oracle — where AWS handles the host, the patching, the backups and the failover, and you handle the schema, the queries and the indexes. It gives you ACID transactions and joins, which is why it remains the correct default for anything with relationships in it. It also scales vertically far more easily than horizontally, which is the constraint that shapes most architectures built on it.',
  wantsContainer: ['subnet'],
  ports: [
    inPort('in', 'SQL connections', ['sql']),
    outPort('replica', 'Replication', ['sql'], { position: 'bottom' }),
    IDENTITY_IN,
    TELEMETRY_OUT,
  ],
  props: [
    {
      key: 'size',
      label: 'Instance class',
      type: 'select',
      default: 'db.m5.large',
      help: 'The CPU and memory of the database host. Memory matters most — it determines how much of your working set stays in the buffer pool.',
      impact:
        'Also sets the connection limit, which on Postgres is derived from memory. A small instance may accept only a few hundred connections, and a serverless fleet will exhaust that long before the CPU is busy.',
      affects: ['capacity', 'cost', 'latency'],
      options: DB_SIZES,
    },
    multiAzProp('Multi-AZ standby'),
    {
      key: 'readReplicas',
      label: 'Read replicas',
      type: 'number',
      default: 0,
      min: 0,
      max: 5,
      help: 'Asynchronous copies that serve read-only queries.',
      impact:
        'The standard way to scale reads. The catch is replication lag: a replica is always slightly behind, so a user who writes and immediately reads may not see their own change. Route reads that must be current to the primary.',
      affects: ['capacity', 'cost', 'availability'],
    },
    publicAccessProp({
      impact:
        'A publicly accessible database is scanned within minutes of going live. Every large database ransom campaign of the last decade has worked by finding exposed instances and trying default credentials.',
    }),
    encryptionProp(),
    ...backupProps(),
    {
      key: 'connectionPooling',
      label: 'RDS Proxy',
      type: 'boolean',
      default: false,
      help: 'A managed connection pooler that sits between your application and the database.',
      impact:
        'Essential in front of Lambda or any fleet that scales faster than the database can accept connections. It multiplexes thousands of short-lived client connections onto a small pool of real ones, and it also holds connections open through a failover so the application does not see one.',
      affects: ['capacity', 'availability', 'cost'],
    },
    {
      key: 'deletionProtection',
      label: 'Deletion protection',
      type: 'boolean',
      default: true,
      help: 'Refuses to delete the instance until the flag is removed.',
      impact: 'The last line of defence against a mistyped command or a Terraform plan nobody read carefully.',
      affects: ['durability'],
      danger: (v) => (v === false ? 'Deletion protection off. One bad apply or one wrong identifier and the database is gone.' : null),
    },
  ],
  sim: {
    capacity: 1400,
    latencyMs: 8,
    stateful: true,
    availability: 0.995,
    vulnerableTo: ['sql-injection', 'ransomware', 'data-exfiltration', 'credential-stuffing'],
    failureModes: [
      { id: 'conn-exhaust', label: 'Connection limit reached', symptom: 'New connections rejected with "too many connections" while CPU sits low.', remedy: 'Add RDS Proxy or an application-side pool. Connection count, not CPU, is usually the first wall you hit.' },
      { id: 'failover', label: 'Multi-AZ failover', symptom: 'Writes fail for 60–120 seconds, then recover on their own. The endpoint DNS now points at the former standby.', remedy: 'Expected behaviour. Applications need connection retry logic — existing connections are broken and must be re-established.' },
      { id: 'replica-lag', label: 'Replica lag', symptom: 'Users report reading stale data immediately after writing it.', remedy: 'Route read-after-write to the primary, or wait for the replica to catch up before reading.' },
      { id: 'storage-full', label: 'Storage full', symptom: 'The instance enters storage-full state and stops accepting writes entirely.', remedy: 'Enable storage autoscaling and alarm on FreeStorageSpace. Growing storage is online; running out is not.' },
      { id: 'long-lock', label: 'Lock contention', symptom: 'Query latency climbs across the board; one long transaction is blocking everything behind it.', remedy: 'Find it with pg_stat_activity, set statement_timeout, and never run a long migration inside a transaction that holds a table lock.' },
    ],
  },
  cost: {
    hourly: (p) => {
      const base = DB_SIZES.find((s) => s.value === p.size)?.meta.hourly ?? 0.171
      const mult = (p.multiAz ? 2 : 1) + Number(p.readReplicas ?? 0)
      return Number(base) * mult + (p.connectionPooling ? 0.015 : 0)
    },
    perGbMonth: () => 0.115,
    note: `On-demand pricing; reserved instances save up to 60%. Multi-AZ doubles the instance cost. ${TIER_NOTE}`,
  },
  setup: {
    console: [
      'RDS → Create database → Standard create. Pick the engine and version deliberately; major upgrades are disruptive.',
      'Place it in a DB subnet group made of private subnets in at least two zones.',
      'Set "Public access" to No. There is almost never a good reason for anything else.',
      'Enable Multi-AZ, storage autoscaling, deletion protection and Performance Insights.',
      'Store the master password in Secrets Manager and let RDS rotate it.',
    ],
    snippets: [
      {
        label: 'AWS CLI',
        lang: 'bash',
        code: `aws rds create-db-instance \\
  --db-instance-identifier prod-pg \\
  --engine postgres --engine-version 16.4 \\
  --db-instance-class db.m5.large \\
  --allocated-storage 100 --max-allocated-storage 1000 \\
  --storage-encrypted \\
  --multi-az \\
  --no-publicly-accessible \\
  --db-subnet-group-name private-db-subnets \\
  --vpc-security-group-ids sg-db \\
  --backup-retention-period 7 \\
  --deletion-protection \\
  --manage-master-user-password \\
  --enable-performance-insights`,
      },
      {
        label: 'Terraform',
        lang: 'hcl',
        code: `resource "aws_db_instance" "prod" {
  identifier     = "prod-pg"
  engine         = "postgres"
  engine_version = "16.4"
  instance_class = "db.m5.large"

  allocated_storage     = 100
  max_allocated_storage = 1000 # storage autoscaling
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.db.arn

  multi_az               = true
  publicly_accessible    = false
  db_subnet_group_name   = aws_db_subnet_group.private.name
  vpc_security_group_ids = [aws_security_group.db.id]

  backup_retention_period = 7
  deletion_protection     = true
  skip_final_snapshot     = false

  manage_master_user_password = true # managed in Secrets Manager
  performance_insights_enabled = true
}`,
      },
      {
        label: 'Find what is blocking you',
        lang: 'sql',
        code: `-- Postgres: currently running queries, longest first
SELECT pid, now() - query_start AS duration, state, wait_event_type, query
FROM pg_stat_activity
WHERE state <> 'idle'
ORDER BY duration DESC;

-- Who is blocking whom
SELECT blocked.pid AS blocked_pid, blocking.pid AS blocking_pid,
       blocked.query AS blocked_query, blocking.query AS blocking_query
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking
  ON blocking.pid = ANY(pg_blocking_pids(blocked.pid));

-- Connection usage against the limit
SELECT count(*), setting::int AS max_connections
FROM pg_stat_activity, pg_settings
WHERE name = 'max_connections' GROUP BY setting;`,
      },
    ],
    docs: [
      { label: 'RDS User Guide', url: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Welcome.html' },
      { label: 'Multi-AZ failover', url: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.Failover.html' },
    ],
    gotchas: [
      'Multi-AZ failover takes 60–120 seconds for a standard Multi-AZ instance, and existing connections are severed. Your application needs retry logic or the failover is still an outage, just a shorter one.',
      'Multi-AZ is not a read replica. The standby serves no traffic and exists purely for failover.',
      'Connection limits scale with instance memory. Serverless compute in front of a small instance will exhaust them long before CPU becomes interesting.',
      'A restore creates a new instance with a new endpoint. Recovery time includes updating everything that pointed at the old one.',
    ],
  },
  concepts: ['acid-transactions', 'read-replicas', 'connection-pooling', 'rpo-rto', 'sql-injection'],
  keywords: ['rds', 'postgres', 'mysql', 'sql', 'database', 'relational'],
}

const aurora: ResourceDef = {
  id: 'aws.aurora',
  provider: 'aws',
  name: 'Aurora Serverless v2',
  short: 'Aurora',
  archetype: 'relational-db',
  category: 'database',
  icon: 'database',
  tagline: 'Postgres-compatible, storage decoupled from compute',
  description:
    'Aurora re-implements the storage layer beneath a Postgres- or MySQL-compatible engine: data is written to a distributed, self-healing volume replicated six ways across three availability zones. Replicas share that storage rather than copying it, so adding one is fast and lag is measured in milliseconds. The serverless v2 flavour scales capacity in fine increments and can scale to near zero between bursts.',
  wantsContainer: ['subnet'],
  ports: [
    inPort('in', 'SQL connections', ['sql']),
    outPort('replica', 'Reader endpoint', ['sql'], { position: 'bottom' }),
    IDENTITY_IN,
    TELEMETRY_OUT,
  ],
  props: [
    {
      key: 'minAcu',
      label: 'Minimum capacity',
      type: 'number',
      default: 0.5,
      min: 0,
      max: 128,
      step: 0.5,
      unit: ' ACU',
      help: 'The floor Aurora Serverless scales down to. One ACU is roughly 2 GB of memory with matched CPU.',
      impact: 'A low floor saves money when idle but means a cold burst has to scale up, and scaling takes seconds you may not have.',
      affects: ['cost', 'latency'],
    },
    {
      key: 'maxAcu',
      label: 'Maximum capacity',
      type: 'number',
      default: 16,
      min: 1,
      max: 256,
      step: 1,
      unit: ' ACU',
      help: 'The ceiling, and therefore your cost cap.',
      impact: 'Set the ceiling deliberately. A runaway query with an unlimited ceiling produces a spectacular bill.',
      affects: ['capacity', 'cost'],
    },
    {
      key: 'readerCount',
      label: 'Reader instances',
      type: 'number',
      default: 1,
      min: 0,
      max: 15,
      help: 'Read-only endpoints sharing the same storage volume.',
      impact: 'Replication lag is typically single-digit milliseconds because readers attach to the same volume rather than replaying a log. A reader is also the failover target, so having at least one is a genuine availability improvement.',
      affects: ['capacity', 'availability', 'cost'],
    },
    ...backupProps(),
  ],
  sim: {
    capacity: 5000,
    latencyMs: 5,
    stateful: true,
    availability: 0.9999,
    vulnerableTo: ['sql-injection', 'data-exfiltration'],
    failureModes: [
      { id: 'scale-lag', label: 'Scaling lag on a cold burst', symptom: 'Latency spikes at the start of a traffic surge, then settles.', remedy: 'Raise the minimum capacity so there is warm headroom for the first seconds of a spike.' },
      { id: 'failover', label: 'Writer failover', symptom: 'Writes fail briefly; a reader is promoted, typically in under 30 seconds.', remedy: 'Use the cluster writer endpoint and retry. Never hardcode an instance endpoint.' },
    ],
  },
  cost: {
    hourly: (p) => Number(p.minAcu ?? 0.5) * 0.12 * (1 + Number(p.readerCount ?? 0)),
    perGbMonth: () => 0.1,
    note: `$0.12 per ACU-hour plus storage and I/O. Idle costs are low but rarely zero. ${TIER_NOTE}`,
  },
  setup: {
    gotchas: [
      'Use the cluster endpoints. The writer endpoint always points at the current primary; the reader endpoint load-balances across readers. Instance endpoints break on failover.',
      'Aurora bills I/O per request on the standard configuration. A read-heavy workload with a poor cache hit rate can cost more in I/O than in compute — Aurora I/O-Optimized removes that charge for a higher fixed rate.',
      'Aurora is wire-compatible with Postgres and MySQL, not identical. Check extension support before assuming a drop-in migration.',
    ],
    docs: [{ label: 'Aurora Serverless v2', url: 'https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.html' }],
  },
  concepts: ['read-replicas', 'acid-transactions', 'serverless'],
  keywords: ['aurora', 'serverless', 'postgres', 'mysql', 'cluster'],
}

const dynamodb: ResourceDef = {
  id: 'aws.dynamodb',
  provider: 'aws',
  name: 'DynamoDB',
  short: 'DynamoDB',
  archetype: 'nosql-db',
  category: 'database',
  icon: 'table',
  tagline: 'Single-digit millisecond key-value at any scale',
  description:
    'A fully managed key-value and document store that holds its latency flat whether you have a thousand items or a trillion. There is no server, no connection limit and no maintenance window. The price is that you must design the table around your access patterns up front: DynamoDB is fast because it only ever does lookups by partition key, and a query it was not designed for is either a costly scan or impossible.',
  ports: [
    inPort('in', 'API requests', ['nosql']),
    outPort('stream', 'Change stream', ['stream'], { position: 'bottom' }),
    IDENTITY_IN,
    TELEMETRY_OUT,
  ],
  props: [
    {
      key: 'capacityMode',
      label: 'Capacity mode',
      type: 'select',
      default: 'on-demand',
      help: 'Whether you pay per request or reserve throughput in advance.',
      impact:
        'On-demand absorbs any spike instantly and costs roughly seven times more per request. Provisioned is far cheaper for steady, predictable load — and throttles the moment you exceed what you reserved.',
      affects: ['capacity', 'cost'],
      options: [
        { value: 'on-demand', label: 'On-demand', note: 'No capacity planning, higher unit cost' },
        { value: 'provisioned', label: 'Provisioned', note: 'Cheaper when steady, throttles when exceeded' },
      ],
    },
    {
      key: 'partitionKeyQuality',
      label: 'Partition key distribution',
      type: 'select',
      default: 'high',
      help: 'How evenly your access spreads across partition key values.',
      impact:
        'This is the single most important design decision in DynamoDB. A key like `tenant_id` where one tenant is a hundred times bigger than the rest creates a hot partition, and that one partition throttles while the table as a whole looks almost idle. Spread the key — add a shard suffix, use a composite key — or accept the throttling.',
      affects: ['capacity', 'latency'],
      options: [
        { value: 'high', label: 'Well distributed', note: 'Many distinct, evenly-used keys' },
        { value: 'medium', label: 'Somewhat skewed' },
        { value: 'low', label: 'Hot partition', note: 'A few keys take most of the traffic' },
      ],
      danger: (v) => (v === 'low' ? 'A hot partition throttles at roughly 3,000 read units per second regardless of how much capacity the table has overall.' : null),
    },
    {
      key: 'globalTables',
      label: 'Global tables',
      type: 'boolean',
      default: false,
      help: 'Multi-region, active-active replication with last-writer-wins conflict resolution.',
      impact:
        'Gives local read and write latency worldwide and survives losing an entire region. It also makes concurrent writes to the same item in two regions resolve by timestamp — silently discarding one of them. Design for that or do not use it.',
      affects: ['availability', 'latency', 'cost'],
    },
    {
      key: 'pitr',
      label: 'Point-in-time recovery',
      type: 'boolean',
      default: false,
      help: 'Continuous backup allowing a restore to any second within the last 35 days.',
      impact: 'The undo button for a bad deploy that corrupted data. Roughly a 20% storage surcharge, and worth it every time.',
      affects: ['durability', 'cost'],
    },
    {
      key: 'ttlEnabled',
      label: 'Item TTL',
      type: 'boolean',
      default: false,
      help: 'Deletes items automatically once a timestamp attribute passes.',
      impact: 'Free garbage collection for sessions, carts and caches. Deletion happens within about 48 hours of expiry, not instantly — so never rely on TTL for security-sensitive expiry.',
      affects: ['cost'],
    },
  ],
  sim: {
    capacity: 40000,
    latencyMs: 4,
    stateful: true,
    availability: 0.9999,
    vulnerableTo: ['data-exfiltration', 'privilege-escalation'],
    failureModes: [
      { id: 'hot-partition', label: 'Hot partition throttling', symptom: 'ThrottledRequests climbs while consumed capacity sits far below what is provisioned.', remedy: 'Redesign the partition key to spread load, or add write sharding with a random suffix.' },
      { id: 'scan', label: 'Full table scan', symptom: 'One query consumes enormous capacity and starves everything else.', remedy: 'Add a global secondary index for that access pattern. Scan is for batch jobs, never for a request path.' },
    ],
  },
  cost: {
    perMillionRequests: (p) => (p.capacityMode === 'on-demand' ? 1.25 : 0.2),
    perGbMonth: () => 0.25,
    note: `On-demand: ~$1.25 per million writes, ~$0.25 per million reads. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'AWS CLI',
        lang: 'bash',
        code: `aws dynamodb create-table \\
  --table-name orders \\
  --attribute-definitions \\
      AttributeName=pk,AttributeType=S \\
      AttributeName=sk,AttributeType=S \\
  --key-schema \\
      AttributeName=pk,KeyType=HASH \\
      AttributeName=sk,KeyType=RANGE \\
  --billing-mode PAY_PER_REQUEST \\
  --stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES

aws dynamodb update-continuous-backups \\
  --table-name orders \\
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true`,
      },
      {
        label: 'Single-table design',
        lang: 'text',
        code: `# One table, many entity types, keys shaped by access pattern.
# Read the item collection for a customer in ONE query:

pk                  sk                      attributes
CUSTOMER#123        PROFILE                 name, email, tier
CUSTOMER#123        ORDER#2026-09-01#A17    total, status
CUSTOMER#123        ORDER#2026-09-04#B02    total, status
CUSTOMER#123        ADDRESS#home            line1, city

# Query pk = CUSTOMER#123 AND begins_with(sk, 'ORDER#')
#   → that customer's orders, sorted by date, one request, no joins.
#
# The rule: design the keys from the queries you need, never from the
# shape of the data. There are no joins to rescue you later.`,
      },
    ],
    docs: [{ label: 'DynamoDB best practices', url: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html' }],
    gotchas: [
      'You cannot change the partition key after creation. Getting it wrong means migrating to a new table.',
      'Strongly consistent reads cost twice as much and are only available in the region the item was written to. The default is eventually consistent.',
      'An item is capped at 400 KB. Large payloads go in S3 with a pointer in the item.',
    ],
  },
  concepts: ['nosql-modelling', 'partition-keys', 'eventual-consistency', 'cap-theorem'],
  keywords: ['dynamodb', 'nosql', 'key value', 'table', 'partition'],
}

const elasticache: ResourceDef = {
  id: 'aws.elasticache',
  provider: 'aws',
  name: 'ElastiCache (Redis)',
  short: 'ElastiCache',
  archetype: 'cache',
  category: 'database',
  icon: 'cache',
  tagline: 'Sub-millisecond memory between you and the database',
  description:
    'An in-memory data store used as a cache, a session store, a rate limiter or a lightweight queue. Reads return in well under a millisecond, which lets a small cluster absorb read traffic that would need a far larger database to serve. The hard parts are all about what happens when the cache is wrong or missing: invalidation, stampedes, and the fact that everything in it can vanish at once.',
  wantsContainer: ['subnet'],
  ports: [inPort('in', 'Cache operations', ['cache']), IDENTITY_IN, TELEMETRY_OUT],
  props: [
    {
      key: 'nodeType',
      label: 'Node type',
      type: 'select',
      default: 'cache.m6g.large',
      help: 'Memory determines how much of your working set fits, which determines your hit rate.',
      impact: 'Too small and the eviction policy starts throwing out data you were about to ask for, and the hit rate silently degrades.',
      affects: ['capacity', 'cost'],
      options: [
        { value: 'cache.t4g.micro', label: 'cache.t4g.micro (0.5 GB)', meta: { hourly: 0.016, rps: 15000 } },
        { value: 'cache.m6g.large', label: 'cache.m6g.large (6.4 GB)', meta: { hourly: 0.156, rps: 90000 } },
        { value: 'cache.r6g.xlarge', label: 'cache.r6g.xlarge (26 GB)', meta: { hourly: 0.411, rps: 180000 } },
      ],
    },
    multiAzProp('Multi-AZ with automatic failover'),
    {
      key: 'evictionPolicy',
      label: 'Eviction policy',
      type: 'select',
      default: 'allkeys-lru',
      help: 'What Redis discards when memory runs out.',
      impact:
        'For a pure cache, allkeys-lru is right — old entries disappear and are recomputed. For a session store, eviction means logging users out, so noeviction with proper TTLs is safer even though writes then start failing when full.',
      affects: ['availability', 'capacity'],
      options: [
        { value: 'allkeys-lru', label: 'allkeys-lru', note: 'Evict least recently used — for caches' },
        { value: 'volatile-lru', label: 'volatile-lru', note: 'Only evict keys that have a TTL' },
        { value: 'noeviction', label: 'noeviction', note: 'Writes fail when full — for queues and sessions' },
      ],
    },
    {
      key: 'authEnabled',
      label: 'AUTH + encryption in transit',
      type: 'boolean',
      default: true,
      help: 'Requires a token and encrypts the connection.',
      impact:
        'Redis historically shipped with no authentication at all. Unauthenticated instances reachable from the internet are found and drained by automated scanners continuously — it is one of the most reliably exploited misconfigurations there is.',
      affects: ['security'],
      danger: (v) => (v === false ? 'An unauthenticated Redis endpoint. If it is reachable at all, assume it will be found.' : null),
    },
  ],
  sim: {
    capacity: 90000,
    latencyMs: 1,
    stateful: true,
    availability: 0.999,
    vulnerableTo: ['data-exfiltration', 'lateral-movement'],
    failureModes: [
      { id: 'stampede', label: 'Cache stampede', symptom: 'A popular key expires and every concurrent request misses at once, hitting the database simultaneously.', remedy: 'Add jitter to TTLs, use a lock so only one request recomputes, and serve stale while refreshing in the background.' },
      { id: 'cold-cache', label: 'Cold cache after restart', symptom: 'A failover or restart empties the cache and the database takes the full read load without warning.', remedy: 'Warm critical keys on start-up, and make sure the database can survive a 0% hit rate at least briefly.' },
      { id: 'evictions', label: 'Memory pressure evictions', symptom: 'The Evictions metric climbs and hit rate falls; nothing else looks wrong.', remedy: 'Scale up memory or shorten TTLs. Alarm on evictions — they are the earliest warning.' },
    ],
  },
  cost: {
    hourly: (p) => {
      const base = { 'cache.t4g.micro': 0.016, 'cache.m6g.large': 0.156, 'cache.r6g.xlarge': 0.411 }[String(p.nodeType)] ?? 0.156
      return base * (p.multiAz ? 2 : 1)
    },
    note: `Per node-hour; a Multi-AZ replica doubles it. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'Cache-aside, done properly',
        lang: 'text',
        code: `// The standard pattern, plus the two things people forget.
async function getUser(id) {
  const key = \`user:\${id}\`
  const hit = await redis.get(key)
  if (hit) return JSON.parse(hit)

  // 1. A lock so a thousand concurrent misses cause ONE database read
  const lock = await redis.set(\`\${key}:lock\`, '1', 'NX', 'EX', 5)
  if (!lock) { await sleep(50); return getUser(id) }

  const user = await db.query('SELECT * FROM users WHERE id = $1', [id])

  // 2. Jitter, so a million keys written together do not expire together
  const ttl = 300 + Math.floor(Math.random() * 60)
  await redis.set(key, JSON.stringify(user), 'EX', ttl)
  await redis.del(\`\${key}:lock\`)
  return user
}`,
      },
    ],
    docs: [{ label: 'ElastiCache best practices', url: 'https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/BestPractices.html' }],
    gotchas: [
      'A cache is not a database. Anything you cannot recompute must not live only in Redis — a failover can lose recent writes.',
      'Add jitter to every TTL. Keys written in the same batch expire in the same instant, which is the mechanism behind most stampedes.',
      'Alarm on evictions and hit rate, not just CPU. A cache degrades quietly long before it fails loudly.',
    ],
  },
  concepts: ['caching', 'cache-invalidation', 'thundering-herd'],
  keywords: ['elasticache', 'redis', 'memcached', 'cache', 'session'],
}

const s3: ResourceDef = {
  id: 'aws.s3',
  provider: 'aws',
  name: 'S3 Bucket',
  short: 'S3',
  archetype: 'object-store',
  category: 'storage',
  icon: 'bucket',
  tagline: 'Effectively infinite object storage over HTTP',
  description:
    'A flat namespace of objects addressed by key, durable to eleven nines, with no capacity to provision. It backs static websites, data lakes, backups, logs and media. It is also, historically, the most common source of accidental public data exposure in the entire cloud — not because it is insecure, but because "make it public" was once a single, very easy click.',
  ports: [
    inPort('in', 'Object operations', ['object']),
    outPort('event', 'Event notifications', ['queue', 'stream'], { position: 'bottom' }),
    IDENTITY_IN,
  ],
  props: [
    {
      key: 'publicAccess',
      label: 'Block all public access',
      type: 'boolean',
      default: true,
      help: 'An account- and bucket-level override that refuses public ACLs and policies regardless of what anything else says.',
      impact:
        'Leave this on. Serve public content through CloudFront with Origin Access Control instead — you keep the WAF, the logs and the cache, and the bucket itself stays unreachable.',
      affects: ['security'],
      danger: (v) => (v === false ? 'Public access is not blocked. One careless ACL or bucket policy exposes every object to the internet.' : null),
    },
    {
      key: 'versioning',
      label: 'Versioning',
      type: 'boolean',
      default: false,
      help: 'Keeps every version of an object, including delete markers.',
      impact:
        'This is what makes a bucket recoverable. Without it an overwrite or a delete is permanent — and with ransomware, versioning plus MFA delete is often the only reason the data comes back.',
      affects: ['durability', 'cost'],
    },
    encryptionProp(),
    {
      key: 'storageClass',
      label: 'Storage class',
      type: 'select',
      default: 'standard',
      help: 'The trade between storage price and retrieval price or delay.',
      impact:
        'Intelligent-Tiering moves objects between tiers automatically based on access and is the right default when you do not know the pattern. Glacier tiers are extremely cheap to hold and slow and costly to read — fine for compliance archives, painful for anything you might actually need in a hurry.',
      affects: ['cost', 'latency'],
      options: [
        { value: 'standard', label: 'Standard', note: '$0.023/GB-month' },
        { value: 'intelligent', label: 'Intelligent-Tiering', note: 'Automatic, small monitoring fee' },
        { value: 'ia', label: 'Standard-IA', note: '$0.0125/GB + retrieval charge' },
        { value: 'glacier', label: 'Glacier Instant Retrieval', note: '$0.004/GB, higher retrieval cost' },
      ],
    },
    {
      key: 'lifecycle',
      label: 'Lifecycle rules',
      type: 'boolean',
      default: false,
      help: 'Transitions or expires objects automatically as they age.',
      impact: 'The main lever on storage cost over time, and the only way to stop incomplete multipart uploads accumulating invisibly and billing you forever.',
      affects: ['cost'],
    },
  ],
  sim: {
    capacity: 100000,
    latencyMs: 25,
    stateful: true,
    availability: 0.9999,
    vulnerableTo: ['data-exfiltration', 'ransomware'],
    failureModes: [
      { id: 'public-leak', label: 'Objects publicly readable', symptom: 'Data appears in a search engine or a security researcher\'s report before it appears in yours.', remedy: 'Enable Block Public Access at the account level. Serve public content via CloudFront with Origin Access Control.' },
      { id: 'request-cost', label: 'Request cost explosion', symptom: 'The bill is dominated by request charges rather than storage.', remedy: 'Small-object workloads pay per request. Batch, or put a cache in front.' },
    ],
  },
  cost: {
    perGbMonth: (p) => ({ standard: 0.023, intelligent: 0.023, ia: 0.0125, glacier: 0.004 }[String(p.storageClass)] ?? 0.023),
    perMillionRequests: () => 0.4,
    perGbEgress: () => 0.09,
    note: `Storage is cheap; egress to the internet at $0.09/GB is what surprises people. Egress into CloudFront is free. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'AWS CLI — a safe bucket',
        lang: 'bash',
        code: `aws s3api create-bucket --bucket my-app-assets --region us-east-1

# Do these three immediately, before anything is uploaded.
aws s3api put-public-access-block --bucket my-app-assets \\
  --public-access-block-configuration \\
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

aws s3api put-bucket-versioning --bucket my-app-assets \\
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption --bucket my-app-assets \\
  --server-side-encryption-configuration '{
    "Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms","KMSMasterKeyID":"alias/app"},"BucketKeyEnabled":true}]
  }'`,
      },
      {
        label: 'Deny unencrypted transport',
        lang: 'json',
        code: `{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyInsecureTransport",
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:*",
    "Resource": ["arn:aws:s3:::my-app-assets", "arn:aws:s3:::my-app-assets/*"],
    "Condition": { "Bool": { "aws:SecureTransport": "false" } }
  }]
}`,
      },
    ],
    docs: [{ label: 'S3 security best practices', url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html' }],
    gotchas: [
      'Turn on Block Public Access at the account level, not just per bucket. It then applies to every bucket anyone creates afterwards.',
      'Add a lifecycle rule to abort incomplete multipart uploads. They are invisible in the console and billed indefinitely.',
      'Bucket names are globally unique across all of AWS and appear in URLs. Do not encode anything sensitive in them.',
      'Versioning keeps every version, and you pay for all of them. Pair it with a lifecycle rule that expires old versions.',
    ],
  },
  concepts: ['object-storage', 'data-durability', 'least-privilege', 'ransomware-resilience'],
  keywords: ['s3', 'bucket', 'object', 'storage', 'blob'],
}

const ebs: ResourceDef = {
  id: 'aws.ebs',
  provider: 'aws',
  name: 'EBS Volume',
  short: 'EBS',
  archetype: 'block-storage',
  category: 'storage',
  icon: 'disk',
  tagline: 'A network-attached disk for one instance at a time',
  description:
    'A virtual hard disk attached over the network to a single instance. It survives the instance being stopped, and its IOPS and throughput are provisioned rather than assumed. When an application mysteriously stalls under load and the CPU is idle, exhausted volume throughput is one of the first things worth checking.',
  ports: [inPort('in', 'Attached to', ['block'], { max: 1 })],
  props: [
    {
      key: 'volumeType',
      label: 'Volume type',
      type: 'select',
      default: 'gp3',
      help: 'Determines the performance characteristics and how they are billed.',
      impact:
        'gp3 lets you buy IOPS and throughput independently of size, which is almost always cheaper than the older gp2 where performance scaled with capacity — the reason people used to over-provision a volume purely to get more IOPS.',
      affects: ['capacity', 'cost', 'latency'],
      options: [
        { value: 'gp3', label: 'gp3 (SSD)', note: '3,000 IOPS baseline, independently scalable' },
        { value: 'gp2', label: 'gp2 (SSD, legacy)', note: 'IOPS tied to size' },
        { value: 'io2', label: 'io2 Block Express', note: 'Up to 256,000 IOPS, expensive' },
        { value: 'st1', label: 'st1 (HDD)', note: 'Throughput-optimised, sequential only' },
      ],
    },
    {
      key: 'sizeGb',
      label: 'Size',
      type: 'number',
      default: 100,
      min: 1,
      max: 16384,
      unit: ' GB',
      help: 'Capacity in gigabytes.',
      impact: 'You can grow a volume online but never shrink it. The filesystem also has to be extended separately — resizing the volume alone changes nothing the OS can see.',
      affects: ['capacity', 'cost'],
    },
    {
      key: 'snapshots',
      label: 'Automated snapshots',
      type: 'boolean',
      default: false,
      help: 'Incremental point-in-time copies stored in S3.',
      impact: 'The only backup a volume has. Snapshots are incremental so they are cheap, and a restore creates a new volume rather than repairing the old one.',
      affects: ['durability', 'cost'],
    },
  ],
  sim: {
    capacity: 3000,
    latencyMs: 1,
    stateful: true,
    availability: 0.999,
    vulnerableTo: ['ransomware'],
    failureModes: [
      { id: 'iops-exhausted', label: 'IOPS or throughput exhausted', symptom: 'Application latency climbs while CPU is idle; VolumeQueueLength is high.', remedy: 'Provision more IOPS on gp3, or move the workload to a volume type that matches its access pattern.' },
      { id: 'az-bound', label: 'Volume stranded in a failed zone', symptom: 'The instance cannot restart elsewhere because the volume only exists in one zone.', remedy: 'EBS volumes are zone-scoped. Cross-zone recovery goes through a snapshot, which takes time you should measure before you need it.' },
    ],
  },
  cost: {
    perGbMonth: (p) => ({ gp3: 0.08, gp2: 0.1, io2: 0.125, st1: 0.045 }[String(p.volumeType)] ?? 0.08),
    note: `gp3 at $0.08/GB-month includes 3,000 IOPS and 125 MB/s. ${TIER_NOTE}`,
  },
  setup: {
    gotchas: [
      'A volume lives in one availability zone and attaches to one instance. It is not shared storage — that is EFS.',
      'Growing a volume is a two-step job: modify the volume, then extend the partition and filesystem inside the guest.',
      'Snapshots are incremental but a restored volume is lazily loaded from S3, so it is slow until fully hydrated. Factor that into your recovery time.',
    ],
    docs: [{ label: 'EBS volume types', url: 'https://docs.aws.amazon.com/ebs/latest/userguide/ebs-volume-types.html' }],
  },
  concepts: ['block-vs-object-storage', 'iops', 'availability-zones'],
  keywords: ['ebs', 'volume', 'disk', 'block', 'iops'],
}

const sqs: ResourceDef = {
  id: 'aws.sqs',
  provider: 'aws',
  name: 'SQS Queue',
  short: 'SQS',
  archetype: 'queue',
  category: 'messaging',
  icon: 'queue',
  tagline: 'Turns a traffic spike into a backlog instead of an outage',
  description:
    'A durable queue between a producer and a consumer. The producer writes and returns immediately; the consumer reads at whatever rate it can sustain. That one indirection is the difference between a spike that overwhelms your system and a spike that simply takes longer to process — the single most effective resilience pattern available, and one of the cheapest.',
  ports: [
    inPort('in', 'Messages in', ['queue']),
    outPort('out', 'Messages out', ['queue']),
    outPort('dlq', 'Dead letter', ['queue'], { position: 'bottom' }),
    IDENTITY_IN,
  ],
  props: [
    {
      key: 'queueType',
      label: 'Queue type',
      type: 'select',
      default: 'standard',
      help: 'Standard queues are unordered and at-least-once; FIFO queues are ordered and exactly-once within a message group.',
      impact:
        'Standard queues scale essentially without limit but will occasionally deliver a message twice, so consumers must be idempotent. FIFO guarantees order and deduplication at a much lower throughput ceiling.',
      affects: ['capacity', 'availability'],
      options: [
        { value: 'standard', label: 'Standard', note: 'Unlimited throughput, at-least-once' },
        { value: 'fifo', label: 'FIFO', note: 'Ordered, deduplicated, 3,000 msg/s with batching' },
      ],
    },
    {
      key: 'visibilityTimeout',
      label: 'Visibility timeout',
      type: 'number',
      default: 30,
      min: 0,
      max: 43200,
      unit: 's',
      help: 'How long a message stays hidden from other consumers after one picks it up.',
      impact:
        'Set it shorter than your processing time and a second consumer picks up the same message while the first is still working on it — duplicate processing that is maddening to debug. It should comfortably exceed your slowest handler.',
      affects: ['availability'],
    },
    {
      key: 'dlqEnabled',
      label: 'Dead letter queue',
      type: 'boolean',
      default: false,
      help: 'Moves a message aside after a set number of failed processing attempts.',
      impact:
        'Without one, a single unprocessable message — a poison pill — is retried forever, consuming capacity and blocking a FIFO group indefinitely. With one, it steps aside for a human to look at while everything else keeps flowing.',
      affects: ['availability'],
      danger: (v) => (v === false ? 'No dead letter queue. One malformed message will be retried forever.' : null),
    },
    {
      key: 'retentionDays',
      label: 'Message retention',
      type: 'number',
      default: 4,
      min: 1,
      max: 14,
      unit: ' days',
      help: 'How long an unconsumed message survives before SQS discards it.',
      impact: 'Your buffer if consumers are down. Once retention passes, the messages are gone with no notification.',
      affects: ['durability'],
    },
  ],
  sim: {
    capacity: 100000,
    latencyMs: 10,
    stateful: true,
    availability: 0.9999,
    failureModes: [
      { id: 'backlog', label: 'Consumer falling behind', symptom: 'ApproximateAgeOfOldestMessage grows steadily; the queue depth climbs without bound.', remedy: 'Scale consumers on queue depth, not CPU. The queue is doing its job — the consumer is the bottleneck.' },
      { id: 'poison', label: 'Poison message', symptom: 'The same message is received and failed over and over; one consumer makes no progress.', remedy: 'Configure a dead letter queue with a redrive policy so the bad message steps aside automatically.' },
    ],
  },
  cost: { perMillionRequests: () => 0.4, note: `$0.40 per million requests, first million free each month. ${TIER_NOTE}` },
  setup: {
    snippets: [
      {
        label: 'AWS CLI',
        lang: 'bash',
        code: `aws sqs create-queue --queue-name orders-dlq

aws sqs create-queue --queue-name orders --attributes '{
  "VisibilityTimeout": "120",
  "MessageRetentionPeriod": "345600",
  "RedrivePolicy": "{\\"deadLetterTargetArn\\":\\"arn:aws:sqs:us-east-1:111122223333:orders-dlq\\",\\"maxReceiveCount\\":\\"5\\"}"
}'

# Long polling: fewer empty receives, lower cost, lower latency
aws sqs receive-message --queue-url $URL --wait-time-seconds 20 --max-number-of-messages 10`,
      },
    ],
    docs: [{ label: 'SQS developer guide', url: 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html' }],
    gotchas: [
      'Always use long polling. Short polling returns empty responses constantly, which costs more and adds latency for no benefit.',
      'Make consumers idempotent. Standard queues are at-least-once, so a duplicate is not an anomaly — it is the contract.',
      'Scale consumers on queue depth and message age. CPU-based scaling never notices that a backlog is forming.',
    ],
  },
  concepts: ['async-messaging', 'backpressure', 'idempotency', 'dead-letter-queue'],
  keywords: ['sqs', 'queue', 'message', 'async', 'dlq'],
}

const kinesis: ResourceDef = {
  id: 'aws.kinesis',
  provider: 'aws',
  name: 'Kinesis Data Stream',
  short: 'Kinesis',
  archetype: 'stream',
  category: 'messaging',
  icon: 'stream',
  tagline: 'An ordered, replayable log that many consumers read at once',
  description:
    'Unlike a queue, reading from a stream does not remove the record. Data sits in ordered shards for a retention period and any number of independent consumers can read the same records at their own pace, each tracking its own position. That is what makes streams right for event sourcing, analytics fan-out and anything where you might need to reprocess history.',
  ports: [
    inPort('in', 'Records in', ['stream']),
    outPort('out', 'Consumers', ['stream']),
    IDENTITY_IN,
  ],
  props: [
    {
      key: 'shards',
      label: 'Shards',
      type: 'number',
      default: 2,
      min: 1,
      max: 500,
      help: 'Each shard handles 1 MB/s or 1,000 records per second in, and 2 MB/s out.',
      impact:
        'Shards are the unit of both throughput and ordering. Records with the same partition key always land in the same shard and stay in order — which also means a hot partition key throttles one shard while the rest idle.',
      affects: ['capacity', 'cost'],
    },
    {
      key: 'retentionHours',
      label: 'Retention',
      type: 'number',
      default: 24,
      min: 24,
      max: 8760,
      unit: ' h',
      help: 'How long records stay readable.',
      impact: 'Your replay window. Extend it and a consumer bug becomes recoverable by reprocessing rather than by data loss.',
      affects: ['durability', 'cost'],
    },
  ],
  sim: {
    capacity: 2000,
    latencyMs: 20,
    stateful: true,
    availability: 0.9999,
    failureModes: [
      { id: 'hot-shard', label: 'Hot shard', symptom: 'WriteProvisionedThroughputExceeded on one shard while the others are quiet.', remedy: 'Use a higher-cardinality partition key, or add shards and rebalance.' },
      { id: 'iterator-age', label: 'Iterator age growing', symptom: 'GetRecords.IteratorAgeMilliseconds climbs — the consumer is falling behind the producer.', remedy: 'Add consumer capacity, or use enhanced fan-out so each consumer gets its own dedicated throughput.' },
    ],
  },
  cost: { hourly: (p) => Number(p.shards ?? 1) * 0.015, note: `$0.015 per shard-hour plus $0.014 per million PUT payload units. ${TIER_NOTE}` },
  setup: {
    gotchas: [
      'Ordering is guaranteed within a shard, never across shards. If global ordering matters you have one shard, and therefore 1 MB/s.',
      'Standard consumers share a shard\'s 2 MB/s read budget. Five consumers on one shard each get a fifth — enhanced fan-out gives each its own.',
      'The iterator age metric is the one that matters. It tells you how far behind real time your pipeline has drifted.',
    ],
    docs: [{ label: 'Kinesis Data Streams', url: 'https://docs.aws.amazon.com/streams/latest/dev/introduction.html' }],
  },
  concepts: ['event-streaming', 'partition-keys', 'event-sourcing'],
  keywords: ['kinesis', 'stream', 'kafka', 'events', 'shard'],
}

export const awsData: ResourceDef[] = [rds, aurora, dynamodb, elasticache, s3, ebs, sqs, kinesis]
