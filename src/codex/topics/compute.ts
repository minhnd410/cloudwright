import type { Concept } from '../types'

export const compute: Concept[] = [
  {
    id: 'compute-models',
    title: 'Choosing where your code runs',
    category: 'compute',
    short: 'Virtual machines, containers, or functions — a trade between control and operational load.',
    body: `Every compute option is the same trade in different proportions: how much of the stack you control versus how much you have to operate.

A virtual machine gives you everything above the hypervisor and makes all of it your responsibility — patching, hardening, the log-shipping agent, the process supervisor that restarts your app when it dies. Use it when you genuinely need that control: unusual kernel requirements, licensed software, a lift-and-shift migration.

Containers move the boundary up. You own the image; the platform owns the host. Managed container services (Fargate, Container Apps, Cloud Run) remove the host entirely, which eliminates an enormous amount of undifferentiated work. Kubernetes gives you far more control over scheduling and networking at the cost of a genuinely significant learning curve and an ongoing operational commitment.

Functions move it furthest. You own a handler; everything else is the platform's. Scaling is automatic and effectively instant, idle costs nothing, and the constraints are real: a hard execution ceiling, no local state between invocations, cold starts, and a concurrency model that can overwhelm anything downstream that was sized for a fixed fleet.

The honest default for most teams is managed containers. You keep a portable artefact, you stop patching hosts, and you avoid running a cluster until you have a reason to.`,
    keyPoints: [
      'The axis is control versus operational burden. Pick the least control you can live with.',
      'Managed containers are the sensible default for most new services.',
      'Kubernetes is worth it when you need its scheduling and networking model, not by default.',
      'Serverless scales faster than your database can accept connections. Cap it.',
    ],
    related: ['containers', 'serverless', 'kubernetes-architecture', 'cold-starts'],
  },
  {
    id: 'containers',
    title: 'Containers',
    category: 'compute',
    short: 'A process with its own filesystem view, shipped as one immutable artefact.',
    body: `A container is not a small virtual machine. It is an ordinary process on the host kernel, isolated by namespaces (its own view of the filesystem, network and process tree) and limited by cgroups (its share of CPU and memory). That is why containers start in milliseconds and a VM takes tens of seconds — there is no kernel to boot.

The practical value is the image: your code, its runtime and its dependencies, built once and bit-identical everywhere. "Works on my machine" becomes a much smaller category of problem. That same property is what makes supply-chain security matter, because whatever was in the base image ships with you.

The rules that keep containers well-behaved come from the same place. One process per container, so the platform's restart and health semantics mean something. Log to stdout, so the platform collects them. Configuration from the environment, so the same image runs in every environment. Handle SIGTERM, because that is how the platform asks you to stop, and ignoring it drops in-flight requests on every deploy.

And two security defaults that are one line each and almost always skipped: run as a non-root user, and mount the root filesystem read-only. A container escape from a root process is dramatically more useful to an attacker than one from an unprivileged user.`,
    keyPoints: [
      'Namespaces isolate; cgroups limit. There is no guest kernel.',
      'One process per container, logs to stdout, config from the environment.',
      'Handle SIGTERM or every deploy drops live requests.',
      'Run as non-root with a read-only root filesystem. Two lines, large payoff.',
    ],
    snippets: [{
      label: 'A production-shaped Dockerfile',
      lang: 'text',
      code: `# Multi-stage: build with the toolchain, ship without it
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build

FROM node:22-slim
# A real user, not root
RUN useradd -r -u 10001 app
WORKDIR /app
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/node_modules ./node_modules
USER 10001
# Exec form, so your process is PID 1 and receives SIGTERM directly
CMD ["node", "dist/server.js"]`,
    }],
    related: ['immutable-infrastructure', 'supply-chain-security', 'twelve-factor', 'pod-lifecycle'],
  },
  {
    id: 'serverless',
    title: 'Serverless',
    category: 'compute',
    short: 'No idle cost, no patching, and a set of constraints you have to design around.',
    body: `Serverless means the platform runs your code only when something invokes it, scales instances automatically, and bills per unit of execution. Idle costs nothing. There is no host to patch. For spiky, event-driven, or low-volume workloads the economics are excellent.

The constraints are what shape the design. Execution has a hard ceiling (fifteen minutes on most platforms), so long work becomes an asynchronous job with a status endpoint. There is no durable local state between invocations, so anything that must persist goes to a store. Cold starts add latency on the first request into a new environment. And concurrency scales far faster than a relational database can accept connections — an uncapped function in front of a modest database will exhaust it rather than serve more traffic.

Two habits fix most serverless performance problems. Initialise clients and connection pools outside the handler, so they are reused across warm invocations instead of recreated on every call. And tune memory, because CPU scales with it — raising memory often makes the function finish faster and cost the same or less, which is the cheapest optimisation in the entire model and almost nobody does it.

Cloud Run sits interestingly between serverless and containers: it scales to zero and bills per request, but one instance handles many concurrent requests, which makes it far cheaper than a per-request model for I/O-bound work.`,
    keyPoints: [
      'Hard timeout, no local state, cold starts, and concurrency that outruns your database.',
      'Initialise clients outside the handler; they are reused across warm invocations.',
      'CPU scales with memory. Tuning memory often lowers both latency and cost.',
      'Always set a concurrency cap when a relational database is downstream.',
    ],
    related: ['cold-starts', 'connection-pooling', 'event-driven', 'compute-models'],
  },
  {
    id: 'cold-starts',
    title: 'Cold starts',
    category: 'compute',
    short: 'The first request into a new instance pays for everything that has to be set up.',
    body: `When a platform needs a new execution environment it has to provision it, load your code, start the runtime, and run your initialisation before the first request is handled. That delay is a cold start, and it shows up as a p99 that looks nothing like your p50 — worst right after a deploy, after a quiet period, or at the leading edge of a traffic spike.

What you control: package size (less to download and load), what runs at initialisation (a heavy dependency graph or an eager connection is paid on every cold start), and runtime choice (interpreted and JIT-free runtimes generally start faster than JVM or .NET).

What the platform offers: provisioned or pre-warmed concurrency, which keeps environments initialised and ready. It works, and it means paying for idle capacity — the thing serverless was supposed to avoid. That is a reasonable trade for a user-facing login path and a waste for a nightly batch job.

The useful framing is that cold starts are a tail-latency problem, not an average problem. If your p50 is fine and your p99 is dreadful, look here first; and decide whether the p99 is on a path a user is waiting on.`,
    keyPoints: [
      'Cold starts inflate p99, not p50. Measure percentiles, not averages.',
      'Smaller packages and lighter initialisation shorten them.',
      'Provisioned concurrency removes them by paying for idle capacity.',
      'Acceptable for background work; often not for an interactive path.',
    ],
    related: ['serverless', 'latency-budget', 'capacity-planning'],
  },
  {
    id: 'immutable-infrastructure',
    title: 'Immutable infrastructure',
    category: 'compute',
    short: 'Replace instances instead of changing them, so what is running is always knowable.',
    body: `The mutable model patches servers in place: SSH in, apply the update, restart. Over time every machine drifts a little differently, and the fleet becomes a set of individuals nobody fully understands. Debugging becomes archaeology.

The immutable model never changes a running instance. To deploy, you build a new image and replace the old instances with new ones. Every machine of a given version is byte-identical, which means a problem reproduces reliably and a rollback is just deploying the previous image.

Three practices make it real. Build artefacts once and promote the same artefact through environments — rebuilding per environment defeats the point. Pin by digest rather than by mutable tag, so "which version is running" has a definite answer. And keep no state on the instance: logs stream out, sessions live in a shared store, uploads go to object storage.

The payoff shows up during incidents. "Roll back to the previous image" is a two-minute operation with a predictable outcome, which is worth more than almost any amount of pre-deployment testing.`,
    keyPoints: [
      'Never patch a running instance; replace it.',
      'Build once, promote the same artefact, pin by digest.',
      'No state on the instance — logs, sessions and uploads all go elsewhere.',
      'Rollback becomes a deploy of a known-good image.',
    ],
    related: ['containers', 'ci-cd', 'deployment-strategies', 'twelve-factor'],
  },
  {
    id: 'autoscaling',
    title: 'Autoscaling',
    category: 'compute',
    short: 'Capacity that follows demand — arriving a few minutes after you needed it.',
    body: `Autoscaling watches a metric and adjusts instance count to hold it near a target. It handles daily traffic waves beautifully and is much less useful against sudden spikes, because scaling is not instant: the metric has to breach, the controller has to react, an instance has to boot, and a health check has to pass. That is typically two to five minutes end to end, and a flash spike arrives in thirty seconds.

So autoscaling is a cost optimiser first and a resilience mechanism second. The thing that actually survives a spike is headroom — running at 60% rather than 90% — plus something that absorbs the excess, like a queue or a CDN.

Choose the metric deliberately. CPU is the default and is a lagging, indirect proxy. Requests per instance tracks demand directly. Queue depth is the right metric for workers, because it measures the backlog rather than a symptom of it.

And configure the asymmetry: scale up fast, scale down slowly. Aggressive scale-down removes capacity you are about to need again, which produces the oscillation people call flapping.

In Kubernetes this is two loops at two speeds. The Horizontal Pod Autoscaler asks for more Pods; if the cluster has no room, they sit Pending until the cluster autoscaler provisions a node. The slower loop determines whether you survive.`,
    keyPoints: [
      'Scaling takes minutes. Spikes take seconds. Headroom is what bridges the gap.',
      'Request rate or queue depth beats CPU as a scaling signal.',
      'Scale up quickly, scale down slowly.',
      'In Kubernetes, Pod scaling and node scaling are separate loops with different speeds.',
    ],
    related: ['capacity-planning', 'kubernetes-scheduling', 'backpressure', 'cost-optimisation'],
  },
  {
    id: 'capacity-planning',
    title: 'Capacity planning',
    category: 'compute',
    short: 'Find the bottleneck, then decide how much headroom to buy.',
    body: `Capacity is not one number. A system's throughput is set by its narrowest component, and adding capacity anywhere else changes nothing except the bill. Scaling a web tier that sits in front of a saturated database moves where requests are shed without serving one extra user — a result you can watch happen on this canvas.

So the work is: load test, find where latency starts climbing, add capacity there, and repeat. The bottleneck moves, which is the point.

Then choose a utilisation target, which is really a choice about latency. Queueing means latency rises non-linearly with utilisation: barely at all up to about 70%, noticeably by 85%, and steeply above 90%. Running "efficiently" at 95% means every small variation in traffic is a latency incident. Somewhere between 60% and 70% is the usual compromise for user-facing services.

Finally, plan for the failure case, not the happy one. If you run three zones and lose one, the remaining two absorb everything — so your steady-state target has to leave room for that. Capacity planned only for normal operation is capacity that fails exactly when it is tested.`,
    keyPoints: [
      'Throughput is set by the narrowest component. Everything else is spend.',
      'Latency climbs non-linearly above roughly 80% utilisation.',
      'Target 60–70% for user-facing services.',
      'Size so that losing one zone still leaves enough capacity.',
    ],
    related: ['autoscaling', 'latency-budget', 'availability-zones', 'backpressure'],
  },
  {
    id: 'twelve-factor',
    title: 'The twelve-factor habits worth keeping',
    category: 'compute',
    short: 'A short list of properties that make a service easy to run anywhere.',
    body: `The twelve-factor paper is from a different era but several of its rules have only become more relevant, because platforms now assume them.

Configuration comes from the environment, never from a file baked into the image. The same artefact then runs in every environment, which is what makes build-once-promote-everywhere possible.

Processes are stateless and share nothing. Anything that must persist goes to a backing service. This is what allows a platform to kill and restart your process freely, which every container scheduler does constantly.

Backing services are attached resources named by configuration. Swapping a local database for a managed one is a configuration change, not a code change.

Logs are an event stream written to stdout. Your application does not manage log files, rotation or shipping; the platform collects the stream.

Disposability: start fast and shut down gracefully on SIGTERM. Fast start makes scaling responsive; graceful shutdown means deploys and scale-in events do not drop requests.

Dev/prod parity: keep environments as similar as you can. Most incidents live in the gaps between them.`,
    keyPoints: [
      'Config from the environment; one artefact for every environment.',
      'Stateless processes; state lives in backing services.',
      'Log to stdout and let the platform handle collection.',
      'Start fast, and shut down cleanly on SIGTERM.',
    ],
    related: ['containers', 'immutable-infrastructure', 'secrets-management', 'observability'],
  },
  {
    id: 'event-driven',
    title: 'Event-driven architecture',
    category: 'compute',
    short: 'Publish what happened; let interested parties react on their own schedule.',
    body: `In a request-driven system, a service calls another and waits. In an event-driven one, a service publishes a fact — "order placed" — and whoever cares reacts later. The producer does not know or care who is listening.

The benefits are decoupling and absorption. Adding a new consumer requires no change to the producer. And a spike becomes a backlog rather than an outage, because the queue holds what the consumers cannot yet process.

The costs are real and worth naming. Debugging spans services and time, so distributed tracing stops being optional. Delivery is at-least-once on almost every platform, so consumers must be idempotent — processing the same message twice must be safe. Ordering is only guaranteed within a partition or a session, never globally. And eventual consistency becomes visible to users: the order exists, the confirmation email has not been sent yet, and the UI has to be honest about that.

The pragmatic pattern is to keep the synchronous path as small as possible — do the thing the user is waiting for, publish an event for everything else.`,
    keyPoints: [
      'Producers publish facts; consumers react independently.',
      'Queues convert spikes into backlogs instead of failures.',
      'Delivery is at-least-once: consumers must be idempotent.',
      'Ordering holds within a partition or session, not globally.',
    ],
    related: ['async-messaging', 'idempotency', 'event-streaming', 'distributed-tracing'],
  },
  {
    id: 'connection-pooling',
    title: 'Connection pooling',
    category: 'compute',
    short: 'Databases run out of connections long before they run out of CPU.',
    body: `Opening a database connection is expensive — a TCP handshake, a TLS handshake, authentication, session setup — and a database can only hold so many at once. On Postgres each connection is a process with its own memory, and the limit is derived from the instance's memory, so a small instance might accept only a few hundred.

A pool keeps a small set of connections open and hands them to requests as needed. Every application framework has one, and the default settings are usually fine for a fixed fleet.

The failure appears when compute scales faster than the database can accept connections. Fifty Lambda instances each holding a pool of ten is five hundred connections from something that used to be one server. The database starts rejecting connections while its CPU sits at 10%, which is a confusing symptom until you have seen it once.

Two fixes. A proxy — RDS Proxy, PgBouncer, the Cloud SQL connectors — multiplexes many client connections onto few real ones, and as a bonus holds connections open through a failover so the application does not see one. And cap concurrency on the compute side, so the fan-out cannot exceed what the database can survive.`,
    keyPoints: [
      'Connection count, not CPU, is usually the first database wall you hit.',
      'Postgres connection limits scale with instance memory.',
      'Serverless fan-out multiplies connections dramatically.',
      'A proxy plus a concurrency cap solves it from both ends.',
    ],
    related: ['serverless', 'acid-transactions', 'read-replicas', 'backpressure'],
  },
  {
    id: 'api-gateway-pattern',
    title: 'The API gateway pattern',
    category: 'compute',
    short: 'Put the cross-cutting concerns in one place instead of in every service.',
    body: `Authentication, rate limiting, request validation, API keys, CORS, usage plans — every service behind an API needs them, and implementing them in every service means implementing them slightly differently in every service.

A gateway does them once at the edge. Services behind it can assume the caller is already authenticated and within their quota. A JWT validated at the gateway means an invalid token never costs you a backend invocation. A throttle at the gateway means a flood never reaches your compute tier at all — which is the difference between rejecting requests cheaply and falling over expensively.

It also gives you a stable contract. The public API can stay the same while you split a service in two, change a language, or move something to a different compute model.

The risks are the usual ones for anything central. Too much logic in the gateway and it becomes a deployment bottleneck that every team queues behind. And it is a single point of failure by design, so it has to be the most boring, most redundant thing you run.

In Kubernetes the same role is played by an ingress controller or a service mesh gateway; the pattern is identical.`,
    keyPoints: [
      'Cross-cutting concerns belong at the edge, not duplicated per service.',
      'Rejecting an unauthorised or over-quota request at the gateway costs you nothing downstream.',
      'A stable public contract lets the services behind it change freely.',
      'Keep business logic out of it, or it becomes everyone\'s bottleneck.',
    ],
    related: ['rate-limiting', 'authn-vs-authz', 'kubernetes-networking', 'load-balancing'],
  },
]
