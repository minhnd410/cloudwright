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

And be honest about what is redundant. A stateless web tier is easy. A relational primary is not — you get a standby with a failover measured in tens of seconds, not a second active copy. Knowing which of your components can actually be redundant is most of an availability design.`,
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

Active-active everything: writes accepted in every region, with conflict resolution. DynamoDB global tables and Cosmos DB multi-region writes make this available as a feature. Last-writer-wins silently discards one of two concurrent updates to the same item — you must design for that, not discover it.

The traffic layer matters as much as the data layer. DNS failover depends on TTLs and is slow and partial. An anycast global load balancer with health checks moves traffic in seconds with no client involvement, which is why GCP's global load balancer and Azure Front Door are structural advantages for this pattern.

The requirement to be honest about: a multi-region setup you have never failed over to is a hypothesis. Test it, on a schedule, in production.`,
    keyPoints: [
      'Active-passive is what most organisations actually need.',
      'Active-active writes mean conflict resolution you must design for.',
      'Anycast load balancing beats DNS failover by orders of magnitude in speed.',
      'An untested failover is not a capability.',
    ],
    related: ['availability-zones', 'anycast', 'cap-theorem', 'rpo-rto'],
  },
  {
    id: 'rpo-rto',
    title: 'RPO and RTO',
    category: 'reliability',
    short: 'How much data you can lose, and how long you can be down. Decide both numbers first.',
    body: `Recovery Point Objective is how much data you can afford to lose, measured in time. Nightly backups mean an RPO of up to 24 hours. Continuous replication means an RPO of seconds. Synchronous replication means zero.

Recovery Time Objective is how long you can be down. Restoring a large database from a snapshot might take hours. A standby that fails over automatically takes under a minute.

These are business decisions dressed as technical ones, and they have to be stated before the architecture, because they determine it. An RPO of zero requires synchronous replication and therefore constrains your geography. An RTO of minutes requires a warm standby and therefore doubles your cost.

Three things that repeatedly go wrong. RTO is measured from "the incident started", not from "we began restoring" — detection and decision time count, and they are often the biggest components. A restore creates a resource with a new endpoint, so recovery includes updating everything pointing at the old one. And a backup that has never been restored is a hypothesis, not a plan.

Test restores on a schedule and measure the actual elapsed time. The number is almost always larger than the estimate, and knowing that before an incident is the entire point.`,
    keyPoints: [
      'RPO = acceptable data loss. RTO = acceptable downtime. Both are business decisions.',
      'RTO includes detection and decision time, not just the restore.',
      'Restores produce new endpoints; updating references is part of recovery.',
      'An untested backup is folklore. Measure a real restore.',
    ],
    related: ['data-durability', 'multi-region', 'incident-response', 'ransomware-resilience'],
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
    related: ['probes', 'load-balancing', 'self-healing', 'rolling-updates'],
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
    related: ['health-checks', 'autoscaling', 'control-loop', 'deployment-strategies'],
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
    related: ['timeouts-retries', 'backpressure', 'availability-math', 'thundering-herd'],
  },
  {
    id: 'timeouts-retries',
    title: 'Timeouts and retries',
    category: 'reliability',
    short: 'Two settings that decide whether someone else\'s outage becomes yours.',
    body: `Every network call needs a timeout. Without one, a hung dependency holds your thread or connection indefinitely, and under load that exhausts your pool and takes your service down — while your own code and infrastructure are perfectly healthy. Unbounded waits are the single most common way a dependency's problem becomes your outage.

Set the timeout shorter than your own latency budget. If you promise 200ms and you call three services, they cannot each be allowed 5 seconds.

Retries help with transient failures and hurt with sustained ones. Three rules make them safe. Exponential backoff with jitter, so a thousand clients do not retry in unison. A hard cap on attempts, usually two or three. And only retry idempotent operations, or use an idempotency key — retrying a payment because the response was lost is exactly how a customer gets charged twice.

The compounding trap is worth drawing out: if each of three layers retries three times, one user request becomes twenty-seven calls to the bottom service. Retry at one layer, usually the outermost one that can make a sensible decision.

And use a deadline that propagates. If the user has already waited 190ms of a 200ms budget, the next call should be given 10ms, not a fresh 5 seconds.`,
    keyPoints: [
      'Every network call gets a timeout, shorter than your own budget.',
      'Backoff with jitter, a small cap, and only on idempotent operations.',
      'Retries at multiple layers multiply; retry at one.',
      'Propagate a deadline rather than restarting the clock at each hop.',
    ],
    related: ['circuit-breaker', 'idempotency', 'thundering-herd', 'latency-budget'],
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

Alerting follows from it. Alert on burn rate rather than on thresholds: consuming the budget 14 times faster than sustainable for an hour is a page; 1.5 times faster over a day is a ticket. This produces far fewer, far more meaningful alerts than "CPU above 80%" ever will.`,
    keyPoints: [
      'SLIs measure user experience, not machine state.',
      'The error budget is the inverse of the SLO, and it is a resource to spend.',
      'Budget remaining governs whether you ship or fix.',
      'Alert on burn rate, not on static thresholds.',
    ],
    related: ['error-budgets', 'alerting', 'observability', 'availability-math'],
  },
  {
    id: 'error-budgets',
    title: 'Spending an error budget',
    category: 'reliability',
    short: 'Perfect reliability is the wrong goal; the budget tells you how imperfect you may be.',
    body: `Reliability beyond your SLO has a cost and, past a point, no perceivable benefit — your users' own connections fail more often than your service does. The error budget formalises that: it is the amount of unreliability you have explicitly decided is acceptable.

Having budget left means you can take risks: ship the ambitious change, run the migration during business hours, test a failure mode in production. Having spent it means the next work item is reliability, not features. Both directions matter — a team that never spends its budget is being too cautious and shipping too slowly.

The policy is what gives it force, and it has to be agreed in advance, in writing, by both engineering and product. "When the budget is exhausted, feature work pauses until we are back within the objective." Agreed beforehand it is a rule; invented during an incident it is an argument.

Burn-rate alerting is the operational consequence. Fast burn — 14 times the sustainable rate for an hour, consuming 2% of a monthly budget — pages someone. Slow burn — 1.5 times over a day — opens a ticket. Two alerts replace a dashboard full of thresholds, and both of them mean something.`,
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
    related: ['observability', 'alerting', 'rpo-rto', 'dora-metrics'],
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
    related: ['rolling-updates', 'ci-cd', 'dora-metrics', 'self-healing'],
  },
  {
    id: 'dora-metrics',
    title: 'The four DORA metrics',
    category: 'reliability',
    short: 'Speed and stability move together, which is the counterintuitive finding.',
    body: `Years of research across thousands of organisations landed on four measures that predict software delivery performance: deployment frequency, lead time for change, change failure rate, and time to restore service.

The counterintuitive result is that speed and stability are positively correlated, not traded against each other. Teams that deploy more often have *lower* change failure rates and recover faster. The mechanism is not mysterious: frequent deploys are necessarily small, small changes are easier to review, to reason about and to revert, and a team that deploys constantly has a well-exercised deployment path.

The implication is that "we deploy rarely because we are careful" usually produces the opposite of care. Large, infrequent releases bundle many changes, so when something breaks, identifying which change did it is an investigation rather than a glance.

Time to restore is the one worth optimising first, because it is the one users actually feel and because it is largely a function of tooling you control: automatic rollback, feature flags, good dashboards, a practised runbook.

Use these to observe trends, not to compare teams — the numbers mean different things in different contexts, and an incentive to improve a measured number tends to improve the number rather than the thing.`,
    keyPoints: [
      'Deployment frequency, lead time, change failure rate, time to restore.',
      'Speed and stability rise together; small changes are the mechanism.',
      'Optimise time to restore first — it is what users feel.',
      'Trends over time, not comparisons between teams.',
    ],
    related: ['ci-cd', 'deployment-strategies', 'incident-response', 'error-budgets'],
  },
]
