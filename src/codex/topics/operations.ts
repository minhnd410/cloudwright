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

The test of whether you have it: during the last incident, did you find the cause by querying, or by guessing and redeploying?`,
    keyPoints: [
      'Metrics say that something changed; logs say what; traces say where.',
      'Structured logs plus a trace id on every line is the highest-leverage habit.',
      'High-cardinality metric labels are what make the bill explode.',
      'Sample successes, keep every error.',
    ],
    related: ['distributed-tracing', 'alerting', 'slo-sli', 'incident-response'],
  },
  {
    id: 'alerting',
    title: 'Alerting',
    category: 'operations',
    short: 'Every page should mean something. A noisy pager is a muted pager.',
    body: `The failure mode is not too few alerts, it is too many. A pager that fires several times a night for things nobody needs to act on stops being read, and then the one that mattered is missed too. Alert fatigue is a real and measurable cause of long incidents.

The principle: page on symptoms, not causes. High CPU is a cause and might mean nothing. A climbing error rate on checkout is a symptom, and it always means something. If an alert fires and the right response is "acknowledge and go back to sleep", it should not have been a page.

Burn-rate alerting on an SLO is the cleanest version of this. Consuming your error budget 14 times faster than sustainable is a page; 1.5 times faster over a day is a ticket. Two alerts replace a wall of thresholds, and both are actionable by construction.

Practical mechanics that reduce noise substantially. Require several consecutive bad periods before firing, so a single noisy minute does not page. Be deliberate about missing data — an alarm that goes to "insufficient data" when the service dies completely is an alarm that stays silent during the worst outage. Group related alerts so one incident produces one page. And give every alert a runbook link, because an alert nobody knows how to respond to is just anxiety.

Review alerts regularly: which fired, which were actionable, which were ignored. Delete the rest.`,
    keyPoints: [
      'Page on user-visible symptoms; leave causes on dashboards.',
      'If the response is "acknowledge and ignore", it is not a page.',
      'Handle missing data deliberately or you go silent during total failure.',
      'Every alert needs a runbook; review and delete the noisy ones.',
    ],
    related: ['slo-sli', 'error-budgets', 'observability', 'incident-response'],
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
    related: ['deployment-strategies', 'dora-metrics', 'supply-chain-security', 'immutable-infrastructure'],
  },
  {
    id: 'cost-optimisation',
    title: 'Cost optimisation',
    category: 'operations',
    short: 'Most cloud waste is idle capacity, forgotten resources, and data movement.',
    body: `Cloud bills grow through accumulation rather than through any single decision, and the big line items are consistent across organisations.

Idle and oversized resources. Instances sized for a peak that never comes, non-production environments running at nights and weekends, volumes attached to nothing. The fix is right-sizing from actual utilisation and scheduled shutdown for non-production — often the single largest saving available and nearly free to implement.

Commitment discounts. Savings plans, reserved instances and committed use discounts cut compute costs by 30–70% for load you will run anyway. GCP's sustained-use discounts apply automatically with no commitment at all.

Data transfer. Egress to the internet, and cross-zone and cross-region traffic, are frequently a top-three line item and almost always invisible until someone looks. Keeping traffic in-zone where possible, using free gateway endpoints for object storage, and serving through a CDN (where origin-to-CDN transfer is often free) address most of it.

Storage lifecycle. Old objects on hot storage, snapshots nobody will restore, log groups with no retention policy, incomplete multipart uploads that are invisible in the console and billed forever.

Two habits make it durable: tag everything so cost is attributable to a team or product, and set budget alerts so a runaway is caught in hours rather than at the end of the month. Cost is an architectural property — a design that costs ten times more for the same outcome is a worse design.`,
    keyPoints: [
      'Right-sizing and non-production schedules are the biggest easy wins.',
      'Commitment discounts pay for load you were going to run anyway.',
      'Data transfer is usually a bigger line item than anyone expects.',
      'Tag for attribution and set budget alerts; find it in hours, not months.',
    ],
    related: ['capacity-planning', 'nat-vs-igw', 'private-connectivity', 'object-storage'],
  },
]
