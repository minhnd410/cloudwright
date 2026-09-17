import type { Concept } from '../types'

export const reliability: Concept[] = [
  {
    id: 'redundancy',
    title: 'Redundancy',
    category: 'reliability',
    short: 'Going from one to two is the largest availability improvement you will ever make.',
    body: `One instance means every restart, patch, deploy and hardware fault is a full outage. Two means none of those are, provided something in front knows which one is healthy. Everything beyond two is headroom — useful, but a much smaller step than the first one.

The trap is counting replicas without counting failure domains. Three Pods on one node are not redundant; three instances in one availability zone are not redundant against a datacentre event; three copies in one region are not redundant against a regional one. Redundancy is only as good as the independence of the copies, which is why anti-affinity rules and zone spreading exist.

Redundancy also needs a mechanism to use it. Health checks that remove a sick instance, a load balancer that stops routing to it, an autoscaler that replaces it. Without those, a second instance is a second thing to be confused by during an incident rather than a second thing serving traffic.

And be honest about what is redundant. A stateless web tier is easy. A relational primary is not — you get a standby whose failover takes somewhere between thirty seconds and two minutes, not a second active copy. Knowing which of your components can actually be redundant is most of an availability design.`,
    keyPoints: [
      'One to two removes the single point of failure; everything after is headroom.',
      'Count failure domains, not replica counts.',
      'Redundancy without health checks is just extra cost.',
      'Stateless tiers are trivially redundant; stateful ones are not.',
    ],
    related: ['availability-zones', 'availability-math', 'health-checks', 'self-healing'],
  },
  {
    id: 'availability-zones',
    title: 'Regions and availability zones',
    category: 'reliability',
    short: 'Zones are separate buildings on one fast network. Regions are separate places entirely.',
    body: `A region is a geographic area. Within it, availability zones are physically separate datacentres with independent power, cooling and networking, connected by links fast enough that synchronous replication between them is practical — typically low single-digit milliseconds.

That combination is what makes multi-zone the default reliability posture. You survive a building-level event — a fire, a power failure, a flooded room — with automatic failover and no meaningful latency cost. It usually costs somewhere between 30% and 100% more, and for anything you would be paged about, it is the right trade.

Multi-region is a different proposition. Latency between regions is tens to hundreds of milliseconds, so synchronous replication stops being practical and you inherit either asynchronous replication (with the data loss window that implies) or an eventually-consistent design with conflict resolution. It roughly doubles cost and more than doubles operational complexity. It protects against genuinely rare regional events and against regulatory or geographic requirements.

The honest sequencing for most systems: get multi-zone right first, including tested failover. Consider multi-region when you can state a specific requirement it satisfies — a recovery objective, a data residency rule, or a latency target for a distant audience.

Note the provider differences: AWS subnets are zone-scoped, Azure resources pick their zone individually, and GCP regional resources span zones automatically.`,
    keyPoints: [
      'Zones: separate buildings, millisecond links, synchronous replication works.',
      'Regions: separate geography, tens to hundreds of ms, async replication only.',
      'Multi-zone is the default. Multi-region needs a stated reason.',
      'Size so that losing a zone still leaves enough capacity.',
    ],
    related: ['multi-region', 'redundancy', 'rpo-rto', 'capacity-planning'],
  },
  {
    id: 'availability-math',
    title: 'The arithmetic of nines',
    category: 'reliability',
    short: 'Dependencies multiply, redundancy compounds, and both effects are larger than people expect.',
    widget: 'availability-math',
    body: `Two rules cover almost every availability calculation.

Dependencies multiply. If your service needs A, B and C to all be up, and each is 99.9%, your ceiling is 0.999³ = 99.7% — about two hours of downtime a month before your own code fails once. Every hard dependency you add lowers the ceiling. This is the strongest argument for making dependencies soft: a feature that degrades when its dependency is down does not multiply into your availability.

Redundancy compounds the other way. If one instance is 99% available and failures are independent, two are 1 − 0.01² = 99.99%. That is the mathematical version of "one to two is the big step".

Independence is the assumption that quietly fails. Two instances sharing a zone, a deployment, a config store or a certificate are not independent — a single change or a single building takes both. Most real outages are correlated failures, which is why the arithmetic is optimistic and why chaos testing matters.

Useful figures to hold: 99.9% is about 43 minutes a month. 99.99% is about 4 minutes. 99.999% is 26 seconds a month, which is less time than most deploys take — meaning five nines is a claim about architecture, not about effort.`,
    keyPoints: [
      'Hard dependencies multiply: three 99.9% services cap you at 99.7%.',
      'Independent redundancy compounds: two 99% instances give 99.99%.',
      'Shared zones, deploys and config break the independence assumption.',
      '99.9% ≈ 43 min/month; 99.99% ≈ 4 min; 99.999% ≈ 26 seconds.',
    ],
    related: ['redundancy', 'slo-sli', 'circuit-breaker', 'availability-zones'],
  },
  {
    id: 'multi-region',
    title: 'Multi-region architecture',
    category: 'reliability',
    short: 'Expensive, complex, and occasionally the only thing that satisfies the requirement.',
    body: `Multi-region comes in three shapes, and the differences are mostly about data.

Active-passive with warm standby: a second region runs a scaled-down copy with data replicating asynchronously. Failover is a deliberate act with a recovery time in minutes and a data loss window equal to the replication lag. It is the cheapest option and the one most organisations actually need.

Active-active read, single write region: reads are served locally everywhere, writes route to one region. Excellent read latency worldwide, no write conflicts, and losing the write region is still a real failover.

Active-active everything: writes accepted in every region, with conflict resolution. DynamoDB global tables and Cosmos DB multi-region writes make this available as a feature. The default is last-writer-wins, which silently discards one of two concurrent updates to the same item — you must design for that, not discover it. DynamoDB's multi-region strong consistency mode trades write latency and a shorter list of supported regions for rejecting the conflicting write instead of losing it.

The traffic layer matters as much as the data layer. DNS failover depends on TTLs and is slow and partial. An anycast global load balancer with health checks moves traffic in seconds with no client involvement, which is why GCP's global load balancer and Azure Front Door are structural advantages for this pattern.

The requirement to be honest about: a multi-region setup you have never failed over to is a hypothesis. Test it, on a schedule, in production.`,
    keyPoints: [
      'Active-passive is what most organisations actually need.',
      'Active-active writes mean conflict resolution you must design for.',
      'Anycast load balancing beats DNS failover by orders of magnitude in speed.',
      'An untested failover is not a capability.',
    ],
    related: ['availability-zones', 'anycast', 'cap-theorem', 'rpo-rto', 'global-traffic-management', 'static-stability'],
  },
  {
    id: 'rpo-rto',
    title: 'RPO and RTO',
    category: 'reliability',
    short: 'How much data you can lose, and how long you can be down. Decide both numbers first.',
    body: `Recovery Point Objective is how much data you can afford to lose, measured in time. Nightly backups mean an RPO of up to 24 hours. Continuous replication means an RPO of seconds. Synchronous replication means zero.

Recovery Time Objective is how long you can be down. Restoring a large database from a snapshot might take hours. A standby that fails over automatically takes a minute or two — AWS documents 60 to 120 seconds for a standard RDS Multi-AZ instance, and under 35 seconds for the three-node cluster variant.

These are business decisions dressed as technical ones, and they have to be stated before the architecture, because they determine it. An RPO of zero requires synchronous replication and therefore constrains your geography. An RTO of minutes requires a warm standby and therefore doubles your cost.

Three things that repeatedly go wrong. RTO is measured from "the incident started", not from "we began restoring" — detection and decision time count, and they are often the biggest components. A restore creates a resource with a new endpoint, so recovery includes updating everything pointing at the old one. And a backup that has never been restored is a hypothesis, not a plan.

Test restores on a schedule and measure the actual elapsed time. The number is almost always larger than the estimate, and knowing that before an incident is the entire point.`,
    keyPoints: [
      'RPO = acceptable data loss. RTO = acceptable downtime. Both are business decisions.',
      'RTO includes detection and decision time, not just the restore.',
      'Restores produce new endpoints; updating references is part of recovery.',
      'An untested backup is folklore. Measure a real restore.',
    ],
    related: ['data-durability', 'multi-region', 'incident-response', 'ransomware-resilience', 'disaster-recovery'],
  },
  {
    id: 'health-checks',
    title: 'Health checks',
    category: 'reliability',
    short: 'Two different questions, and conflating them turns degradation into outage.',
    body: `"Am I alive?" and "should I receive traffic?" are different questions with different consequences, and the single most common health check mistake is answering them with the same endpoint.

A liveness check asks whether the process is wedged. Failing it restarts the container — a big, destructive hammer. It must therefore be shallow: does the event loop respond, is the process not deadlocked. Nothing about dependencies.

A readiness check asks whether this instance should get requests right now. Failing it removes the instance from the load balancer or the Service endpoints without killing it. This one may legitimately consider dependencies, and it is the check that makes rolling deploys safe.

The failure that follows from conflating them is worth spelling out. Put a database check in your liveness probe; the database has a brief blip; every replica fails liveness simultaneously; the platform restarts all of them; nothing can serve even after the database recovers, and now you are in a restart loop. A degraded service has become a dead one, caused entirely by the health check.

A startup probe is the third piece: it gives a slow-starting application time to boot without forcing you to make the liveness probe lenient forever.

And on the load balancer side: set the health check type to application-level, not host-level. An instance whose process has hung still passes a host check indefinitely.`,
    keyPoints: [
      'Liveness restarts; readiness removes from rotation. Different endpoints.',
      'Never check dependencies from a liveness probe.',
      'Startup probes handle slow boots without weakening liveness.',
      'Host-level health checks miss every application-level failure.',
    ],
    related: ['probes', 'load-balancing', 'self-healing', 'rolling-updates', 'static-stability'],
  },
  {
    id: 'self-healing',
    title: 'Self-healing systems',
    category: 'reliability',
    short: 'The system notices and repairs the common failures without waking anyone.',
    body: `Self-healing means the ordinary failures — an instance dies, a process hangs, a node goes away — are detected and repaired automatically. It is the difference between a 3am page and a line in a log.

The ingredients are mundane and they compose. Health checks detect. A load balancer stops sending traffic to what failed. An autoscaling group or a ReplicaSet notices the count is below desired and replaces it. Crucially, the workload is stateless and replaceable, so a new instance is as good as the old one.

Kubernetes is built entirely on this idea: a controller compares desired state to actual state and acts continuously. Nothing is imperative, which is why it recovers from conditions nobody anticipated.

What it does not cover is the interesting part. Self-healing handles infrastructure failure well and application bugs badly — a memory leak produces a restart loop that masks the leak, and a bad deploy is faithfully replicated to every replacement instance. That is what automatic rollback on deployment alarms is for: the fastest recovery from a bad release is to stop releasing it.

The design instinct: make every component replaceable, then make replacement automatic.`,
    keyPoints: [
      'Detect, remove, replace — three mechanisms that compose into recovery.',
      'Stateless, replaceable workloads are the precondition.',
      'Kubernetes controllers are continuous reconciliation, not one-shot commands.',
      'Automatic rollback covers the failures self-healing cannot: bad releases.',
    ],
    related: ['health-checks', 'autoscaling', 'control-loop', 'deployment-strategies', 'toil'],
  },
  {
    id: 'circuit-breaker',
    title: 'Circuit breakers',
    category: 'reliability',
    short: 'Stop calling something that is clearly failing, and stop making it worse.',
    body: `A circuit breaker watches calls to a dependency. When the failure rate crosses a threshold it opens: subsequent calls fail instantly without attempting the network. After a cooldown it half-opens, lets one probe through, and either closes or opens again based on the result.

Two problems are solved at once. Your threads stop sitting blocked waiting for timeouts, which is what usually exhausts a connection pool and turns someone else's outage into yours. And the struggling dependency stops receiving load, which is often what it needs to recover — retry storms routinely prevent recovery.

The pattern only pays off if there is a fallback. Serve cached data, return a degraded response, queue the work for later, or omit the feature. A breaker with no fallback converts a slow failure into a fast one, which is an improvement but a small one.

Combine it with timeouts — the breaker cannot detect what never returns — and with bulkheads, where separate connection pools per dependency prevent one slow service from consuming every thread.

The mental model is a fuse. It is not there to prevent the fault; it is there to stop the fault from destroying everything downstream of it.`,
    keyPoints: [
      'Open on failure rate, probe after a cooldown, close when healthy.',
      'Protects your threads and gives the dependency room to recover.',
      'Worth far more with a fallback than without one.',
      'Pair with timeouts and per-dependency pools.',
    ],
    related: ['timeouts-retries', 'backpressure', 'availability-math', 'thundering-herd', 'bulkheads', 'graceful-degradation'],
  },
  {
    id: 'timeouts-retries',
    title: 'Timeouts and retries',
    category: 'reliability',
    short: 'Two settings that decide whether someone else\'s outage becomes yours.',
    body: `Every network call needs a timeout. Without one, a hung dependency holds your thread or connection indefinitely, and under load that exhausts your pool and takes your service down — while your own code and infrastructure are perfectly healthy. Unbounded waits are the single most common way a dependency's problem becomes your outage.

Set the timeout shorter than your own latency budget. If you promise 200ms and you call three services, they cannot each be allowed 5 seconds.

Retries help with transient failures and hurt with sustained ones. Three rules make them safe. Exponential backoff with jitter, so a thousand clients do not retry in unison. A hard cap on attempts, usually two or three. And only retry idempotent operations, or use an idempotency key — retrying a payment because the response was lost is exactly how a customer gets charged twice.

The compounding trap is worth drawing out: if each of three layers makes three attempts, one user request becomes twenty-seven calls to the bottom service. Retry at one layer, usually the outermost one that can make a sensible decision.

And use a deadline that propagates. If the user has already waited 190ms of a 200ms budget, the next call should be given 10ms, not a fresh 5 seconds.`,
    keyPoints: [
      'Every network call gets a timeout, shorter than your own budget.',
      'Backoff with jitter, a small cap, and only on idempotent operations.',
      'Retries at multiple layers multiply; retry at one.',
      'Propagate a deadline rather than restarting the clock at each hop.',
    ],
    related: ['circuit-breaker', 'idempotency', 'thundering-herd', 'latency-budget', 'load-shedding'],
  },
  {
    id: 'slo-sli',
    title: 'SLI, SLO and error budgets',
    category: 'reliability',
    short: 'Measure what users feel, set a target, and spend what is left deliberately.',
    widget: 'error-budget',
    body: `An SLI is a measurement of something users experience: the proportion of requests that succeed, the proportion served under 300ms, the proportion of jobs finishing on time. Not CPU. Not memory. Something a user would notice.

An SLO is a target for that indicator over a window — 99.9% of requests succeed over 30 days. It is a deliberate choice, and the right number is rarely the highest one: each additional nine costs disproportionately more, and past a point your users cannot tell the difference because their own network is less reliable than your service.

The error budget is what makes this operationally useful. 99.9% over 30 days permits about 43 minutes of failure. That budget is a resource you can spend: on risky deploys, on migrations, on experiments. Budget remaining means you can move fast. Budget exhausted means you stop shipping features and fix reliability. It converts an argument about priorities into a number both sides already agreed to.

Alerting follows from it. Alert on burn rate rather than on thresholds: consuming the budget 14.4 times faster than sustainable for an hour — 2% of a month's budget gone — is a page; burning at the budgeted rate for three days, which is 10% of the budget, is a ticket. This produces far fewer, far more meaningful alerts than "CPU above 80%" ever will.`,
    keyPoints: [
      'SLIs measure user experience, not machine state.',
      'The error budget is the inverse of the SLO, and it is a resource to spend.',
      'Budget remaining governs whether you ship or fix.',
      'Alert on burn rate, not on static thresholds.',
    ],
    related: ['error-budgets', 'alerting', 'observability', 'availability-math', 'toil'],
  },
  {
    id: 'error-budgets',
    title: 'Spending an error budget',
    category: 'reliability',
    short: 'Perfect reliability is the wrong goal; the budget tells you how imperfect you may be.',
    body: `Reliability beyond your SLO has a cost and, past a point, no perceivable benefit — your users' own connections fail more often than your service does. The error budget formalises that: it is the amount of unreliability you have explicitly decided is acceptable.

Having budget left means you can take risks: ship the ambitious change, run the migration during business hours, test a failure mode in production. Having spent it means the next work item is reliability, not features. Both directions matter — a team that never spends its budget is being too cautious and shipping too slowly.

The policy is what gives it force, and it has to be agreed in advance, in writing, by both engineering and product. "When the budget is exhausted, feature work pauses until we are back within the objective." Agreed beforehand it is a rule; invented during an incident it is an argument.

Burn-rate alerting is the operational consequence. Fast burn — 14.4 times the sustainable rate for an hour, consuming 2% of a monthly budget — pages someone. A slower burn of six times the rate over six hours, another 5% of the budget, also pages. Slow burn — the budgeted rate sustained over three days, 10% of the budget — opens a ticket. Two alerts replace a dashboard full of thresholds, and both of them mean something.`,
    keyPoints: [
      'Unspent budget means you are shipping too slowly.',
      'The policy must be agreed before you need it.',
      'Fast burn pages; slow burn tickets.',
      'Two burn-rate alerts replace a wall of threshold alerts.',
    ],
    related: ['slo-sli', 'alerting', 'dora-metrics', 'incident-response'],
  },
  {
    id: 'incident-response',
    title: 'Incident response',
    category: 'reliability',
    short: 'Restore service first. Understand it afterwards.',
    body: `The instinct during an outage is to find the root cause. That instinct costs you time. The first job is mitigation — restore service by whatever means is fastest, even if you do not yet know why. Roll back the deploy. Fail over. Shed load. Turn off the feature. Understanding can happen once users are served again.

Structure helps more than heroics. Someone coordinates and is explicitly not debugging. Someone communicates to stakeholders on a fixed cadence, so nobody has to interrupt the people working. Everyone else investigates. Without that split, the most knowledgeable person spends the outage answering questions.

What shortens incidents in practice: a recent change is the first thing to check, because it usually is; a rollback path you have exercised; dashboards that show user-facing symptoms rather than machine internals; and a written timeline kept as you go, because nobody remembers accurately afterwards.

Then the postmortem, and this is where organisations differ most. Blameless means examining why the action made sense to a competent person at the time, given what they could see. "Someone was careless" is not a finding; "the confirmation dialog did not show which environment was selected" is. Action items get owners and dates, or the document is decoration.

The metric worth tracking is not incident count — it is how long they last, and whether the same cause recurs.`,
    keyPoints: [
      'Mitigate first, diagnose second.',
      'Separate the coordinator, the communicator and the investigators.',
      'Check recent changes first; they usually are the cause.',
      'Blameless postmortems examine systems and context, not people.',
    ],
    related: ['observability', 'alerting', 'rpo-rto', 'dora-metrics', 'postmortems', 'on-call'],
  },
  {
    id: 'rolling-updates',
    title: 'Rolling updates',
    category: 'reliability',
    short: 'Replace instances gradually so a bad release reaches only some of your users.',
    body: `A rolling update replaces old instances with new ones a few at a time, waiting for each batch to become healthy before continuing. Compared with replacing everything at once, a bad release hits a fraction of traffic and you have a window to notice before it hits the rest.

Two settings control it. maxUnavailable is how far below the desired count you will go — set it to zero for user-facing services, or the rollout reduces capacity while it runs. maxSurge is how many extra instances may exist temporarily; one or 25% is typical. Together they decide whether the rollout is safe or merely fast.

Two application behaviours make it work. Readiness probes must be honest — if an instance reports ready before it can serve, the rollout marches on while requests fail. And the process must handle SIGTERM by draining in-flight requests before exiting, or every rollout drops the requests that were mid-flight.

Compatibility is the constraint people forget: during a rollout both versions run simultaneously. Database migrations must work with both, which means expand-then-contract — add the column, deploy code that writes both, backfill, deploy code that reads the new one, then remove the old. Skipping that is how a rollout becomes an outage that a rollback cannot fix.`,
    keyPoints: [
      'maxUnavailable: 0 for user-facing services.',
      'An honest readiness probe is what makes the rollout safe.',
      'Handle SIGTERM and drain, or every deploy drops requests.',
      'Both versions run at once — migrations must be backward compatible.',
    ],
    related: ['deployment-strategies', 'probes', 'health-checks', 'ci-cd'],
  },
  {
    id: 'deployment-strategies',
    title: 'Deployment strategies',
    category: 'reliability',
    short: 'How much of your traffic sees a bad release before you notice.',
    body: `All at once: everything is replaced simultaneously. Fast, simple, and a bad release is immediately a full outage with no partial signal. Fine for a development environment.

Rolling: batches are replaced progressively. Limits exposure, no extra infrastructure, and rollback means another rolling deploy — which takes as long as the deploy did.

Blue/green: the new version runs alongside the old on separate infrastructure, then traffic switches over. Rollback is an instant traffic switch back, which is the fastest recovery available. Costs double capacity during the transition, and shared state — particularly the database — still needs compatible migrations.

Canary: a small percentage of traffic goes to the new version while you watch error rates and latency, then you proceed or abort automatically. This is the strongest option because the decision is data-driven rather than time-based. It needs good metrics and the ability to split traffic, both of which Cloud Run, Container Apps and service meshes provide natively.

Feature flags are the complement: deploy the code dark, enable it for a fraction of users, and decouple release from deployment entirely. It means a rollback can be a configuration change rather than a deployment.

Whatever you choose, automatic rollback on alarm is the highest-value setting, and it is frequently left off.`,
    keyPoints: [
      'Canary is the strongest strategy because the go/no-go decision is measured.',
      'Blue/green gives the fastest rollback and costs double capacity briefly.',
      'Feature flags separate deploying code from releasing behaviour.',
      'Automatic rollback on alarm cuts recovery time more than any other setting.',
    ],
    related: ['rolling-updates', 'ci-cd', 'dora-metrics', 'self-healing', 'feature-flags'],
  },
  {
    id: 'dora-metrics',
    title: 'The DORA metrics',
    category: 'reliability',
    short: 'Speed and stability move together, which is the counterintuitive finding.',
    body: `Years of research across thousands of organisations landed on a small set of measures that predict software delivery performance. The original four are the ones most people know: deployment frequency, change lead time (commit to running in production), change fail rate, and time to restore service. That last one was renamed in 2023 to failed deployment recovery time, narrowing it to recovery from a deployment that caused the impairment rather than from any outage at all. DORA has since added a fifth — deployment rework rate, the share of deployments that are unplanned and happen because of a production incident — and groups them as throughput (frequency, lead time, recovery time) and instability (change fail rate, rework rate), alongside reliability as a broader quality of the service.

The counterintuitive result is that speed and stability are positively correlated, not traded against each other. Teams that deploy more often tend to have *lower* change failure rates and recover faster — a relationship DORA has qualified since 2024, when change fail rate proved a statistical outlier and recent reports found AI-accelerated throughput costing stability wherever testing and review were not already strong. The mechanism is not mysterious: frequent deploys are necessarily small, small changes are easier to review, to reason about and to revert, and a team that deploys constantly has a well-exercised deployment path.

The implication is that "we deploy rarely because we are careful" usually produces the opposite of care. Large, infrequent releases bundle many changes, so when something breaks, identifying which change did it is an investigation rather than a glance.

Recovery time is the one worth optimising first, because it is the one users actually feel and because it is largely a function of tooling you control: automatic rollback, feature flags, good dashboards, a practised runbook. The addition of rework rate reflects the same instinct from the other direction — a deployment that "succeeded" and then required three follow-up fixes was not really a success, and only counting outright failures hid that.

Use these to observe trends, not to compare teams — the numbers mean different things in different contexts, and an incentive to improve a measured number tends to improve the number rather than the thing.`,
    keyPoints: [
      'Deployment frequency, change lead time, failed deployment recovery time; change fail rate and rework rate.',
      'Speed and stability rise together; small changes are the mechanism.',
      'Optimise recovery time first — it is what users feel.',
      'Trends over time, not comparisons between teams.',
    ],
    related: ['ci-cd', 'deployment-strategies', 'incident-response', 'error-budgets'],
  },
  {
    id: 'cell-based-architecture',
    title: 'Cell-based architecture',
    category: 'reliability',
    short: 'Run many complete copies of the system and give each customer only one of them.',
    body: `Redundancy within one system protects against a component failing. It does nothing about the failures that take the whole system at once: a poison message every replica chokes on, a configuration change applied everywhere, a database that is slow for everyone, a bug reached by one customer's traffic pattern. For those, the only real control is to have more than one system.

A cell is a complete, independent instance of the stack — its own compute, its own data store, its own capacity — serving a defined subset of customers. A thin routing layer maps each customer to a cell. Cells do not share state and do not call each other, which is the property that makes the isolation real. A failure inside a cell affects that cell's customers and nobody else, so a total failure becomes a partial one: with eight cells, the worst case is roughly an eighth of users rather than all of them.

Three design rules carry most of the benefit. Keep the router thin and boring — it is now shared by everyone, so it must be simpler than what it protects, and ideally statically stable, continuing to route from cached mappings when its control plane is unavailable. Size cells small enough to stay well inside service quotas and to be load-tested end to end, and add cells rather than growing them. And deploy in waves: one cell, watch, then a few, then the rest. Cells turn a bad deploy from an outage into a contained event, but only if the deployment respects the boundary.

The costs are real. Per-cell fixed overhead multiplies, cross-cell operations become awkward or impossible, and anything that must be globally consistent — a unique username, an aggregate report — needs somewhere outside the cells to live, which becomes the shared component you were trying to avoid. Migrating a customer between cells is a project in its own right.

It is the pattern behind the largest cloud services, and it is unnecessary for most systems. The threshold is when the difference between "all users affected" and "5% of users affected" is worth several times the operational complexity.`,
    keyPoints: [
      'A cell is an independent full stack serving a subset of customers; cells share nothing.',
      'Correlated failures — bad config, poison messages, a bug — are what cells contain.',
      'The router must be simpler than what it protects, and keep working without its control plane.',
      'Deploy in waves across cells, and expect global operations to become hard.',
    ],
    related: ['shuffle-sharding', 'blast-radius', 'static-stability', 'multi-tenancy'],
  },
  {
    id: 'shuffle-sharding',
    title: 'Shuffle sharding',
    category: 'reliability',
    short: 'Give each customer a random pair of workers, and one bad customer stops taking everyone down.',
    body: `Divide eight workers into four ordinary shards of two, and a customer whose traffic poisons its shard takes out both its workers — every other customer on that shard goes down with it. One in four of your customers is affected, and which ones is fixed forever.

Shuffle sharding assigns each customer a random combination of workers instead of a fixed block. With eight workers and two per customer there are 28 possible pairs, so only about one customer in 28 shares both of your workers — the scope of impact falls from a quarter of your customers to a twenty-eighth. When one customer is destructive, the customers who overlap lose one of their two workers and, if the client retries on the other, keep working. The damage falls from "everyone in my shard is down" to "some customers lost one of two endpoints".

The combinatorics are the whole trick, and they scale sharply: the probability that another customer shares your entire set falls as the pool grows and as the set size increases. A hundred nodes with five per customer gives tens of millions of combinations, so complete overlap is rare enough to ignore. Relative to ordinary sharding the arrangement usually costs nothing extra in capacity — the same workers, assigned differently.

Two conditions must hold or the isolation is illusory. Clients must retry elsewhere when one endpoint misbehaves, because the benefit is entirely in having a surviving alternative. And the workers must genuinely not share the thing that fails — a shared database or a shared control plane underneath makes the shuffle cosmetic.

The natural home for this is any layer where one tenant can consume a disproportionate share: request routers, API front ends, queue consumers, connection handling. AWS uses it in Route 53 and elsewhere for exactly that reason. It composes well with cells — shuffle within a cell, cells for the bigger blast radius — and, like cells, its value is proportional to how much damage a single tenant can do.`,
    keyPoints: [
      'Random per-customer combinations make complete overlap between customers rare.',
      'A destructive tenant costs others one endpoint rather than their whole shard.',
      'It only works if clients retry on an alternative endpoint.',
      'Shared dependencies underneath make the isolation cosmetic.',
    ],
    related: ['cell-based-architecture', 'blast-radius', 'rate-limiting', 'multi-tenancy'],
  },
  {
    id: 'load-shedding',
    title: 'Load shedding',
    category: 'reliability',
    short: 'Past capacity, refusing some requests quickly serves more users than accepting all of them slowly.',
    body: `When demand exceeds capacity, a system that accepts everything degrades for everyone: queues grow, latency climbs past the point where clients time out, and work is done for requests nobody is waiting for any more. Throughput of *useful* work collapses while the machines stay busy. This is congestion collapse, and it is the failure mode behind a surprising share of total outages.

Load shedding is the deliberate alternative: above a threshold, reject excess requests immediately and cheaply, so the requests you do accept are served within their deadline. A fast 429 or 503 is a far better outcome than a timeout — it is cheap to produce, it tells the client what to do, and it leaves capacity intact for everyone else.

What to shed is a product decision more than a technical one. Shed by priority: health checks and payments before anything, browsing before recommendations, background and batch work first. Shed by cost: an expensive report can wait while cheap reads continue. Shed by tenant, so one customer's surge does not consume the shared pool. Having those priorities declared in advance — a class on every request — is what makes shedding possible in the moment.

Implement it on the right signal. CPU is a lagging indicator; queue depth and queue wait time lead it. A common and effective policy is to drop any request that has already waited longer than its deadline, since completing it serves nobody. Adaptive approaches — increasing the drop rate while latency stays above target — handle varying request costs better than a fixed request-per-second cap.

The client side matters as much. A rejection that triggers immediate retries from thousands of clients is not shedding, it is amplification. Retry with exponential backoff and jitter, honour Retry-After, and use a retry budget so a struggling dependency is not hit with several times its normal load at its worst moment.`,
    keyPoints: [
      'Accepting everything past capacity destroys useful throughput; fast rejection preserves it.',
      'Shed by priority, cost and tenant — decided in advance, not during the incident.',
      'Queue wait time leads CPU; drop requests whose deadline has already passed.',
      'Without client backoff and retry budgets, shedding becomes amplification.',
    ],
    related: ['backpressure', 'rate-limiting', 'timeouts-retries', 'queueing-theory'],
  },
  {
    id: 'graceful-degradation',
    title: 'Graceful degradation',
    category: 'reliability',
    short: 'Decide in advance which features you can lose, so losing them is not an outage.',
    body: `Every hard dependency multiplies into your availability: if the checkout page cannot render without the recommendation service, then the recommendation service's availability is now part of yours. Graceful degradation is the discipline of converting hard dependencies into soft ones, so that a failure downstream produces a smaller page rather than an error page.

It starts as a product conversation. For each feature, what is the acceptable behaviour when its dependency is unavailable — hide it, show stale data, show a cached default, queue the action for later, or fail the whole request? A store can sell without personalisation, without reviews, and without the loyalty-points balance. It cannot sell without the payment provider. Writing that table down is most of the work, and it is not an engineering decision to make alone.

The mechanisms are familiar. A timeout short enough that the optional call cannot dominate the response. A circuit breaker that stops calling a dependency that is failing and returns the fallback immediately, which also gives the struggling dependency room to recover. A cache that can serve stale entries when the origin is unavailable — stale data is usually better than no page. And a feature flag that lets a human turn off an expensive path during an incident.

Two specific degradations are worth designing deliberately, because they come up repeatedly. Read-only mode: when the primary database is unavailable or failing over, serving reads from a replica keeps most of a site working. And write-behind: accepting a request into a queue and confirming it, rather than requiring the downstream system to be available synchronously.

Test the degraded path, or you do not have one. Fallbacks that are never exercised are typically broken — the stale cache empty, the fallback path untested against current data shapes, the timeout longer than the client's own. Game days and chaos experiments exist largely to find exactly this.`,
    keyPoints: [
      'Hard dependencies multiply into your availability; soft ones do not.',
      'Decide per feature, with the product, what happens when its dependency is gone.',
      'Timeouts, circuit breakers, stale caches and kill switches are the mechanisms.',
      'Untested fallback paths are usually broken paths.',
    ],
    related: ['circuit-breaker', 'timeouts-retries', 'feature-flags', 'availability-math'],
  },
  {
    id: 'bulkheads',
    title: 'Bulkheads',
    category: 'reliability',
    short: 'Separate resource pools, so one saturated dependency cannot consume the whole service.',
    body: `A ship is divided into watertight compartments so that a hole floods one of them rather than the hull. The software version is the same idea applied to whatever is finite in your process: threads, connections, memory, concurrency slots.

The classic failure it prevents: a service calls a slow dependency, each call holds a thread while it waits, and within a minute every thread in the pool is parked on that one dependency. Requests that have nothing to do with it now fail too, because there is nothing left to serve them. One slow downstream has become a total outage, and the parts of the system that were perfectly healthy are down for a reason that has nothing to do with them.

A bulkhead bounds the damage by giving each dependency its own limited pool. Calls to the payment provider may use at most twenty concurrent slots; when those are exhausted, further payment calls fail fast while everything else continues. The important part is failing fast at the boundary rather than queueing behind it — an unbounded queue in front of a bulkhead recreates the problem it was meant to solve.

Bulkheads exist at every scale, and the coarser ones are stronger. Separate connection pools per dependency inside a process. Separate thread pools or concurrency limits per endpoint class. Separate deployments for critical and non-critical paths, so a bug in the reporting endpoints cannot exhaust the machines serving checkout. Separate node pools, clusters, accounts or cells for the coarsest isolation of all.

The cost is utilisation: partitioned resources are less efficient than one shared pool, and the partition that sits idle cannot help the one that is saturated. That is the trade being made deliberately — some capacity in exchange for the guarantee that saturation stays local. Combine with a circuit breaker, which stops the calls entirely once a dependency is clearly unhealthy, and with timeouts short enough that a slot is never held for long.`,
    keyPoints: [
      'A shared thread or connection pool lets one slow dependency take down everything.',
      'Give each dependency a bounded pool and fail fast when it is exhausted.',
      'Coarser bulkheads — separate deployments, pools, accounts — isolate more strongly.',
      'You pay in utilisation for the guarantee that saturation stays local.',
    ],
    related: ['circuit-breaker', 'timeouts-retries', 'connection-pooling', 'blast-radius'],
  },
  {
    id: 'queueing-theory',
    title: 'Why latency explodes near full',
    category: 'reliability',
    short: 'Queues grow non-linearly with utilisation. The last 20% of capacity costs far more than the first 80%.',
    body: `A system at 50% utilisation and the same system at 90% do not differ by a factor of two in queueing delay — they differ by roughly a factor of nine. For a simple queue, waiting time scales with ρ/(1−ρ), where ρ is utilisation. At 50% the factor is 1; at 80% it is 4; at 90% it is 9; at 95% it is 19. This is why a service that looks comfortable at 70% CPU falls over at 90% with no warning in between, and why average utilisation is a misleading measure of headroom.

Variability makes it worse, and real systems are highly variable. Arrivals are bursty rather than evenly spaced, and request costs differ by orders of magnitude — one expensive query among cheap ones delays everything behind it. Both push the knee of the curve to lower utilisation than the textbook figure, which is the practical justification for running at 60–70% rather than 85%.

Little's Law is the other result worth carrying: the number of requests in the system equals the arrival rate multiplied by the average time in the system (L = λW). It holds for any stable system in steady state, whatever the arrival and service distributions, and answers questions people usually guess at. At 500 requests per second with an average of 200ms in-flight, you have 100 concurrent requests — so a thread pool of 50 is a bottleneck, and a pool of 2,000 is an invitation to queue enormously before failing.

Two conclusions for design. Concurrency limits should be set from measured arrival rate and latency, not chosen because the number looked generous; too large a limit converts a capacity problem into a latency collapse. And the most effective latency fix is often reducing variability rather than adding capacity: separating expensive work onto its own path, capping request cost, or moving batch jobs away from interactive traffic.

The operational reading: keep headroom, alert on queue depth and wait time rather than on utilisation alone, and treat 90% utilisation as full.`,
    keyPoints: [
      'Queueing delay scales as ρ/(1−ρ): 90% utilisation queues nine times as much as 50%.',
      'Burstiness and uneven request cost move the knee lower — target 60–70%.',
      'Little\'s Law (L = λW) sizes pools and connections from measured numbers.',
      'Oversized concurrency limits turn saturation into collapse rather than rejection.',
    ],
    related: ['capacity-planning', 'load-shedding', 'backpressure', 'latency-budget'],
  },
  {
    id: 'static-stability',
    title: 'Static stability',
    category: 'reliability',
    short: 'Keep working with the state you already have, when the thing that gives you new state is down.',
    body: `Control planes — the systems that create, configure and change things — are more complex than data planes, which merely serve traffic using the configuration they already have. They are therefore more likely to fail. Static stability is the property of a system that keeps doing its job correctly when its control plane is unavailable, using the last state it knew about.

The canonical examples are worth memorising because they generalise. A load balancer that keeps sending traffic to its existing healthy targets when it cannot reach the health-check control plane, rather than failing closed and dropping everything. A service mesh proxy that keeps routing with cached configuration when the control plane is unreachable. Nodes that keep running their existing workloads when the cluster API is down. DNS resolvers serving expired-but-cached entries when the authoritative servers are unreachable, which is a deliberate choice to prefer stale answers over no answers.

The pattern has a cost, and stating it plainly is the point: static stability means pre-provisioning. If losing a zone should not require launching instances — because the instance-launch API is exactly the thing likely to be busy during a large event — then the other zones must already be running enough capacity to absorb the load. You pay for idle capacity in exchange for a recovery path that does not depend on anything working at the worst moment.

The failure this prevents is correlated and large. During a major provider event, everyone's autoscaling fires at once, everyone's failover tries to create resources at once, and the control plane APIs become the bottleneck. A design that needs to create something to recover is a design that recovers last, behind everyone else trying to do the same thing.

The question to ask of any failover plan: what has to be *working* for this recovery to happen? Every answer is a dependency on the worst hour of the year, and each one is a candidate for being pre-provisioned instead.`,
    keyPoints: [
      'Data planes should keep serving on cached state when control planes fail.',
      'Prefer stale configuration over no configuration; fail open where it is safe to.',
      'Static stability means pre-provisioned capacity rather than recovery-time provisioning.',
      'Ask what must be working for your failover to succeed — that is your real dependency list.',
    ],
    related: ['health-checks', 'multi-region', 'disaster-recovery', 'capacity-planning'],
  },
  {
    id: 'disaster-recovery',
    title: 'Disaster recovery',
    category: 'reliability',
    short: 'Four strategies, priced by how much downtime and data loss you can accept.',
    body: `Disaster recovery is what you do when a whole environment is gone — a region, an account, a database destroyed by a bad migration or an attacker. It is distinct from high availability, which handles component failures automatically and invisibly, and the two solve different problems: an architecture can be beautifully multi-zone and still have no answer to "someone deleted the account".

The strategies form a ladder, each trading cost for recovery time. Backup and restore: backups copied to another region, infrastructure recreated on demand. The cheapest, with recovery measured in hours, and entirely adequate for many internal systems. Pilot light: data continuously replicated and the core services defined but switched off; recovery in tens of minutes. Warm standby: a scaled-down but running copy taking no traffic, scaled up on failover; recovery in minutes. Active-active: full capacity in both places serving traffic, with the highest cost and the most complexity, and near-zero recovery time.

Pick the rung from stated objectives rather than ambition. RTO is how long you can be down; RPO is how much data you can lose. Both are business decisions with a price attached, and the instinct to answer "zero" for both disappears once the cost of that answer is shown. Different systems in the same organisation legitimately sit on different rungs.

The plan is worth exactly what its last test was worth. Untested recovery fails on the details: the runbook references a person who left, the backup contains the data but not the encryption key, a dependency is only in the primary region, DNS TTLs are long enough to make failover slow, nobody has permission to promote the replica, or the restore takes eleven hours because nobody measured it. Restoring a database from backup is the single most valuable thing to rehearse, on a schedule, with the time recorded.

And keep the recovery path independent. Backups in the same account with the same credentials as production are not backups against ransomware or an account compromise — a separate account, with object lock or immutability and a retention policy, is what makes them survive an attacker with your permissions.`,
    keyPoints: [
      'Backup-and-restore, pilot light, warm standby, active-active: increasing cost, decreasing recovery time.',
      'Choose the rung from stated RTO and RPO, per system, with the price visible.',
      'An untested plan fails on details — rehearse restores and record how long they take.',
      'Backups reachable with production credentials do not survive ransomware.',
    ],
    related: ['rpo-rto', 'multi-region', 'ransomware-resilience', 'chaos-engineering'],
  },
  {
    id: 'consensus-and-quorum',
    title: 'Consensus, quorum and split brain',
    category: 'reliability',
    short: 'Two nodes both believing they are the primary is worse than having no primary at all.',
    body: `Any system with a single writer needs an answer to one question: when the current primary stops responding, who decides that it is dead and who takes over? Getting this wrong produces split brain — two nodes each accepting writes, each believing the other is gone — and the result is divergent data that cannot be merged automatically, which is a worse outcome than a few minutes of unavailability.

The core difficulty is that a node cannot distinguish a peer that has crashed from a peer it cannot reach. The standard answer is quorum: decisions require a majority of an odd-numbered group, so at most one side of any network partition can have one. This is why etcd, ZooKeeper, Consul and their relatives are deployed in threes or fives — three tolerates one failure, five tolerates two — and why even-numbered clusters are a mistake, since four nodes tolerate exactly as many failures as three while failing more often.

Consensus protocols (Raft, Paxos and their descendants) turn that into a usable primitive: a replicated log that all members agree on, with automatic leader election. They are the foundation under distributed databases, schedulers and the coordination services that everything else leans on. The practical consequence is that every write costs a round trip to a majority, which is why placing consensus members across regions is such an expensive decision.

Where the quorum is stretched across zones, place members deliberately. Three zones with one member each tolerates a zone loss. Two zones cannot: whichever zone holds one member loses quorum when the other is lost. This is a common and painful discovery during a zone outage.

Managed databases hide most of this, but not the consequences. A Multi-AZ failover has a real, non-zero recovery time — AWS documents 60 to 120 seconds for a standard RDS Multi-AZ instance, and under 35 seconds for the three-node Multi-AZ cluster — while the standby is promoted and the endpoint is repointed, and writes fail throughout. Applications need to survive that window with retries and a circuit breaker rather than treating it as an outage, and a fencing mechanism must ensure the demoted primary cannot accept a late write.`,
    keyPoints: [
      'A node cannot tell a crashed peer from an unreachable one; quorum resolves it.',
      'Odd-sized groups of three or five; even sizes add cost without adding tolerance.',
      'Spread quorum members across three zones, or a zone loss costs you the majority.',
      'Failover costs a minute or two of write unavailability — applications must ride it out.',
    ],
    related: ['cap-theorem', 'eventual-consistency', 'availability-zones', 'read-replicas'],
  },
]
