import type { Concept } from '../types'

export const data: Concept[] = [
  {
    id: 'acid-transactions',
    title: 'ACID transactions',
    category: 'data',
    short: 'The guarantee that a group of writes either all happen or none do.',
    body: `ACID is four promises a relational database makes. Atomicity: a transaction is all-or-nothing, so a transfer never debits one account without crediting the other. Consistency: constraints hold before and after. Isolation: concurrent transactions do not see each other's half-finished work. Durability: once committed, it survives a crash.

Isolation is the one with nuance, because it comes in levels and the default is usually not the strictest. Read Committed — the default in PostgreSQL, Oracle and SQL Server — prevents reading uncommitted data but allows the same query in one transaction to return different results if another transaction commits in between. MySQL's InnoDB defaults one level stricter, to Repeatable Read, which is worth knowing before assuming isolation behaviour carries across engines. Serializable prevents every anomaly and costs throughput. Most applications run on the default and are fine; the ones that are not tend to discover it through a rare, hard-to-reproduce bug involving concurrent updates to the same row.

The practical reason ACID still matters: it lets you express invariants in one place and trust them. Without transactions, "never let the balance go negative" has to be enforced by careful, correct application code at every call site, forever.

The cost is that these guarantees are easiest on a single machine, which is why relational databases scale up more readily than out, and why so much architecture is shaped by that.`,
    keyPoints: [
      'Atomic, consistent, isolated, durable — the group of writes behaves as one.',
      'Isolation has levels; the default is rarely the strictest.',
      'Constraints in the database beat invariants scattered through application code.',
      'These guarantees are why relational databases scale vertically more easily than horizontally.',
    ],
    related: ['read-replicas', 'eventual-consistency', 'cap-theorem', 'connection-pooling'],
  },
  {
    id: 'read-replicas',
    title: 'Read replicas',
    category: 'data',
    short: 'Copies that serve reads. Always slightly behind, and that is visible to users.',
    body: `Most applications read far more than they write, so the standard way to scale a relational database is to add read-only copies and send queries to them. The primary handles all writes and streams changes to the replicas.

Replication is asynchronous, so a replica is always a little behind — usually milliseconds, occasionally much more under write pressure or a long-running transaction. That lag has a user-visible consequence: someone updates their profile, the write goes to the primary, the next page load reads from a replica that has not caught up, and their change appears to have vanished. This is the read-after-write problem and it is the main thing to design around. The usual answer is to route reads that must reflect a user's own recent write to the primary.

A replica is not a backup. It faithfully replicates a bad DELETE within milliseconds. Backups protect against mistakes; replicas protect against load and, if promoted, against losing the primary.

Aurora reduces the lag substantially: its replicas read the same cluster volume as the writer rather than replaying a shipped log, which keeps them much closer to current — but never identical. Spanner takes a different route entirely, committing every write through a Paxos quorum before acknowledging it, so any replica can serve a strongly consistent read and there is no lag to design around.

And note that a Multi-AZ standby is not a read replica. In an RDS Multi-AZ DB instance deployment the single standby serves no traffic and exists purely to fail over to. The Multi-AZ DB cluster deployment is the exception worth knowing: it runs two standbys, and those do serve reads.`,
    keyPoints: [
      'Replicas scale reads, not writes.',
      'Replication lag makes read-after-write inconsistency user-visible.',
      'A replica is not a backup — it replicates your mistakes faithfully.',
      'A Multi-AZ standby serves no traffic; only the cluster variant\'s standbys serve reads.',
    ],
    related: ['acid-transactions', 'eventual-consistency', 'rpo-rto', 'availability-zones', 'replication-lag'],
  },
  {
    id: 'nosql-modelling',
    title: 'Modelling for NoSQL',
    category: 'data',
    short: 'Design from the queries you need, not from the shape of the data.',
    body: `Relational modelling normalises first and figures out queries later, because joins can rescue almost any access pattern. NoSQL has no joins, so that order is reversed: you enumerate the queries your application will make, then design keys that answer them in a single lookup.

That means denormalisation is the norm, not a compromise. The same value may be stored in several places because several queries need it, and keeping those copies consistent becomes the application's job. What you buy is predictable single-digit-millisecond latency at any scale, because every read is a key lookup rather than a plan the engine has to work out.

Single-table design takes this to its conclusion: multiple entity types share one table, with key prefixes shaped so that one query returns a whole related collection. It looks strange coming from SQL and it is exactly the right shape for the access pattern it was designed around.

The decision that cannot be undone is the partition key. It determines how data spreads and therefore whether you throttle, and it cannot be changed without migrating to a new table. Choose one with high cardinality and even access. Adding a query the design did not anticipate means adding a secondary index or, sometimes, a migration.`,
    keyPoints: [
      'Write down every query first; design keys to answer them in one lookup.',
      'Denormalisation is expected. Keeping copies in sync is your job.',
      'The partition key is permanent — changing it means migrating.',
      'Unanticipated queries need a secondary index, or a rebuild.',
    ],
    related: ['partition-keys', 'eventual-consistency', 'cap-theorem', 'acid-transactions', 'sharding'],
  },
  {
    id: 'partition-keys',
    title: 'Partition keys and hot partitions',
    category: 'data',
    short: 'Distributed stores scale by spreading data. A key that does not spread throttles.',
    body: `Every horizontally scalable data store splits data across partitions by hashing a key. Reads and writes for one key always land on one partition, which is what makes lookups fast and ordering possible within that key.

It also means a single partition has a ceiling — a share of throughput, and often a size limit. If your key distribution is skewed, one partition receives most of the traffic and throttles while the table as a whole looks almost idle. This is the hot partition problem, and its signature is throttling errors alongside low overall utilisation, which is baffling until you know to look for it.

Common causes: a tenant id where one customer is a hundred times larger than the rest; a timestamp prefix, so every write today goes to the same partition; a status field with three possible values.

Fixes: pick a higher-cardinality key; add a random or computed suffix to spread writes, reading across all suffixes; or use a composite key that combines a coarse and a fine dimension. For time-series data, put a high-cardinality dimension before the timestamp.

The same mechanic appears everywhere with different names — shards in Kinesis, logical partitions in Cosmos, partition keys in DynamoDB — and the diagnosis is always the same.`,
    keyPoints: [
      'One key always lands on one partition, which has its own ceiling.',
      'Throttling with low overall utilisation means a hot partition.',
      'Tenant ids, timestamps and status fields are classic bad keys.',
      'Add a shard suffix or use a composite key to spread the load.',
    ],
    related: ['nosql-modelling', 'event-streaming', 'capacity-planning', 'sharding'],
  },
  {
    id: 'eventual-consistency',
    title: 'Eventual consistency',
    category: 'data',
    short: 'All replicas converge — eventually. Users notice the gap.',
    body: `In a distributed store, a write has to reach several replicas. Strong consistency waits for enough of them to acknowledge before returning, so every subsequent read sees the write. Eventual consistency returns immediately and propagates in the background, so a read moments later might not see it.

The trade is latency and availability against freshness. Strong reads cost more, take longer, and may be unavailable during a network partition. Eventual reads are fast, cheap and occasionally stale.

Most of the time eventual is fine — a profile picture, a follower count, a search index. Sometimes it is not: account balances, inventory decrements, anything where two concurrent readers making decisions on stale data causes a real problem.

There are useful middle grounds. Session consistency (Cosmos DB's default, and a good one) guarantees you always read your own writes while other users' writes may lag — which matches what people actually notice. Bounded staleness caps the lag at a number of seconds or versions.

The engineering habit: decide per read path, not per database. A single application will legitimately want strong reads on checkout and eventual reads everywhere else.`,
    keyPoints: [
      'Eventual reads are faster, cheaper, and sometimes stale.',
      'Read-after-write is the inconsistency users actually notice.',
      'Session consistency gives you your own writes without the cost of strong.',
      'Choose consistency per read path, not once per database.',
    ],
    related: ['cap-theorem', 'read-replicas', 'nosql-modelling', 'idempotency', 'replication-lag'],
  },
  {
    id: 'cap-theorem',
    title: 'CAP, and what it actually constrains',
    category: 'data',
    short: 'When the network splits, you choose: refuse requests, or serve possibly-stale data.',
    widget: 'cap-triangle',
    body: `CAP is often summarised as "pick two of consistency, availability and partition tolerance", which is misleading — partitions are not optional. Networks fail, and a distributed system must cope. The real statement is narrower and more useful: during a partition, you must choose between consistency and availability.

Concretely: a network split separates your replicas. A write arrives. You can refuse it, because you cannot confirm the other side agrees — that is choosing consistency, and it means unavailability. Or you can accept it and reconcile later — that is choosing availability, and it means the two sides temporarily disagree.

Banking systems usually choose consistency: better to decline a transaction than to allow a double-spend. Shopping carts usually choose availability: better to accept the item and sort out a conflict later than to show an error.

The extension worth knowing is PACELC: during a Partition choose Availability or Consistency, Else — when everything is healthy — choose Latency or Consistency. That second half is the one you live with every day, because strong consistency costs a round trip to a quorum even when nothing is broken.

Cosmos DB exposes this as a literal dial with five settings, which makes it the clearest place to see the trade in a real product.`,
    keyPoints: [
      'Partitions are not a choice. The choice is what you do during one.',
      'Consistency means refusing writes; availability means reconciling later.',
      'PACELC: even with no partition, strong consistency costs latency.',
      'Different features in one application can reasonably make different choices.',
    ],
    related: ['eventual-consistency', 'multi-region', 'nosql-modelling'],
  },
  {
    id: 'caching',
    title: 'Caching',
    category: 'data',
    short: 'The fastest query is the one you never send.',
    widget: 'cache-hit',
    body: `A cache stores the result of expensive work so the next request gets it cheaply. It is the highest-leverage performance tool available: a cache in front of a database routinely removes 80–95% of read load, which is the difference between needing a large database and a modest one.

The standard pattern is cache-aside: check the cache, and on a miss compute the value, store it, and return it. Simple, and it has two well-known failure modes.

First, stampedes. A popular key expires and every concurrent request misses simultaneously, all hitting the database at once. Fix it with a lock so only one request recomputes, and with jitter on TTLs so keys written together do not expire together.

Second, cold caches. After a restart or a failover the cache is empty and the database briefly takes the full read load. If your database was sized assuming a 90% hit rate, it cannot survive 0% even for a minute. Warm critical keys at start-up, and know what the unhit load actually is.

The general rules: a cache is not a database, so nothing that cannot be recomputed should live only there; cache close to the user when you can (a CDN beats an in-memory cache on the server); and measure hit rate and evictions, because a cache degrades quietly long before it fails loudly.`,
    keyPoints: [
      'Cache-aside is the default pattern; stampedes and cold starts are its failure modes.',
      'Jitter every TTL so keys do not expire in unison.',
      'Know what your database load looks like at a 0% hit rate.',
      'Alarm on hit rate and evictions, not just CPU.',
    ],
    related: ['cache-invalidation', 'thundering-herd', 'ttl-and-caching', 'cdn', 'query-performance'],
  },
  {
    id: 'cache-invalidation',
    title: 'Cache invalidation',
    category: 'data',
    short: 'Deciding when a cached copy has become a lie.',
    body: `There are three ways to keep a cache from serving stale data, and they trade differently.

Expiry (TTL) is simplest: the entry is valid for a fixed time and then discarded. You accept staleness bounded by the TTL, and you never have to track what changed. This is the right answer far more often than people expect.

Explicit invalidation deletes or updates the entry when the underlying data changes. It gives immediate freshness and requires every write path to know which cache keys it affects — which is exactly the coupling that grows into bugs, because someone eventually adds a write path and forgets.

Versioned keys avoid invalidation entirely by changing the key when the data changes. Fingerprinted asset filenames are this pattern, and it is why CDN invalidation is a fallback rather than a strategy: a new build produces URLs nobody has cached, so there is nothing to invalidate.

A practical ranking: use versioned keys where you can, TTLs where you cannot, and explicit invalidation only where staleness is genuinely unacceptable — and then accept that you now own a consistency problem.`,
    keyPoints: [
      'Short TTLs solve most staleness problems without any coupling.',
      'Explicit invalidation couples every write path to the cache.',
      'Versioned keys make invalidation unnecessary — prefer them.',
      'Serving stale while revalidating in the background is often the best of both.',
    ],
    related: ['caching', 'ttl-and-caching', 'cdn'],
  },
  {
    id: 'thundering-herd',
    title: 'Thundering herds',
    category: 'data',
    short: 'Many clients doing the same thing at the same instant, turning a blip into an outage.',
    body: `A herd forms when a large number of requests become synchronised. A popular cache key expires and a thousand requests all miss at once. A service restarts and every client reconnects simultaneously. A request fails and every client retries after exactly one second, together, forever.

The common thread is synchronisation, so the common fix is to break it. Add jitter: randomise TTLs, randomise retry delays, randomise reconnection backoff. A retry of "one second" becomes "somewhere between 0.5 and 1.5 seconds", and the herd smears into a manageable stream.

For caches, add a lock so exactly one request recomputes a missing value while the others wait briefly or serve stale.

For retries, use exponential backoff with a cap — and importantly, only retry what is worth retrying. A client that retries aggressively against a struggling service is the mechanism by which a brief degradation becomes a sustained outage: the service gets slower, clients retry more, the load goes up, the service gets slower. Circuit breakers exist to break that loop.

It is worth noticing how often an outage's *duration* is caused by the clients rather than the server.`,
    keyPoints: [
      'Herds come from synchronisation. Jitter is the general antidote.',
      'One recompute lock beats a thousand simultaneous cache misses.',
      'Exponential backoff with jitter and a cap, on every retry path.',
      'Retry storms are how a short degradation becomes a long outage.',
    ],
    related: ['caching', 'timeouts-retries', 'circuit-breaker', 'backpressure'],
  },
  {
    id: 'object-storage',
    title: 'Object storage',
    category: 'data',
    short: 'Effectively infinite, addressed by key over HTTP, and the most common source of data leaks.',
    body: `Object storage holds opaque blobs in a flat namespace, addressed by key over HTTP. There is no capacity to provision, durability is extraordinary (eleven nines is the usual figure), and the cost per gigabyte is very low. It backs static sites, data lakes, backups, logs and media.

The mental adjustment from filesystems: there are no real directories. A key containing slashes just looks like a path; listing a "folder" is a prefix scan. Objects are immutable — you replace them, you do not edit them in place — and since December 2020 S3 has been strongly consistent for reads and listings alike, so an object appears in a listing the moment the PUT that created it returns. Bucket-level configuration, such as enabling versioning, is still eventually consistent.

Two operational realities. Storage is cheap and egress is not: a gigabyte costs a fraction of a penny to keep for a month and several times that to send to the internet once. Data read out repeatedly costs far more to move than to hold, and the bill grows with traffic rather than with the dataset. And request charges matter for small-object workloads — millions of tiny reads can cost more than the storage itself.

And the security reality: public buckets have been the single most common cause of accidental data exposure in cloud computing. The controls exist and they work — account-level public access blocks, uniform IAM-only access, serving public content through a CDN with signed origin access — but they have to be on before the data goes in, not after.`,
    keyPoints: [
      'Flat keyspace, immutable objects, no capacity planning.',
      'Egress and request charges usually dominate the bill, not storage.',
      'Block public access at the account level, before anyone creates a bucket.',
      'Versioning plus a lifecycle rule is the recovery story.',
    ],
    related: ['block-vs-object-storage', 'data-durability', 'ransomware-resilience', 'cost-optimisation', 'analytics-vs-transactions'],
  },
  {
    id: 'block-vs-object-storage',
    title: 'Block, file and object storage',
    category: 'data',
    short: 'A disk, a share, or an HTTP keyspace — three different things people call storage.',
    body: `Block storage is a virtual disk attached to one machine. The operating system sees raw blocks and puts a filesystem on them. It is fast, low-latency and normally exclusive: one volume, one instance, one availability zone. Provisioned IOPS volumes can attach to as many as sixteen instances in the same zone, but only a cluster-aware filesystem makes that safe, so treat it as a specialist option rather than as shared storage. Databases and anything needing random access live here.

File storage is a shared filesystem several machines mount at once, over NFS or SMB. It gives you POSIX semantics and concurrent access, at higher latency than a local disk. Use it when multiple instances genuinely need the same mutable files.

Object storage is an HTTP keyspace. No filesystem, no mounting, effectively unlimited, accessed by key. Immutable objects, very high durability, very low cost.

The choice is usually obvious once phrased as a question. Does one machine need a disk? Block. Do several machines need the same files with filesystem semantics? File. Are you storing artefacts that are written once and read many times? Object.

The design instinct worth having: prefer object storage. It is cheaper, it scales without thought, it has no zone affinity, and it does not tie your compute to a disk that cannot follow it. Uploads, exports, backups and media all belong there, with a pointer stored in your database.`,
    keyPoints: [
      'Block = one disk, one machine, one zone. File = shared POSIX. Object = HTTP keyspace.',
      'Block volumes are zone-scoped, which constrains recovery.',
      'Object storage has no capacity planning and no zone affinity.',
      'Store the blob in object storage and the pointer in the database.',
    ],
    related: ['object-storage', 'iops', 'data-durability'],
  },
  {
    id: 'data-durability',
    title: 'Durability versus availability',
    category: 'data',
    short: 'One is about never losing the data; the other is about being able to reach it.',
    body: `These get conflated and they are different properties. Durability is the probability the data still exists. Availability is the probability you can reach it right now. A service can be extremely durable and temporarily unavailable — your data is perfectly safe and you cannot get to it — which is exactly what most storage outages look like.

Providers give both numbers. Eleven nines of durability means the expected annual loss is vanishingly small; four nines of availability means about fifty minutes of unreachability a year. Both are per-service and they are not the same figure.

Replication is the mechanism for both, and where the copies live decides what you survive. Three copies in one datacentre survive a disk failure and not a fire. Three copies across zones survive a datacentre. Copies in another region survive a regional event.

But no amount of replication protects against the failure mode that actually causes data loss: someone deletes the wrong thing, a migration corrupts a table, ransomware encrypts everything. Replication faithfully copies all of those within milliseconds. Only backups with retention, versioning, and ideally immutability protect against them — which is why "we have replication" is never an answer to "what is your backup strategy".`,
    keyPoints: [
      'Durable means it still exists. Available means you can reach it.',
      'Where the replicas live decides what class of failure you survive.',
      'Replication copies your mistakes instantly. It is not a backup.',
      'Versioning plus retention plus immutability is what survives a bad actor.',
    ],
    related: ['rpo-rto', 'ransomware-resilience', 'availability-zones', 'object-storage'],
  },
  {
    id: 'iops',
    title: 'IOPS and throughput',
    category: 'data',
    short: 'Storage performance is provisioned, and running out looks like an application problem.',
    body: `Cloud block storage sells two things: IOPS (operations per second, which matters for small random reads and writes — exactly what a database does) and throughput (megabytes per second, which matters for large sequential transfers).

These are provisioned, not assumed. On the older gp2 volume type, performance scaled with size, which is why people used to allocate a far larger volume than they needed purely to get more IOPS. On gp3 and its equivalents you buy them independently, which is both cheaper and clearer.

The symptom of exhausting them is distinctive and easily misread: application latency climbs, the database looks slow, and CPU is idle. The queue depth on the volume is high and everything is waiting on storage. People spend hours looking at query plans before checking disk metrics.

Three things to remember. Databases are IOPS-hungry and log-heavy; put them on volumes sized for operations, not capacity. Burst credits on smaller gp2 volumes mean a benchmark can look excellent for half an hour and then fall off a cliff. gp3 does not burst at all; it sustains what you provisioned indefinitely, which is the other reason to prefer it. And a restored snapshot is lazily loaded from object storage, so a freshly restored volume is slow until fully hydrated — which matters when you are measuring recovery time.`,
    keyPoints: [
      'IOPS for random access, throughput for sequential transfer.',
      'High latency with idle CPU usually means storage, not compute.',
      'Burst credits make short benchmarks lie.',
      'Restored volumes are slow until hydrated — factor it into recovery time.',
    ],
    related: ['block-vs-object-storage', 'capacity-planning', 'rpo-rto'],
  },
  {
    id: 'encryption-at-rest',
    title: 'Encryption at rest',
    category: 'data',
    short: 'Nearly free, nearly universal, and the value is in who holds the key.',
    body: `Encryption at rest means the stored bytes are ciphertext. Object storage is now encrypted whether you ask or not — S3 has applied encryption to every new object since January 2023 — but block storage and managed databases are not: EBS encryption by default is an account and region setting you have to switch on, and a managed database created without encryption usually stays unencrypted for its whole life. The cost is negligible and the performance impact is not measurable, so switch it on everywhere. There is no reason to have it off.

The interesting question is key ownership. With provider-managed keys, the provider handles everything and you never think about it. With customer-managed keys you control a key in a key management service, and three things change: every use is logged, so you can audit who decrypted what; you can revoke access instantly, which makes all data encrypted under that key unreadable regardless of who holds it; and you become responsible for not destroying the key, because the data goes with it.

That revocability is the real security property. It converts "an attacker has a copy of our storage" into "an attacker has ciphertext they cannot read", and it converts incident response from a forensic exercise into a single administrative action.

Two operational notes. Replicate keys to your disaster recovery region before the disaster, or the replica region holds data it cannot decrypt — a genuinely unpleasant discovery during a failover test. And enable bucket-level key caching where offered, because per-object key management calls can cost more than the storage they protect.

Encryption at rest does not protect against a compromised application, which is authorised to decrypt. That is what least privilege and encryption in transit are for.`,
    keyPoints: [
      'On by default, effectively free. Leave it on.',
      'Customer-managed keys buy auditability and instant revocation.',
      'Replicate keys to your DR region before you need them.',
      'It does not protect against a compromised application with legitimate access.',
    ],
    related: ['key-management', 'compliance', 'data-exfiltration', 'least-privilege'],
  },
  {
    id: 'key-management',
    title: 'Key management',
    category: 'data',
    short: 'Whoever controls the key controls the data, wherever the ciphertext ends up.',
    body: `A key management service holds key material that never leaves it. You do not hand it your data; you ask it to encrypt or decrypt a small data key, and use that data key locally. This is envelope encryption, and it means large objects are encrypted fast while the master key stays in a hardware-backed boundary.

What that buys you is control and evidence. Every operation is logged, so "who decrypted this, and when" is answerable. The key policy is an independent authorisation layer — separate from your ordinary IAM — so revoking it cuts access immediately and comprehensively.

Operational cautions, each of which has caught people. The key policy, not IAM, is the root of authority on the key; locking yourself out of it is one of the few genuinely unrecoverable cloud mistakes. Key deletion is deliberately slow (a mandatory waiting period) for exactly that reason. Rotation is a toggle rather than a project — AWS KMS rotates every 365 days by default, the period is configurable, and you can rotate on demand — but it is not free: the first and second rotation each add a dollar a month to the key, after which the charge stops. And KMS request charges can exceed storage costs for workloads with many small objects, which is why bucket-level key caching exists.

The mental model: encryption keys are the highest-value credential in the system. Treat access to them the way you treat production database access.`,
    keyPoints: [
      'Envelope encryption: KMS protects the data key; the data key protects the data.',
      'Every use is logged. Revoking the key revokes access to the ciphertext.',
      'The key policy is the root of authority — do not lock yourself out.',
      'Enable bucket-level key caching for many-small-object workloads.',
    ],
    related: ['encryption-at-rest', 'secrets-management', 'least-privilege', 'compliance'],
  },
  {
    id: 'async-messaging',
    title: 'Queues and asynchronous work',
    category: 'data',
    short: 'A buffer between producer and consumer that turns spikes into backlogs.',
    body: `A queue sits between something producing work and something doing it. The producer writes and returns immediately; the consumer reads at whatever rate it can sustain. That single indirection is one of the highest-value resilience patterns available, and one of the cheapest.

What it buys: a traffic spike becomes a longer queue rather than a failed request. A consumer being down becomes a backlog rather than data loss. And the two sides can scale, deploy and fail independently.

What it costs: the work is no longer synchronous, so the user interface has to be honest about that — a job id and a status endpoint rather than a result. Delivery is at-least-once on almost every platform, so consumers must be idempotent. And you now have a new thing to monitor.

The settings that matter. Visibility timeout (or ack deadline) must exceed your slowest handler, or a second consumer picks up a message the first is still working on. A dead letter queue catches messages that fail repeatedly, so one poison message does not block the queue forever. And retention sets how long you can be down before messages start disappearing silently.

Scale consumers on queue depth and message age, never on CPU — CPU never notices that a backlog is forming.`,
    keyPoints: [
      'Queues convert spikes and outages into backlogs.',
      'Visibility timeout must exceed your slowest handler.',
      'A dead letter queue is not optional; a poison message retries forever without one.',
      'Scale consumers on depth and oldest-message age.',
    ],
    related: ['backpressure', 'idempotency', 'dead-letter-queue', 'event-driven'],
  },
  {
    id: 'event-streaming',
    title: 'Streams versus queues',
    category: 'data',
    short: 'Reading from a queue removes the message; reading from a stream does not.',
    body: `That one difference drives everything else. A queue delivers each message to one consumer and then it is gone. A stream keeps an ordered log for a retention period, and any number of independent consumers read it at their own pace, each tracking its own position.

So a queue is for work distribution — three workers sharing a backlog. A stream is for fan-out and history — analytics, search indexing, audit and a notification service all reading the same events without knowing about each other.

The replay capability is what makes streams distinctive. A consumer bug that corrupted data for six hours is recoverable: fix the code, rewind the position, reprocess. With a queue, those messages are gone. This property is what event sourcing is built on.

Ordering is guaranteed within a partition or shard, never globally. Records with the same key go to the same partition and stay in order — which also means a skewed key creates a hot partition that throttles while others idle.

The metric that matters is consumer lag (iterator age): how far behind real time your pipeline is. It is the single number that tells you whether a streaming system is healthy.`,
    keyPoints: [
      'Queue: one consumer, message consumed. Stream: many consumers, log retained.',
      'Replay turns a consumer bug into a reprocessing job instead of data loss.',
      'Ordering holds within a partition, not globally.',
      'Consumer lag is the health metric for any stream.',
    ],
    related: ['async-messaging', 'event-sourcing', 'partition-keys', 'event-driven', 'change-data-capture'],
  },
  {
    id: 'event-sourcing',
    title: 'Event sourcing',
    category: 'data',
    short: 'Store what happened, not the current state. Derive the state from the events.',
    body: `Instead of storing an account balance, store every deposit and withdrawal and compute the balance by replaying them. The event log becomes the source of truth and current state becomes a derived view.

What that buys is genuinely valuable in the right domain. You get a complete audit trail for free, because the history *is* the data. You can reconstruct state at any past moment, which makes "what did this look like last Tuesday" a query rather than an investigation. And you can build entirely new views from existing history — a new report over data you collected before anyone asked for the report.

What it costs is substantial. Reading current state requires replaying or maintaining a snapshot. Events are immutable, so a bug in an event's meaning cannot be fixed by updating a row; you append a correction, and every reader must understand both. Schema evolution over a log you can never rewrite is a real discipline. And most teams find the query side needs CQRS — a separate read model — which is another moving part.

The honest guidance: this is a powerful pattern in domains where history genuinely is the truth (finance, compliance, collaborative editing), and considerable overhead in domains where it is not. Do not adopt it because it sounds principled.`,
    keyPoints: [
      'Events are the source of truth; state is a projection.',
      'Free audit trail, time travel and new views over old history.',
      'Immutable events make schema evolution and corrections genuinely hard.',
      'Worth it where history is the domain; overhead where it is not.',
    ],
    related: ['event-streaming', 'event-driven', 'idempotency'],
  },
  {
    id: 'dead-letter-queue',
    title: 'Dead letter queues',
    category: 'data',
    short: 'Where a message goes when it has failed enough times to be someone\'s problem.',
    body: `Some messages can never be processed — malformed payload, a referenced record deleted, a bug in the handler. Without somewhere to put them, they are retried forever: consuming capacity, filling logs, and in an ordered queue, blocking every message behind them indefinitely.

A dead letter queue catches them after a configured number of attempts. The main flow keeps moving and the bad message waits for a human. That is the whole mechanism, and it is one of the highest-value five-minute configuration changes in any messaging system.

The part people skip is monitoring it. A dead letter queue nobody watches is a silent data-loss channel: messages accumulate, retention eventually expires, and the first sign is a customer asking where their order went. Alarm on depth, with a threshold of one.

Then treat it as a work queue. Each message is evidence of a bug or a data problem. Fix the cause, then redrive — most platforms can replay the dead letter queue back into the main one once the handler is fixed.

Azure Service Bus enables dead lettering by default, which is a good default; most other platforms require you to configure it.`,
    keyPoints: [
      'Without one, a poison message is retried until retention expires.',
      'Alarm on depth greater than zero. Always.',
      'Every message in it is a bug report.',
      'Fix the handler, then redrive the messages back.',
    ],
    related: ['async-messaging', 'idempotency', 'alerting'],
  },
  {
    id: 'idempotency',
    title: 'Idempotency',
    category: 'data',
    short: 'Doing it twice has the same effect as doing it once — which distributed systems require.',
    body: `In a distributed system you frequently cannot tell the difference between "the request failed" and "the request succeeded but the response was lost". The only safe response is to retry, which means your handler will sometimes process the same thing twice. Messaging platforms make this explicit: at-least-once delivery is the contract, not a defect.

So operations need to be safe to repeat. Some are naturally: setting a value, deleting by id. Some are not: incrementing a counter, charging a card, appending to a list.

The standard technique is an idempotency key. The client generates a unique id for the logical operation and sends it with every attempt. The server records processed keys and, on seeing a repeat, returns the original result instead of doing the work again. Payment APIs work exactly this way, and it is worth copying the pattern wherever money or side effects are involved.

Database-level options help too: a unique constraint turns a duplicate insert into a harmless error you can catch; conditional writes let you say "only if the version is still what I read".

The habit: before writing a retry, ask what happens if the operation runs twice. If the answer is bad, make it idempotent first.`,
    keyPoints: [
      'You cannot distinguish a lost response from a failed request. Retries are mandatory.',
      'At-least-once delivery is the contract on virtually every queue.',
      'Idempotency keys let the server deduplicate logical operations.',
      'Unique constraints and conditional writes are the database-level version.',
    ],
    related: ['async-messaging', 'timeouts-retries', 'event-driven', 'eventual-consistency'],
  },
  {
    id: 'backpressure',
    title: 'Backpressure',
    category: 'data',
    short: 'Telling an upstream to slow down, instead of quietly collapsing.',
    body: `When a system receives more work than it can handle it has three options: queue it, shed it, or fall over. The third happens by default when you do not choose between the first two.

Unbounded queueing feels like the kind option and is usually the worst one. Memory fills, latency grows without limit, and every request eventually times out — so you have spent all your resources producing responses nobody is waiting for any more. This is the classic way a service turns a partial overload into a total outage.

Bounded queues plus load shedding are better. Accept what you can handle, reject the rest quickly with a 429 and a Retry-After, and keep serving the traffic you accepted. Rejecting 20% of requests instantly is a far better outcome than failing 100% slowly.

The practical mechanisms: rate limits at the API gateway, bounded queues and thread pools, circuit breakers so a failing dependency stops consuming your capacity, timeouts everywhere so nothing waits forever, and admission control that protects your most important traffic first.

The mindset shift that makes this click: an overloaded system's job is not to serve everyone. It is to serve as many as it can, predictably, and tell the rest to come back.`,
    keyPoints: [
      'Unbounded queues convert overload into total failure.',
      'Shed load fast with 429 and Retry-After rather than timing out slowly.',
      'Timeouts, bounded pools and circuit breakers are all backpressure mechanisms.',
      'Serving 80% well beats failing 100% slowly.',
    ],
    related: ['rate-limiting', 'circuit-breaker', 'timeouts-retries', 'capacity-planning', 'load-shedding'],
  },
  {
    id: 'schema-migrations',
    title: 'Schema migrations',
    category: 'data',
    short: 'The database and the code deploy at different moments. Both versions must work in between.',
    body: `A deploy is not atomic. During a rolling update, old and new application versions run simultaneously against one database, sometimes for minutes, and during a rollback the old version runs against a migrated schema. Any migration that assumes the schema and the code change at the same instant will break in that window.

The technique that removes the problem is expand and contract. Expand: add the new column and start writing to both old and new while still reading the old. Migrate: backfill existing rows in batches, then switch reads to the new column. Contract: first deploy code that stops writing the old column, wait for that rollout to complete, and only then drop it — four steps rather than three, because a straggler instance still writing the old column is exactly who the drop breaks. Each step is independently deployable and independently revertible, which is the entire point: at no moment does rolling back require a schema change.

Locking is where the outage comes from. On PostgreSQL, adding a column is a metadata change rather than a table rewrite, and has been since version 11 even when the column has a default, provided that default is not volatile. That makes the statement fast but not safe: it still takes an ACCESS EXCLUSIVE lock, which conflicts with everything including a plain SELECT, so it waits behind any open transaction on the table and every query arriving meanwhile queues behind it. Building an index without CONCURRENTLY is the slower version of the same hazard — it holds a SHARE lock for the whole build, which blocks writes but not reads. MySQL's online DDL avoids blocking for many operations but not all, and the exceptions vary by version. Set a short lock timeout so a migration that cannot get its lock fails quickly instead of stalling the application, and test every migration against a copy with production-sized data — a migration that takes 200ms on a developer laptop can take forty minutes on a table with three hundred million rows.

Backfills belong outside the migration. Update in bounded batches with a pause between them, so replication lag stays low and the write path is not starved. A single UPDATE across a large table is both a long lock and a replication event that can leave replicas minutes behind.

Two rules worth holding to. Never combine a destructive change with a deploy that is hard to reverse; drop columns in their own change, after the code that used them is provably gone. And make migrations forward-only in production — "down" migrations are rarely tested, frequently lossy, and the honest recovery for a bad migration is a new migration that corrects it.`,
    keyPoints: [
      'Old and new code run against one database during rollout and rollback.',
      'Expand, migrate, then stop writing the old column before dropping it — each step revertible on its own.',
      'Locks are the outage: short lock timeouts, concurrent index builds, production-sized testing.',
      'Backfill in batches outside the migration; forward-only in production.',
    ],
    related: ['deployment-strategies', 'replication-lag', 'acid-transactions', 'ci-cd'],
  },
  {
    id: 'replication-lag',
    title: 'Replication lag',
    category: 'data',
    short: 'A replica is a view of the past. How far past decides which reads can use it.',
    body: `Asynchronous replication means the primary commits and acknowledges without waiting for replicas. Those replicas apply changes afterwards, and the distance between them is replication lag — usually milliseconds, occasionally minutes, and the difference is where the bugs live.

The classic symptom is read-your-writes failure: a user updates their profile, the write goes to the primary, the page reloads, the read goes to a lagging replica, and the old value comes back. The user retries, sees it change, and reports a ghost. The fix is not to eliminate lag but to route reads that must reflect a recent write to the primary — either for a short window after writing, or by tagging those code paths explicitly. Everything else can tolerate a slightly stale view, which is what makes replicas useful at all.

Lag rises for specific and recognisable reasons. A serial replication apply — PostgreSQL's WAL replay, or a MySQL replica left with parallel workers disabled — cannot keep up with a write-heavy primary. A long-running query on the replica blocks application of incoming changes. A large batch update generates a burst of changes. A replica placed in another region has propagation delay before anything else. Monitor lag as a first-class metric with an alert, because lag is also the size of your data loss window if the primary fails right now.

Synchronous replication removes the window at a cost: every commit waits for at least one replica to acknowledge, so write latency now includes a network round trip and the availability of that replica. This is the trade in a Multi-AZ managed database — a few milliseconds of write latency in exchange for failover with no data loss. Across regions, the same choice costs tens of milliseconds per commit, which is why cross-region replication is nearly always asynchronous.

Be precise about what a replica is for. Read scaling, yes. Availability, only if failover is automatic and fencing prevents the old primary from accepting writes. Backups, no — a replica faithfully replicates the DELETE that destroyed your data, in under a second.`,
    keyPoints: [
      'Lag causes read-your-writes failures; route recent-write reads to the primary.',
      'Long replica queries, single-threaded apply and batch writes are the usual causes.',
      'Lag is also your data loss window — monitor and alert on it.',
      'Replicas are not backups; they replicate destructive statements faithfully.',
    ],
    related: ['read-replicas', 'eventual-consistency', 'consensus-and-quorum', 'rpo-rto'],
  },
  {
    id: 'change-data-capture',
    title: 'Change data capture',
    category: 'data',
    short: 'Read the database\'s own log to get an exact stream of what changed.',
    body: `Getting data out of a database and into a search index, a cache, a warehouse or another service has three common approaches, and two of them are worse than they look. Polling for rows changed since a timestamp misses deletes, misses updates within the same second, and puts a recurring scan on the primary. Dual writes — the application writes to the database and publishes an event — are wrong whenever one succeeds and the other fails, which is a routine occurrence rather than an edge case.

Change data capture takes the third route: read the replication log — the PostgreSQL write-ahead log, the MySQL binlog, the MongoDB oplog. On MongoDB it is already there; PostgreSQL needs wal_level set to logical, which costs a restart and a larger WAL volume, and MySQL needs row-format binary logging with full row images. Once it is on, every committed insert, update and delete appears in commit order, nothing is missed, ordering is preserved per table, and the application code is untouched. What the previous values of an updated row look like depends on configuration: PostgreSQL sends only the primary key unless the table's replica identity is set to full. Debezium is the common implementation, and the managed services (DMS, Datastream and their equivalents) do the same thing.

Two patterns dominate its use. Streaming to analytics, replacing nightly batch extracts with a continuously updated warehouse. And the transactional outbox: the application writes its business change and an outbox row in one local transaction, and CDC publishes the outbox rows as events. That is the standard answer to dual writes — one atomic commit, with delivery handled afterwards, giving at-least-once publication without distributed transactions.

The operational details decide whether it works. Delivery is at-least-once, so consumers must be idempotent; the same change will be delivered twice after a restart. Replication slots keep the log until the consumer has read it, which means a consumer that stops reading causes the primary's disk to fill — that is the failure that takes down the database rather than the pipeline. It does not take an outage: a consumer subscribed only to low-traffic tables never advances its position while the rest of the database generates WAL, which is why Debezium has a heartbeat interval. Alert on slot lag, and set max_slot_wal_keep_size so PostgreSQL invalidates the slot rather than filling the disk — re-initialising a consumer is a better afternoon than recovering a primary that ran out of space. Schema changes reach consumers differently by source: MySQL's binlog carries the DDL itself, while PostgreSQL's logical decoding does not, so the only signal is that the shape of subsequent change events has quietly changed. And initial snapshots of a large table are heavy; plan for them.

The design property worth naming: CDC is coupling to another service's schema. It is excellent for your own data and questionable as a way to integrate across team boundaries, where an explicit event contract ages better.`,
    keyPoints: [
      'Reading the replication log captures every change in order, without touching the application.',
      'The outbox pattern plus CDC is the standard fix for dual writes.',
      'Delivery is at-least-once — consumers must be idempotent.',
      'An unread replication slot fills the primary\'s disk; alert on slot lag.',
    ],
    related: ['event-streaming', 'idempotency', 'event-sourcing', 'replication-lag'],
  },
  {
    id: 'sharding',
    title: 'Sharding',
    category: 'data',
    short: 'Split the data across independent databases when one can no longer hold or serve it.',
    body: `Vertical scaling, read replicas and caching solve read-heavy load. When the write volume or the working set outgrows a single machine, the remaining option is horizontal partitioning: splitting rows across several independent databases, each holding a subset.

The shard key decides everything that follows. It should be present in nearly every query — otherwise reads fan out to every shard and you have multiplied your problems — and it should spread both data and traffic evenly. Customer or tenant identifier is the usual choice because it matches the access pattern; sequential keys are the usual mistake, since they concentrate all new writes on one shard. Hashing distributes evenly but destroys range queries; ranges keep them but need rebalancing when one range gets hot.

Accept what you lose, because these are not small. Cross-shard joins are gone, and queries that need data from several shards become application-side work. Transactions across shards need a saga or a two-phase commit, both of which are considerably harder than a local transaction. Globally unique constraints — a unique email address — need a separate mechanism, since no shard can see the others. Aggregate reporting queries become fan-out jobs, which is why sharded systems usually also have a warehouse.

Rebalancing is the operational reality nobody enjoys. Shards grow unevenly and eventually one must be split, which means moving data while serving traffic. Two things make it survivable: a routing layer between the application and the shards, so the mapping can change without a deploy, and many more logical shards than physical ones — allocate a thousand logical shards at the start, map them to four machines, and growth becomes reassignment rather than re-partitioning.

Before sharding, be sure. It is one of the largest complexity increases available, and it is frequently reached for when the actual problem is a missing index, an N+1 query pattern, or a workload that would fit comfortably on hardware two sizes up. Managed systems that partition natively — DynamoDB, Cosmos DB, Spanner, CockroachDB — do this work for you in exchange for their own constraints, and choosing one of those is often the better answer.`,
    keyPoints: [
      'The shard key must appear in most queries and spread both data and traffic.',
      'Cross-shard joins, transactions and unique constraints all become application problems.',
      'Many logical shards mapped onto few physical ones makes growth a reassignment.',
      'Exhaust indexing, caching and bigger hardware first; natively partitioned stores are often better.',
    ],
    related: ['partition-keys', 'nosql-modelling', 'cell-based-architecture', 'query-performance'],
  },
  {
    id: 'query-performance',
    title: 'Query performance',
    category: 'data',
    short: 'Most database emergencies are one missing index or one query issued a thousand times.',
    body: `Databases are usually not slow because they are underpowered. They are slow because of a small number of recurring patterns, and recognising them is worth more than any amount of tuning.

Missing indexes are first. Without one, the database reads every row; the query is fast on a developer's laptop with ten thousand rows and catastrophic at fifty million. Read the execution plan — a sequential scan on a large table in a frequently executed query is the finding. Composite indexes must match the column order your predicates use, index-only scans skip the table for pages the visibility map marks all-visible, which makes them dependent on vacuum keeping up, and every index has a cost: writes update it, and it consumes memory that would otherwise cache data. Unused indexes are pure overhead, and most schemas that have been alive for years have several.

The N+1 pattern is second, and it is an application problem rather than a database one. Fetch a hundred orders, then loop and fetch each order's customer: one hundred and one round trips, each individually fast, together a page that takes two seconds. ORMs produce this by default through lazy loading. The fix is eager loading or a single query with a join, and the diagnostic is query count per request — a number worth having on a dashboard.

Then the ones that appear under load. Unbounded result sets — a query with no LIMIT that returns fifty thousand rows because one customer is unusual. Queries inside a transaction that hold locks while calling an external service. Missing pagination replaced by OFFSET on page four thousand, which makes the database count through everything before it. And plan changes: the same query chooses a different plan once statistics shift, which is why "it was fine yesterday" is a real and confusing failure.

Instrument it properly. Enable the slow query log, use the statement statistics extension to find the queries consuming the most total time — not the slowest single execution, which is often a nightly job nobody waits for — and alert on connection pool saturation and lock wait time. The query costing 8ms and running two thousand times a second is a bigger problem than the one taking four seconds once an hour.`,
    keyPoints: [
      'Read execution plans; a sequential scan on a large hot table is the usual finding.',
      'N+1 loops are an application bug — track query count per request.',
      'Total time consumed matters more than the slowest single execution.',
      'Indexes cost writes and memory; unused ones are pure overhead.',
    ],
    related: ['connection-pooling', 'caching', 'iops', 'sharding'],
  },
  {
    id: 'analytics-vs-transactions',
    title: 'Transactional and analytical stores',
    category: 'data',
    short: 'One answers "what is this user\'s balance", the other "what did every user do last quarter".',
    body: `Transactional databases (OLTP) are built for many small operations that each touch a few rows: read a user, insert an order, update a balance. They store data by row, index for point lookups, and guarantee consistency within a transaction. Analytical systems (OLAP) are built for few large queries that touch a few columns of very many rows: sum revenue by region for a year. They store data by column, which allows reading only the columns a query needs and compressing each column extremely well.

That difference is why running analytics on your production database goes badly. The scan competes for CPU and disk with every ordinary lookup, and on PostgreSQL the long-running transaction it holds open stops vacuum reclaiming dead rows for as long as it runs, so the table bloats while the report is still executing. Both major engines take some care not to let a scan flush the working set out of the buffer cache — PostgreSQL reads large sequential scans through a small ring of buffers, InnoDB holds newly read pages in an old sublist until they are touched twice — but neither protects you from the contention. The analytics query itself is also slower than it would be on a columnar engine by an order of magnitude or more. A read replica dedicated to reporting is the cheap mitigation and is often enough. Beyond that, move the data.

The architecture has consolidated around a few choices. A warehouse (BigQuery, Snowflake, Redshift, Synapse) stores modelled, curated data and answers business questions fast. A data lake holds raw files in object storage cheaply, which is the right home for data whose use is not yet known. The lakehouse pattern combines them: open table formats such as Iceberg or Delta Lake add transactions, schema evolution and time travel over files in object storage, queried by several engines without copying.

Two operational points matter more than the architecture debate. Cost follows the data a query has to read, though the meter differs: BigQuery's on-demand model bills bytes processed directly, while Snowflake, Redshift and BigQuery's capacity pricing bill for compute time, which a large scan consumes more of. Either way, partitioning and clustering on the columns queries filter by is the difference between an affordable warehouse and a surprising bill. And freshness is a requirement to state explicitly: hourly batch loading, continuous streaming through CDC, and querying the source directly are three different costs and three different answers to "how recent is this number".

Keep the boundary clean. The operational system should not depend on the warehouse to serve a user request, and the warehouse should not write back into the operational store. When those two mix, an analytics failure becomes a production outage.`,
    keyPoints: [
      'Row stores serve point operations; column stores serve wide aggregate scans.',
      'Analytics on the production database competes for I/O and holds transactions open, which is what slows everything else.',
      'Lakehouse formats add transactions and schema evolution over object storage.',
      'Cost follows the data a query reads, billed as bytes or as compute time — partition on what queries filter by.',
    ],
    related: ['object-storage', 'change-data-capture', 'read-replicas', 'cost-optimisation'],
  },
]
