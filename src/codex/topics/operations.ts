import type { Concept } from '../types'

export const operations: Concept[] = [
  {
    id: 'observability',
    title: 'Observability',
    category: 'operations',
    short: 'Being able to answer questions you did not anticipate, from the outside.',
    body: `Monitoring tells you whether known things are broken. Observability is being able to ask a question nobody thought of in advance — "which customers on the new plan are getting slow checkouts?" — and get an answer from the data you already collect.

Three signals, and they answer different questions. Metrics are cheap numeric aggregates over time; they tell you *that* something changed and are what you alert on. Logs are discrete events with detail; they tell you *what* happened to a specific request. Traces follow one request across every service it touched; they tell you *where* the time went, which is the question that is otherwise almost impossible to answer in a distributed system.

The practice that multiplies their value is structured logging with correlation. Emit JSON rather than prose, and include a trace id on every line, so a single identifier pulls together the log entries, the trace and the metrics for one request. Grep against unstructured text stops scaling long before your system does.

Two economic realities. Cardinality is what makes metrics expensive — a label containing user id or request id creates a separate time series per value, and that is how observability bills get alarming. And ingestion volume dominates log costs, so sample aggressively: keep all errors, a fraction of successes.

A fourth signal, continuous profiling, reached public alpha in OpenTelemetry in 2026: sampled stack traces showing which functions consume CPU and memory in production. It answers the question the other three leave open — not which service was slow, but which code.

The test of whether you have it: during the last incident, did you find the cause by querying, or by guessing and redeploying?`,
    keyPoints: [
      'Metrics say that something changed; logs say what; traces say where.',
      'Structured logs plus a trace id on every line is the highest-leverage habit.',
      'High-cardinality metric labels are what make the bill explode.',
      'Sample successes, keep every error.',
    ],
    related: ['distributed-tracing', 'alerting', 'slo-sli', 'incident-response', 'golden-signals'],
  },
  {
    id: 'alerting',
    title: 'Alerting',
    category: 'operations',
    short: 'Every page should mean something. A noisy pager is a muted pager.',
    body: `The failure mode is not too few alerts, it is too many. A pager that fires several times a night for things nobody needs to act on stops being read, and then the one that mattered is missed too. Alert fatigue is a real and measurable cause of long incidents.

The principle: page on symptoms, not causes. High CPU is a cause and might mean nothing. A climbing error rate on checkout is a symptom, and it always means something. If an alert fires and the right response is "acknowledge and go back to sleep", it should not have been a page.

Burn-rate alerting on an SLO is the cleanest version of this. The recommended set from the Google SRE workbook is three alerts: consuming your error budget 14.4 times faster than sustainable over an hour — 2% of a month's budget gone — is a page; 6 times faster over six hours is a second, slower page; and burning at the budgeted rate over three days, a tenth of the budget, is a ticket. Three alerts replace a wall of thresholds, and all three are actionable by construction.

Practical mechanics that reduce noise substantially. Require several consecutive bad periods before firing, so a single noisy minute does not page. Be deliberate about missing data — an alarm that goes to "insufficient data" when the service dies completely is an alarm that stays silent during the worst outage. Group related alerts so one incident produces one page. And give every alert a runbook link, because an alert nobody knows how to respond to is only anxiety.

Review alerts regularly: which fired, which were actionable, which were ignored. Delete the rest.`,
    keyPoints: [
      'Page on user-visible symptoms; leave causes on dashboards.',
      'Burn-rate alerts: 14.4x over an hour and 6x over six hours page, 1x over three days tickets.',
      'If the response is "acknowledge and ignore", it is not a page.',
      'Handle missing data deliberately or you go silent during total failure.',
      'Every alert needs a runbook; review and delete the noisy ones.',
    ],
    related: ['slo-sli', 'error-budgets', 'observability', 'incident-response', 'golden-signals'],
  },
  {
    id: 'distributed-tracing',
    title: 'Distributed tracing',
    category: 'operations',
    short: 'Follow one request across every service and see exactly where the time went.',
    body: `In a system of one service, a profiler answers "why was that slow". In a system of twelve, it does not — the request crossed six of them and the slow part might be any one, or the network between two.

Tracing solves this by attaching a trace id at the entry point and propagating it through every downstream call. Each service records spans — operations with a start, a duration and attributes — and the collector assembles them into a single timeline. You can then see that the 1.8 seconds went to one database call in one service, and the rest was fine.

OpenTelemetry has become the standard instrumentation layer across all of this: one set of libraries, any backend. Auto-instrumentation for common frameworks and clients gets you most of the value with very little code.

Three things make traces genuinely useful rather than decorative. Propagate context across every boundary, including queues and asynchronous work — a trace that stops at the queue tells you nothing about the consumer. Add business attributes (customer tier, feature flag, region) so you can ask questions that matter rather than only technical ones. And sample intelligently: keep every error and slow request, sample the fast successes, because tracing every request at high volume is expensive and mostly redundant.

The payoff is specific: tracing turns "the site is slow" into "this call, in this service, for these customers".`,
    keyPoints: [
      'A trace id propagated across services turns guesswork into a timeline.',
      'OpenTelemetry is the vendor-neutral standard; auto-instrumentation gets you far.',
      'Propagate context through queues, or the trace ends at the boundary.',
      'Keep errors and slow requests; sample the rest.',
    ],
    related: ['observability', 'event-driven', 'latency-budget'],
  },
  {
    id: 'ci-cd',
    title: 'Continuous integration and delivery',
    category: 'operations',
    short: 'The path from a commit to production, and how much you trust it.',
    body: `Continuous integration means every change is merged and verified frequently — build, test, lint, scan, on every commit. The value is in catching problems minutes after they are introduced rather than during a release week, when the change is one of fifty and nobody remembers writing it.

Continuous delivery means every build is deployable. Continuous deployment means it is actually deployed, automatically. The gap between them is a judgement about how much you trust your tests and your rollback.

A pipeline worth having: build once and produce one immutable artefact; run tests and security scans; deploy that same artefact to staging and smoke test it; then deploy the same artefact to production progressively, watching metrics, with automatic rollback on alarm. Building separately per environment defeats the whole point, because the thing you tested is not the thing you shipped.

Gates are a genuine trade. Too few and bad code ships; too many and the pipeline becomes slow enough that people route around it, which is worse than having no gates. A manual approval that is always granted is not a control, it is a delay.

And the pipeline's identity is one of the most powerful credentials in your organisation — it can deploy to production. Scope it narrowly, use workload identity federation rather than stored keys, and require review on the pipeline definition itself.

The measure that matters most: how quickly can you get a fix out? That number is the ceiling on your recovery time.`,
    keyPoints: [
      'Build once, promote the same artefact through every environment.',
      'Automatic rollback on alarm cuts recovery time more than any gate adds safety.',
      'A manual approval that is always granted is a delay, not a control.',
      'The pipeline identity can deploy to production; treat it accordingly.',
    ],
    related: ['deployment-strategies', 'dora-metrics', 'supply-chain-security', 'immutable-infrastructure', 'gitops', 'release-versioning'],
  },
  {
    id: 'cost-optimisation',
    title: 'Cost optimisation',
    category: 'operations',
    short: 'Most cloud waste is idle capacity, forgotten resources, and data movement.',
    body: `Cloud bills grow through accumulation rather than through any single decision, and the big line items are consistent across organisations.

Idle and oversized resources. Instances sized for a peak that never comes, non-production environments running at nights and weekends, volumes attached to nothing. The fix is right-sizing from actual utilisation and scheduled shutdown for non-production — often the single largest saving available and nearly free to implement.

Commitment discounts. Savings plans, reserved instances and committed use discounts cut compute costs by roughly 20–72% for load you will run anyway. The spread measures how much flexibility you give up: a one-year commitment you can move between instance families sits near 28%, while the advertised ceiling needs three years against specific capacity. GCP's sustained-use discounts apply automatically with no commitment at all, but only to the older machine families — up to 30% on N1, M1 and M2, up to 20% on N2, N2D and C2 — and not to E2 or to the newer series, where a commitment is the only discount available.

Data transfer. Egress to the internet, and cross-zone and cross-region traffic, are frequently a top-three line item and almost always invisible until someone looks. Keeping traffic in-zone where possible, using free gateway endpoints for object storage, and serving through a CDN — where transfer from an in-cloud origin to the edge is waived on CloudFront and Front Door, though Cloud CDN bills cache fill by the gigabyte — address most of it.

Storage lifecycle. Old objects on hot storage, snapshots nobody will restore, log groups with no retention policy, incomplete multipart uploads that are invisible in the console and billed forever.

Two habits make it durable: tag everything so cost is attributable to a team or product, and set budget alerts so a runaway is caught in hours rather than at the end of the month. Cost is an architectural property — a design that costs ten times more for the same outcome is a worse design.`,
    keyPoints: [
      'Right-sizing and non-production schedules are the biggest easy wins.',
      'Commitment discounts pay for load you were going to run anyway.',
      'Data transfer is usually a bigger line item than anyone expects.',
      'Tag for attribution and set budget alerts; find it in hours, not months.',
    ],
    related: ['capacity-planning', 'nat-vs-igw', 'private-connectivity', 'object-storage', 'spot-capacity', 'instance-selection'],
  },
  {
    id: 'infrastructure-as-code',
    title: 'Infrastructure as code',
    category: 'operations',
    short: 'The console is for looking. Anything that has to exist tomorrow belongs in a file.',
    body: `Infrastructure created by hand exists only in one place and only in one person's memory. It cannot be reviewed, cannot be recreated in another region after a bad day, and cannot be compared against what was intended. Infrastructure as code makes the definition the source of truth and the running estate a consequence of it.

Two styles. Declarative — Terraform, OpenTofu, CloudFormation, Bicep, Kubernetes manifests, and Pulumi, which reaches the same desired-state model through a general-purpose language — describes the desired end state and lets the tool work out the operations. Imperative scripting describes the steps. Declarative wins for infrastructure because the same definition applied twice converges rather than compounding, which is what makes a rerun safe after a partial failure.

State is the part that bites. Terraform keeps a state file mapping your definitions to real resource identifiers; it is the tool's only way to know that the instance it created is the instance in the file. Keep it remote, encrypted and versioned, enable locking so two applies cannot race, and never edit it by hand unless you have a backup and a reason. Losing state does not destroy anything, but it does mean the tool will happily create a second copy of everything.

Drift is the second. Someone fixes production at 2am through the console and the definition no longer describes reality; the next apply either reverts the fix or fails. The cure is a combination of running a plan on a schedule and treating unexpected diffs as an incident signal, and of making the emergency console route rare enough to notice — read-only production access with break-glass elevation does most of this.

Module design decides whether this scales. Small, composable modules with narrow interfaces are reusable; a module with sixty variables is a programming language with worse tooling. Pin provider and module versions, because an unpinned upgrade turns an unrelated apply into an unplanned migration.

And review plans, not only code. The diff between intent and effect is where the destructive surprise lives — a change that quietly says "replace" on a database is a different conversation from one that says "update in place".`,
    keyPoints: [
      'Declarative definitions converge on rerun; scripts compound.',
      'Remote, locked, versioned state — and never hand-edit it casually.',
      'Drift is inevitable; detect it on a schedule and make console changes exceptional.',
      'Review the plan, not only the code: "replace" and "update" are different risks.',
    ],
    related: ['declarative-vs-imperative', 'gitops', 'immutable-infrastructure', 'policy-as-code'],
  },
  {
    id: 'gitops',
    title: 'GitOps',
    category: 'operations',
    short: 'Git holds the desired state; an agent in the cluster makes reality match it, continuously.',
    body: `GitOps takes the Kubernetes control loop and applies it to delivery. The desired state of an environment lives in a Git repository. An agent running inside the target — Argo CD or Flux, typically — watches that repository and the live state, and reconciles the difference on a loop, forever. Deployment stops being an event that a pipeline performs and becomes a property the system maintains.

The OpenGitOps principles state it more generally — declarative desired state, stored versioned and immutably, pulled automatically by agents, and continuously reconciled — but Git and an agent inside the cluster are the shape almost everyone builds.

Four consequences follow, and they are the reason for the pattern. Reconciliation is continuous, so drift is visible rather than silent, and reverted rather than accumulating into a snowflake where you have turned correction on — Flux corrects drift on every reconcile by default, while Argo CD reports the application as out of sync and only reverts once the sync policy enables automated self-healing. Rollback is a Git revert, with an audit trail that is the same object as the change history. The credentials that can modify the cluster live inside the cluster, so your CI system no longer needs production access — pull beats push precisely because it inverts the direction of trust. And "what is running" is answerable by reading a repository.

The practical shape is two repositories or two clear directories: application source, and the environment definitions describing which versions run where. CI builds and publishes an image, then updates a version reference in the environment repository; the agent notices and applies. Promotion between environments becomes a pull request that changes a tag, which is a reviewable, revertible artefact.

Secrets are the awkward part, because plain manifests in Git cannot hold them. The workable answers are encrypted-at-rest secrets committed alongside the manifests (SOPS, Sealed Secrets) or an operator that pulls from a real secret manager at apply time and keeps only a reference in Git. The second is usually better; rotation then happens in one place.

Watch for the failure specific to this model: a repository that is out of sync for hours because reconciliation is broken, and nobody noticed. The sync status of every environment belongs on a dashboard and in an alert, otherwise the guarantee you are relying on has quietly stopped being true.`,
    keyPoints: [
      'Git is the desired state; an in-cluster agent reconciles continuously.',
      'Drift correction is opt-in in Argo CD and on by default in Flux — check which you have.',
      'Pull inverts trust — CI never needs production credentials.',
      'Promotion becomes a reviewed pull request that changes a version reference.',
      'Alert on sync status, or the guarantee fails silently.',
    ],
    related: ['infrastructure-as-code', 'control-loop', 'ci-cd', 'declarative-vs-imperative'],
  },
  {
    id: 'toil',
    title: 'Toil',
    category: 'operations',
    short: 'Manual, repetitive, automatable work that scales with the system and teaches you nothing.',
    body: `Google's SRE practice gives toil a precise definition, and precision is what makes it useful. Toil is work that is manual, repetitive, automatable, tactical rather than strategic, devoid of enduring value, and — the property that makes it dangerous — grows linearly with the size of the service. Restarting a stuck worker, applying a certificate by hand, running the same query to answer the same question, approving a routine access request.

Not all unpleasant work is toil, and the distinction matters. Debugging a failure nobody has seen before is hard and valuable. Overheads such as planning and recruiting are not toil either. But the boundary is a spectrum rather than a line — Google counts handling pager alerts as toil, and caps operational work as a whole rather than sorting it first. The test is whether a machine could do it if someone spent a week making it possible.

The reason to name it is that toil expands to fill available time and crowds out the engineering that would have removed it. The SRE convention is a cap — no more than half of an SRE's time on operational work — with the explicit consequence that when a service exceeds it, load is handed back to the development team or engineering time is spent reducing it. The cap is a forcing function, not an aspiration.

Measure it before you fight it. Count interrupts, tickets and pages, tag them by cause, and record the time each one actually consumed — hours, not incidents, because ten trivial interrupts and one afternoon-long one are different problems. A handful of causes usually accounts for most of the total. The response is not always automation: sometimes the correct fix is removing the need — a self-healing restart, a permission that did not need approval, a default that stops the question being asked.

And take seriously that toil is how experienced people leave. A rota where the work is largely repetitive and the backlog of improvements never gets touched is a retention problem before it is a reliability one.`,
    keyPoints: [
      'Toil is manual, repetitive, automatable work that scales with the service.',
      'Overhead and novel failures are not toil; routine pages are. The test is whether a machine could do it.',
      'Cap operational load — around half of the time — and treat breaching it as a signal.',
      'Measure toil in hours by cause, not in ticket counts; a few causes usually dominate.',
    ],
    related: ['self-healing', 'on-call', 'runbooks', 'slo-sli'],
  },
  {
    id: 'golden-signals',
    title: 'The four golden signals',
    category: 'operations',
    short: 'Latency, traffic, errors, saturation. If you measure four things, measure these.',
    body: `The Google SRE book proposes four signals as the minimum useful monitoring of any user-facing service, and the set has held up because each one catches failures the others miss.

Latency: how long requests take. Measure successful and failed requests separately — a fast error skews the average downward and hides an outage. Report percentiles, never the mean: the mean is dominated by the common case, and the complaint arrives from the tail. The tail reaches further than its name suggests — a page that makes twenty requests has roughly a one-in-five chance of meeting your p99, so a rare slow response is a common slow page.

Traffic: demand on the system, in whatever unit fits — requests per second, transactions, concurrent sessions. It is rarely an alert on its own, and it is the denominator for everything else and the first thing you check when another signal moves.

Errors: the rate of requests that failed. Include the silent ones — a 200 with the wrong body, a response that arrived after the client gave up. Ratios are what you alert on; raw counts move with traffic and produce noise at both ends of the day.

Saturation: how full the constrained resource is. Most systems degrade before they are full, so the useful threshold is well below 100%, and the leading indicator is often a queue depth rather than a utilisation figure.

Two sibling frameworks say much the same thing for different objects. RED — rate, errors, duration — is the request-centric version for services. USE — utilisation, saturation, errors — is the resource-centric version for machines, disks and queues. Use RED for what users touch, USE for what supports it, and the golden signals as the checklist that you have not left one out.`,
    keyPoints: [
      'Latency, traffic, errors and saturation cover most failure shapes for a service.',
      'Separate the latency of failures from successes, and use percentiles rather than means.',
      'Alert on error ratios, not counts; counts follow traffic.',
      'RED for services, USE for resources — the same idea from two directions.',
    ],
    related: ['observability', 'alerting', 'slo-sli', 'latency-budget'],
  },
  {
    id: 'postmortems',
    title: 'Blameless postmortems',
    category: 'operations',
    short: 'The outage already happened. The only remaining value is what you learn from it.',
    body: `A postmortem is the write-up after an incident: what happened, what the impact was, how it was detected, what was done, and what will change. It is worth the effort only if people describe what they actually did, and people describe what they actually did only when the exercise is genuinely blameless.

Blameless does not mean consequence-free or that nobody made a mistake. It means the analysis targets the system that allowed the mistake to cause an outage, because that is the part you can change. An engineer who ran a destructive command against production is a person who will not do it again; a system where that command was one keystroke away with no confirmation, no scoping and no undo will produce the same outage with a different name in it. The second is the actionable finding.

Write the timeline from evidence, not memory — deploy records, alert timestamps, chat logs — and include the detection and response gaps honestly. The interesting numbers are usually not how long the fix took but how long until anyone noticed, and how long until the right person was involved. Those gaps repeat across incidents in a way that root causes do not.

Resist the single root cause. Real incidents are several conditions coinciding: a latent bug, a config change, a retry policy, a dashboard that had been broken for a month. "Human error" is where an investigation stops, not where it concludes.

Actions are where most postmortems fail. Each one needs an owner, a priority, and a home in the same backlog as feature work — a list of good intentions attached to a document nobody reopens is the normal outcome. Two or three actions that get done beat fifteen that do not.

And make them readable and public within the organisation. The largest return on a postmortem comes from the team that has not had that outage yet.`,
    keyPoints: [
      'Blameless means analysing the system that let the error cause damage.',
      'Build the timeline from evidence; detection and escalation delays repeat more than causes do.',
      'There is rarely one root cause; "human error" is where analysis stops.',
      'Few actions, each with an owner and a place in the normal backlog.',
    ],
    related: ['incident-response', 'on-call', 'error-budgets', 'chaos-engineering'],
  },
  {
    id: 'on-call',
    title: 'On-call',
    category: 'operations',
    short: 'A rota is a design problem: paging load, coverage, handover and the authority to act.',
    body: `On-call is the arrangement that makes reliability real: somebody is responsible for responding when the system misbehaves out of hours. It is also, done badly, the most reliable way to burn out a team, so it deserves the same design attention as any other part of the system.

Paging load is the number that governs everything. Google's SRE practice puts the ceiling at two incidents per twelve-hour shift, derived from roughly six hours of investigation, remediation and write-up per incident — enough time to do each one properly. Well-run rotas are therefore quieter than people expect: a shift where the pager does not fire is the normal state rather than a lucky one, and a rota that routinely exceeds its ceiling is a defect either in the alerting or in the system.

Size the rota so the arrangement is humane. The same practice puts the floor at eight responders for a single-site rota, or six per site where two sites share the load; below that the frequency becomes punishing. A follow-the-sun arrangement across two or three sites removes night work altogether and is worth real effort where the organisation supports it. Compensate the time, explicitly and consistently.

Give the responder what they need to act: paging that reaches a human and escalates if it does not, one place that says which service is affected and who owns it, runbooks for the alerts that fire, dashboards that load quickly, and — most importantly — the authority to take action, including rolling back someone else's deploy, failing over, or waking a specialist. A responder who must ask permission is not on call, they are a notification relay.

Handover is where continuity is lost. A short written summary of what happened in the shift, what is still degraded, and what the next person should watch costs ten minutes and prevents the incident that gets rediscovered twice.

Feed it back. Every page in a week is either actionable and useful, or it is a defect to be fixed or deleted. A rota that never reduces its own load is a rota that will lose its people.`,
    keyPoints: [
      'At most two incidents in a twelve-hour shift; more means the alerting or the system is broken.',
      'Eight responders for a single site, or six per site across two — below that the rota stops being humane.',
      'Responders need authority to roll back, fail over and escalate without permission.',
      'Written handover prevents the same degradation being rediscovered twice.',
    ],
    related: ['alerting', 'incident-response', 'runbooks', 'toil'],
  },
  {
    id: 'runbooks',
    title: 'Runbooks',
    category: 'operations',
    short: 'What to check and what to do, written for someone tired who did not build this.',
    body: `A runbook is the operational documentation attached to an alert or a routine procedure. Its audience is specific: a competent engineer, half asleep, who did not write the service and is reading this on a phone at 3am. Everything about a good runbook follows from taking that audience seriously.

Structure that works: what this alert means in terms of user impact; how to confirm it is real; the three or four most likely causes with the check for each; the mitigations in order of preference, with the exact commands or links; how to verify recovery; and who to escalate to when the list runs out. Mitigation before diagnosis — stopping the bleeding is the first job, and the investigation can happen after traffic is being served.

Put commands in, in full, with the placeholders marked. "Scale the deployment" invites a mistake at 3am; the exact command with the namespace spelled out does not. Link to the dashboard rather than describing it. Where a step is dangerous, say what it will affect and what cannot be undone.

Runbooks rot faster than any other documentation because they describe a system that changes weekly. The countermeasures are keeping them beside the code so they are part of the change, linking them from the alert so they are read often enough for errors to be noticed, and updating them during the incident review while the gaps are obvious. Every step that turns out to be wrong at 3am is a finding.

The best runbook step is one you delete. If a procedure is mechanical and unambiguous, it is a candidate for automation — first as a script the responder runs, then as something the system does for itself. Runbooks are a staging area for automation, not a permanent home for repeated work.`,
    keyPoints: [
      'Write for a tired engineer who did not build the service.',
      'Mitigation before diagnosis: restore service, then investigate.',
      'Exact commands and dashboard links; describe what each dangerous step affects.',
      'Fix them during incident reviews, and delete steps by automating them.',
    ],
    related: ['alerting', 'on-call', 'incident-response', 'toil'],
  },
  {
    id: 'chaos-engineering',
    title: 'Chaos engineering',
    category: 'operations',
    short: 'Experiments on a real system to find the failures you did not design for, before they find you.',
    body: `Chaos engineering is not breaking things at random. It is experimentation: you state a hypothesis about steady-state behaviour, introduce a realistic fault, and see whether the hypothesis holds. "If one of the three availability zones becomes unreachable, error rate stays below 0.1% and p99 latency stays under 400ms" is a hypothesis. Either it survives contact with the experiment or you have learned something that would otherwise have been learned during an outage.

The method has four parts. Define steady state as a measurable output — the metrics you would actually judge health by. Hypothesise that it continues through the fault. Inject faults that mirror real events: instance loss, zone loss, dependency latency, dependency errors, DNS failure, certificate expiry, a full disk. Look for a difference in steady state between the part of the system under fault and the part that is not, and stop the experiment if user impact appears.

Start small and contained. One instance, in a non-production environment, during working hours, with everyone watching and an abort switch ready. Confidence and blast radius grow together: staging, then a small share of production traffic, then a zone. Running in production is the point eventually, because staging never has production's traffic, data volume or dependency behaviour — but not on day one.

Game days are the version that scales to people and process, and they often pay more. Announce a scenario, run it against a real environment, and observe everything: did the alert fire, did the runbook work, did the responder have access, did the failover complete, did anyone know who to call. Most organisations find their gaps in the response path rather than in the system.

Two prerequisites. Good observability, or you cannot tell what the experiment did. And a system that has already been designed for redundancy — running chaos against a known single point of failure teaches nothing except that it is a single point of failure.`,
    keyPoints: [
      'State a steady-state hypothesis first; an experiment without one is only an outage.',
      'Inject faults that resemble real events, and grow blast radius with confidence.',
      'Game days test the response path — where most organisations actually find gaps.',
      'It requires observability and an architecture that is supposed to survive the fault.',
    ],
    related: ['incident-response', 'blast-radius', 'redundancy', 'disaster-recovery'],
  },
  {
    id: 'load-testing',
    title: 'Load testing',
    category: 'operations',
    short: 'Find the knee in the curve on a Tuesday, not during the campaign.',
    body: `Capacity planning built from arithmetic tells you what you hope is true. A load test tells you what is. The purpose is to find where the system stops behaving linearly — the point where latency turns up sharply, errors begin, or a queue stops draining — and to know that number before demand does.

The shapes of test answer different questions. A load test holds expected peak and checks the system meets its objectives there. A stress test pushes past it to find the breaking point and, more importantly, the failure mode: graceful shedding and recovery, or a collapse that needs a restart. A soak test holds a moderate load for hours to expose leaks, log volume growth, connection pool exhaustion and disk fill. A spike test applies the sudden arrival that autoscaling cannot outrun.

One methodological trap dominates the rest. Most simple tools are closed-model: a fixed number of virtual users each waiting for a response before sending the next request. Real internet traffic is open-model — arrivals keep coming regardless of how you are coping. A closed-model test throttles itself exactly when the system slows down, which is precisely when you needed to see the queue grow. If your tool supports specifying an arrival rate rather than a concurrency, use it.

Be careful what you are measuring. Test against an environment with production-like data volume, because query plans change with table size. Use realistic cache behaviour — a test that hits one key has a 100% hit ratio and proves nothing. Generate load from outside your network so the path includes the load balancer and TLS. And separate client-side queueing from server latency; a saturated load generator reports its own bottleneck as yours.

Finish with a number and a plan. "We serve 4,000 requests per second with p99 under 300ms; at 5,200 the database connection pool saturates" is a capacity statement you can build an autoscaling policy, a rate limit and a budget around.`,
    keyPoints: [
      'The goal is the knee in the curve and the failure mode past it.',
      'Load, stress, soak and spike tests answer different questions.',
      'Prefer open-model arrival rates; closed-model tests throttle themselves as you slow.',
      'Production-like data and realistic cache behaviour, or the result is fiction.',
    ],
    related: ['capacity-planning', 'autoscaling', 'queueing-theory', 'load-shedding'],
  },
  {
    id: 'feature-flags',
    title: 'Feature flags',
    category: 'operations',
    short: 'Separate deploying code from releasing behaviour, and rollback stops needing a deploy.',
    body: `A feature flag is a runtime switch that decides whether a code path is active. The consequence is the valuable part: deployment and release become separate events. Code ships dark, is enabled for staff, then for 1% of users, then for everyone — and if it misbehaves, it is turned off in seconds without a pipeline, a build or a rollback.

That speed is the main reliability argument. A bad deploy costs a full pipeline run to undo, and often a database migration makes it impossible; a bad flag costs a toggle. It is the difference between a ten-minute incident and a ninety-minute one.

Flags come in kinds with different lifetimes, and conflating them is how the mess starts. Release flags exist to get a change out and should be removed within weeks. Experiment flags run a test and end with the experiment. Operational flags — kill switches for expensive features, degradation toggles — are the ones allowed to live indefinitely, though most should still be retired once the new behaviour has proved itself. Permission flags gate by plan or entitlement and belong to the product, not to engineering.

Flag debt is the standard failure. Every flag is a branch in the code and the number of combinations grows exponentially; a codebase with two hundred live flags cannot be reasoned about or tested. The fix is unglamorous: an expiry date on release flags, an owner, and a recurring task to delete the ones that are fully rolled out. Removing a flag is part of the feature, not an optional follow-up.

Two practical cautions. Evaluate flags with a default that is safe when the flag service is unreachable, and cache locally — a flag system in the request path is a new dependency with your own availability riding on it. And treat flag changes as production changes: audit who flipped what and when, because "nothing was deployed" is a sentence that has wasted many incident hours.`,
    keyPoints: [
      'Deploy and release become separate events; rollback becomes a toggle.',
      'Release, experiment, operational and permission flags have different lifetimes.',
      'Flag combinations grow exponentially — expire and delete release flags.',
      'Fail safe when the flag service is unreachable, and audit every flip as a change.',
    ],
    related: ['deployment-strategies', 'ci-cd', 'graceful-degradation', 'incident-response'],
  },
  {
    id: 'log-management',
    title: 'Logs at scale',
    category: 'operations',
    short: 'Ingestion and retention are the bill; structure and correlation are the value.',
    body: `Logs are the most detailed signal and the most expensive one, and both facts get discovered late. A system emitting a few hundred megabytes a day costs a few dollars a month and nobody notices; the same system with debug logging left on at ten times the traffic is a line item somebody asks about.

Structure first. JSON objects with consistent field names — timestamp, level, service, trace id, user or tenant id, message — turn a text search into a query. Grep over prose works until the volume passes the point where you cannot read the output, which arrives sooner than expected. The single highest-value field is the trace id, because it joins logs to traces and to the request a user complained about.

Control the volume deliberately rather than by accident. Sample: keep every error and warning, keep a fraction of successful requests. Set levels per component so one chatty library does not dominate. Drop health-check and readiness traffic, which is often the majority of lines and carries almost no information. Aggregate repeated events instead of emitting one line per item in a loop.

Retention should be tiered, because the questions have different time ranges. Recent logs in fast, searchable storage for days to weeks — that is where incident response happens. Older logs compressed in object storage for months or years, queryable slowly for audit and forensics. Paying hot-storage prices for a year of debug logs is a common and avoidable mistake, as is discovering during an investigation that the breach predates your retention window.

Two things that hurt later. Logs contain personal data — tokens, emails, payloads — unless you actively prevent it, and a log store is a data store with the same obligations for deletion, access control and encryption. And logs are evidence: if an attacker can delete them, they will. Forward to an account the workload's own identity cannot write to or erase.`,
    keyPoints: [
      'Structured JSON with a trace id on every line is what makes logs queryable.',
      'Sample successes, drop health checks, keep every error.',
      'Tier retention: days hot for incidents, months cold for audit.',
      'Redact personal data, and forward logs somewhere the workload cannot erase.',
    ],
    related: ['observability', 'distributed-tracing', 'audit-logging', 'cost-optimisation'],
  },
  {
    id: 'environments',
    title: 'Environments',
    category: 'operations',
    short: 'Staging is a hypothesis about production. Know exactly which parts of it are false.',
    body: `Most organisations have development, staging and production, and quietly rely on staging behaving like production. It does not: it has less data, less traffic, different concurrency, a smaller instance size, stubbed third parties and — often — a different network path. Every one of those differences is a class of bug that can only be found in production.

The useful discipline is to be specific about which differences are deliberate and which are accidents. Deliberate: less capacity, synthetic data, sandboxed payment providers. Accidental: a different TLS termination point, a missing WAF, a different database version, a config value that drifted a year ago. Accidental differences are where the surprises come from, and the fix is the same infrastructure definitions applied with different parameters rather than separately maintained stacks.

Ephemeral preview environments have changed the economics here. A pull request creates a full stack, seeded with a subset of data, running until the branch merges. Reviewers click rather than imagine; integration problems appear before merge; nobody queues for the shared staging environment. The two things that make it work are automation fast enough to be useful — minutes, not hours — and ruthless expiry, since forgotten environments are one of the most consistent sources of cloud waste and of unmonitored, unpatched attack surface.

Data is the hardest part and the place where organisations get into trouble. Copying production data into a lower environment copies the personal data, into a place with weaker access control and usually no audit trail. Use masked or synthetic data by default; where realistic data is genuinely required, treat that environment as production for access, logging and retention purposes.

Some things cannot be rehearsed anywhere but production: real traffic shape, real third-party behaviour, real data volume. That is the argument for progressive delivery — canaries and flags are how you test in production without betting everything on the hypothesis that staging was representative.`,
    keyPoints: [
      'Deliberate differences are fine; accidental drift between environments is where bugs hide.',
      'Build every environment from the same definitions with different parameters.',
      'Ephemeral preview environments need fast creation and ruthless expiry.',
      'Masked or synthetic data by default; realistic data makes it a production system.',
    ],
    related: ['ci-cd', 'deployment-strategies', 'infrastructure-as-code', 'developer-experience'],
  },
  {
    id: 'release-versioning',
    title: 'Artefacts and versioning',
    category: 'operations',
    short: 'You can only roll back to a version you can still identify and still fetch.',
    body: `The artefact — the container image, the package, the bundle — is the unit that moves through your pipeline, and how you name and store it decides how well you can reason about what is running.

Immutable, content-addressed identity is the foundation. A tag such as "latest" or a branch name is a mutable pointer: the image behind it today is not the image behind it last week, so "we deployed the same version" stops being a true statement and a rollback becomes a guess. Tag with the commit hash so a human can read what is running, and deploy by digest so the reference is content-addressed — a commit-hash tag is still a tag, repointable unless the registry enforces tag immutability, which several registries do not do by default. Kubernetes makes this concrete twice over: repushing a tag does not change the Pod spec, so nothing rolls out at all — and because every tag other than ":latest" defaults to pulling only when the image is absent, a Deployment can end up with a mix of Pods running the old and the new image, decided by which nodes had already cached the tag.

Semantic versioning is a communication protocol for consumers — major means it will break, minor means new capability, patch means a fix. It works for libraries and public APIs, where someone else chooses when to adopt. For internal services deployed continuously, a monotonic build identifier tied to a commit is usually more honest, because nobody is choosing when to upgrade.

Promote, do not rebuild. The artefact tested in staging must be the artefact deployed to production; rebuilding per environment means the thing you verified and the thing you shipped differ by whatever changed in between — a dependency resolved to a new version, a base image that moved. Configuration comes from the environment, not from the build.

Registries need a lifecycle policy from the start. Images accumulate quickly and storage costs follow; expire untagged images and old builds, but keep whatever your rollback window and your audit obligations require, which is longer than most policies assume. Retaining exactly the last three builds is a policy that fails on the morning you need the one from last month.

And know your provenance. For each running artefact you want to answer: which commit, which pipeline run, which dependencies, and signed by whom. That is the difference between a supply-chain incident you can scope in minutes and one that takes a week.`,
    keyPoints: [
      'Mutable tags make "what is running" unanswerable; a commit-hash tag helps, but only a digest is exact.',
      'SemVer is for consumers who choose when to upgrade; internal services need build identity.',
      'Promote one artefact through environments; never rebuild per environment.',
      'Expire images on a policy that still covers your rollback and audit window.',
    ],
    related: ['ci-cd', 'immutable-infrastructure', 'sbom-and-provenance', 'containers'],
  },
]
