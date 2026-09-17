import type { Concept } from '../types'

export const kubernetes: Concept[] = [
  {
    id: 'kubernetes-architecture',
    title: 'What Kubernetes actually is',
    category: 'kubernetes',
    short: 'A database of desired state, and controllers that work to make it true.',
    body: `Kubernetes is often described as a container orchestrator, which undersells it. It is a general-purpose reconciliation system: you write down what should be true, and controllers work continuously to make reality match.

The control plane has four parts you will meet daily, plus a cloud controller manager wherever it runs on a cloud. The API server is the only thing anything talks to — kubectl, controllers, kubelets, all of it goes through the API. etcd stores the state; it is the only stateful component and losing it means losing the cluster. The scheduler watches for Pods with no node assigned and picks one based on resource requests, affinity rules and constraints. The controller manager runs the control loops: the Deployment controller creates ReplicaSets, the ReplicaSet controller creates Pods, and dozens of others do the same for everything else.

On every worker node, the kubelet watches for Pods assigned to it and makes them exist, while kube-proxy — or the CNI, where it has taken the job over — programmes the networking rules that make Services work.

The consequence people find surprising: when the control plane is unavailable, running Pods keep serving. What stops is change — no deploys, no scaling, no replacing a node that died. The control plane is the brain, not the heart.

Practically, this means the skill is describing desired state well. You never tell Kubernetes to start a container; you tell it how many should exist, and it notices when that is untrue.`,
    keyPoints: [
      'API server, etcd, scheduler, controller manager — plus kubelet on every node.',
      'Everything is a control loop comparing desired state to actual state.',
      'Running Pods survive a control plane outage; changes and self-healing do not.',
      'Losing etcd is losing the cluster. It is the one stateful component.',
    ],
    related: ['control-loop', 'declarative-vs-imperative', 'kubernetes-scheduling', 'kubernetes-networking'],
  },
  {
    id: 'control-loop',
    title: 'The control loop',
    category: 'kubernetes',
    short: 'Observe, compare, act — forever. This one idea explains most of Kubernetes.',
    body: `A controller watches a resource, compares desired state to observed state, and takes action to close the gap. Then it does it again. Forever.

The Deployment controller sees you want five replicas and the ReplicaSet has three, so it scales up. The node controller sees a node has stopped reporting and marks its Pods for rescheduling. The ingress controller sees a new Ingress and reconfigures a load balancer. Every one of them is the same loop.

Three properties follow, and they explain a lot of behaviour that otherwise looks odd. It is self-healing without anyone writing recovery code — delete a Pod and one reappears, because the loop simply notices the count is wrong. It is level-triggered rather than edge-triggered — it acts on current state rather than on events, so a missed event is not a permanent inconsistency; the next pass catches it. And it is eventually consistent — changes take time, and ‘kubectl apply’ returning is acknowledgement, not completion.

This is also the extension model. A custom resource definition adds a new object type, and an operator is just another controller reconciling it. That is how databases, certificates and cloud resources become Kubernetes-managed: the pattern generalises to anything with a desired state.

Once this clicks, Kubernetes stops feeling arbitrary.`,
    keyPoints: [
      'Observe, compare, act, repeat — every controller does this.',
      'Level-triggered, so missing an event is not permanent.',
      'apply returns acknowledgement, not completion.',
      'Operators are custom controllers; the pattern extends to anything.',
    ],
    related: ['kubernetes-architecture', 'declarative-vs-imperative', 'self-healing', 'operators-and-crds', 'gitops'],
  },
  {
    id: 'declarative-vs-imperative',
    title: 'Declarative versus imperative',
    category: 'kubernetes',
    short: 'Describe the destination, not the route.',
    body: `Imperative is a sequence of commands: create this, scale that, delete the other. It works, and it is fragile — if a step fails halfway you are in a state nobody described, and the commands only exist in someone's shell history.

Declarative is a description of the desired end state, committed to a repository. Apply it and the system works out what to change. Apply it again and nothing happens, because reality already matches — that idempotence is what makes it safe to run repeatedly and safe to automate.

The operational payoff is large. Your Git history becomes an audit log of every change to the system. Rollback is reverting a commit. Reviewing infrastructure changes uses the same process as reviewing code. And drift is detectable, because there is a canonical description to compare against.

This is what GitOps formalises: a controller in the cluster watches a repository and continuously reconciles the cluster toward it. Nobody needs production credentials to deploy — they open a pull request.

The same idea underlies Terraform, Bicep and CloudFormation for cloud resources. The discipline it demands is that you stop making changes by hand, because a manual change is drift that the next apply will silently revert — usually at the worst moment.`,
    keyPoints: [
      'Declarative configuration is idempotent, so re-applying is always safe.',
      'Git history becomes the audit log; rollback is a revert.',
      'GitOps means nobody needs production credentials to deploy.',
      'Manual changes are drift and will be reverted without warning.',
    ],
    related: ['control-loop', 'immutable-infrastructure', 'ci-cd', 'infrastructure-as-code'],
  },
  {
    id: 'kubernetes-workloads',
    title: 'Deployments, StatefulSets, DaemonSets and Jobs',
    category: 'kubernetes',
    short: 'Four controllers for four genuinely different kinds of workload.',
    body: `A Deployment manages stateless, interchangeable replicas. Pods get random names, can be created and destroyed in any order, and any one can serve any request. This covers the large majority of application workloads.

A StatefulSet is for workloads where identity matters. Pods get stable, ordered names (db-0, db-1) and stable persistent storage that follows the name, and they are created and terminated in order. Databases and clustered systems that care which member is which need this. It is meaningfully harder to operate, so use it only when identity genuinely matters.

A DaemonSet runs one Pod on every eligible node, automatically including nodes added later; a node selector or an untolerated taint narrows which nodes qualify. Log collectors, metrics agents, CNI plugins and storage drivers are DaemonSets.

A Job runs Pods until a specified number complete successfully, then stops. A CronJob creates Jobs on a schedule. Batch processing, migrations and scheduled maintenance.

Underneath all of them is the Pod: one or more containers sharing a network namespace and storage volumes. Containers in a Pod reach each other on localhost, which is what makes the sidecar pattern work — a proxy, a log shipper or a credential agent alongside your application.

The default instinct should be Deployment. Reach for the others when you can name the specific property you need.`,
    keyPoints: [
      'Deployment for stateless replicas — the default.',
      'StatefulSet for stable identity and per-Pod storage.',
      'DaemonSet for one Pod per node; Job and CronJob for work that finishes.',
      'Containers in a Pod share localhost, which is what enables sidecars.',
    ],
    related: ['pod-lifecycle', 'probes', 'kubernetes-scheduling', 'rolling-updates', 'stateful-workloads'],
  },
  {
    id: 'pod-lifecycle',
    title: 'The life and death of a Pod',
    category: 'kubernetes',
    short: 'Understanding termination is what stops your deploys dropping requests.',
    body: `Starting: the Pod is Pending until the scheduler finds a node with room. The kubelet pulls images (ImagePullBackOff if that fails), runs init containers to completion, then starts the main containers. The Pod is Running once containers have started, but it receives no traffic until its readiness probe passes.

Termination is the part that matters and the part people get wrong. When a Pod is deleted, two things happen *simultaneously*: it is removed from Service endpoints, and SIGTERM is sent to the containers. Those propagate at different speeds, so for a brief window the Pod may still receive requests after it has been told to shut down. This is why a preStop hook with a short sleep is a common and genuinely useful pattern — it gives endpoint removal time to propagate before the process starts refusing work.

The clock started when the Pod was deleted, so the preStop sleep and the shutdown share one terminationGracePeriodSeconds (default 30) — a ten-second sleep leaves the process twenty. If it has not exited by then, it gets SIGKILL and whatever it was doing is lost.

So an application that ignores SIGTERM drops requests on every single deploy, every scale-in, and every node drain. Handling it means: stop accepting new connections, finish the ones in flight, close resources, exit.

And the exit codes worth recognising: 137 is SIGKILL — an OOM kill, or a grace period that ran out, and the container's reason field tells you which; 143 is SIGTERM handled normally.`,
    keyPoints: [
      'Endpoint removal and SIGTERM happen at once and propagate at different speeds.',
      'A short preStop sleep closes that race.',
      'Ignoring SIGTERM drops requests on every deploy and every drain.',
      'Exit 137 = OOM kill. Exit 143 = terminated cleanly.',
    ],
    related: ['probes', 'rolling-updates', 'kubernetes-workloads', 'resource-requests-limits'],
  },
  {
    id: 'probes',
    title: 'Liveness, readiness and startup probes',
    category: 'kubernetes',
    short: 'Three probes, three consequences. Mixing them up causes outages.',
    widget: 'probe-simulator',
    body: `A liveness probe asks "is this container wedged?". Failing it restarts the container. It must be shallow — does the process respond at all — and must never check a dependency. The reason is worth stating plainly: if your liveness probe checks the database and the database blips, every replica fails liveness at the same moment, Kubernetes restarts all of them, and you have turned a degraded service into a dead one that cannot recover even after the database does.

A readiness probe asks "should this Pod receive traffic right now?". Failing it removes the Pod from Service endpoints without killing it. This one may legitimately check dependencies, because the consequence is proportionate — the Pod steps out of rotation and comes back when it can serve. It is also what makes rolling updates safe, since the rollout waits for readiness before continuing.

A startup probe covers slow starts. While it is running, liveness and readiness are suspended. This lets you allow generous time for a slow boot without permanently weakening the liveness probe — the alternative people reach for, which then fails to notice a genuinely hung process.

Getting these right is one of the highest-return configurations in Kubernetes, and getting them wrong is a well-worn path to a self-inflicted outage.`,
    keyPoints: [
      'Liveness restarts. Readiness removes from rotation. Startup suspends both while booting.',
      'A dependency check in a liveness probe causes cluster-wide restart loops.',
      'Readiness is what makes rolling updates safe.',
      'Use a startup probe rather than a lenient liveness probe.',
    ],
    snippets: [{
      label: 'The shape that works',
      lang: 'yaml',
      code: `# Shallow. "Is this process wedged?" Nothing else.
livenessProbe:
  httpGet: { path: /healthz, port: 8080 }
  periodSeconds: 10
  failureThreshold: 3

# May check dependencies — the consequence is proportionate.
readinessProbe:
  httpGet: { path: /ready, port: 8080 }
  periodSeconds: 5
  failureThreshold: 2

# Generous time to boot, without weakening liveness forever.
startupProbe:
  httpGet: { path: /healthz, port: 8080 }
  failureThreshold: 30
  periodSeconds: 5      # allows up to 150 seconds to start`,
    }],
    related: ['health-checks', 'pod-lifecycle', 'rolling-updates', 'self-healing'],
  },
  {
    id: 'resource-requests-limits',
    title: 'Requests and limits',
    category: 'kubernetes',
    short: 'Requests decide where a Pod goes. Limits decide what happens when it misbehaves.',
    body: `A request is what the scheduler reserves. It subtracts your request from a node's allocatable capacity when deciding whether the Pod fits. Set it too high and Pods sit Pending on a cluster with idle CPU; too low and Pods land on nodes that are already oversubscribed and contend for resources.

A limit is a hard ceiling, and CPU and memory behave completely differently at it. CPU is compressible: exceed the limit and the kernel throttles you — stops scheduling the container until the next period. The symptom is latency spikes in a regular pattern with no obvious cause in your code. Memory is not compressible: exceed the limit and the kernel kills the container when it next detects memory pressure — usually promptly, but reactively rather than at the instant you cross the line, which is why the restart often looks unrelated to the graph.

This asymmetry is why many experienced teams set memory requests and limits but deliberately set no CPU limit. Without a CPU limit, a Pod can use idle capacity on the node and the request still guarantees its fair share under contention. With one, you are throttled even when the node is idle. The counter-argument is predictability in multi-tenant clusters; both positions are defensible, and knowing why the debate exists is what matters.

Quality of Service follows from these. Guaranteed (requests equal limits for everything) is evicted last. Burstable is in the middle. BestEffort (no requests at all) is evicted first — which is why "we did not set resources" tends to mean "our Pods die first under pressure".`,
    keyPoints: [
      'Requests drive scheduling; limits drive enforcement.',
      'CPU limits throttle; memory limits kill. Very different consequences.',
      'Many teams set memory limits and no CPU limit, deliberately.',
      'Setting neither requests nor limits means BestEffort, which is evicted first.',
    ],
    related: ['kubernetes-scheduling', 'pod-lifecycle', 'capacity-planning'],
  },
  {
    id: 'kubernetes-scheduling',
    title: 'How Pods end up on nodes',
    category: 'kubernetes',
    short: 'Filter the nodes that could work, score the rest, pick the best.',
    body: `The scheduler runs two phases. Filtering removes nodes that cannot work: not enough allocatable CPU or memory for the Pod's requests, a taint the Pod does not tolerate, a node selector that does not match, a required affinity rule that fails. Scoring ranks what remains — spreading across zones, preferring nodes that already have the image, balancing utilisation — and the best node wins.

If no node survives filtering, the Pod stays Pending. ‘kubectl describe pod’ then tells you exactly why, as one FailedScheduling event tallying how many nodes each filter rejected — "0/12 nodes are available: 9 Insufficient cpu, 3 node(s) had untolerated taint". That message is the single most useful diagnostic in Kubernetes and people often scroll past it.

The controls worth knowing. Node selectors and node affinity attract Pods to nodes with particular labels — GPU nodes, a specific instance family. Taints and tolerations do the opposite: a taint repels every Pod that does not explicitly tolerate it, which is how you dedicate nodes to particular workloads. Pod affinity and anti-affinity place Pods relative to other Pods; anti-affinity is what stops all your replicas landing on one node and looking redundant while they are not. Topology spread constraints are the modern, more expressive version and spread Pods evenly across zones or nodes.

And remember the two-loop structure: the scheduler only places Pods on existing nodes. If there is no room, the Pod waits for the cluster autoscaler to provision one — a process measured in minutes.`,
    keyPoints: [
      'Filter, then score. Pending means nothing survived filtering.',
      'describe pod tallies the exact reason each filter rejected nodes.',
      'Anti-affinity or topology spread stops replicas sharing a node.',
      'The scheduler places; the cluster autoscaler provisions. Different speeds.',
    ],
    related: ['resource-requests-limits', 'autoscaling', 'redundancy', 'availability-zones', 'kubernetes-autoscaling', 'namespaces-and-quotas'],
  },
  {
    id: 'kubernetes-networking',
    title: 'Kubernetes networking',
    category: 'kubernetes',
    short: 'Every Pod gets an IP, every Pod can reach every other Pod — until you stop it.',
    body: `The model has four rules. Every Pod gets its own IP address. Pods can reach each other directly without NAT. Nodes can reach Pods. And containers within a Pod share a network namespace, so they talk over localhost.

The consequence of rule two is a security problem: by default, every Pod in every namespace can reach every other Pod. Namespaces are an organisational boundary, not a network one, until a NetworkPolicy says otherwise.

Since Pod IPs change constantly, a Service provides a stable virtual address and DNS name, backed by an endpoints list of Pods currently passing their readiness probe. That connection between readiness and endpoints is the single most useful thing to know when debugging: ‘kubectl get endpointslices’ returning nothing means either your label selector matches nothing, or nothing is ready — the older ‘kubectl get endpoints’ reaches an API deprecated since 1.33 and hides the terminating and serving conditions. Those are the two causes, and the first is a silent typo.

Above Services, an Ingress defines HTTP routing rules and an ingress controller implements them — usually one shared load balancer for many Services, rather than one cloud load balancer per Service at full price. Gateway API is the more capable successor and where new clusters should generally start.

DNS inside the cluster follows a predictable shape: service.namespace.svc.cluster.local, with shorter forms resolving within a namespace. And when a default-deny NetworkPolicy breaks everything mysteriously, it is because you blocked port 53.`,
    keyPoints: [
      'Every Pod has an IP and can reach every other Pod by default.',
      'Namespaces are not a network boundary; a NetworkPolicy is.',
      'Empty EndpointSlices mean a bad selector or failing readiness. Always check them first.',
      'A default-deny egress policy blocks DNS. Allow UDP and TCP port 53 to kube-system.',
    ],
    related: ['service-discovery', 'network-segmentation', 'probes', 'kubernetes-architecture', 'gateway-api', 'service-mesh'],
  },
  {
    id: 'service-discovery',
    title: 'Service discovery',
    category: 'kubernetes',
    short: 'Finding a healthy instance of something whose addresses keep changing.',
    body: `In a dynamic system, instances appear and disappear constantly, so hardcoding addresses does not work. Service discovery is how a caller finds a current, healthy instance of what it needs.

There are two broad approaches. Server-side discovery puts a load balancer or a Service in front: the caller connects to one stable address and something else picks the backend. This is what Kubernetes Services do, and it is simple because clients need no special logic. Client-side discovery has the caller query a registry and choose an instance itself, which allows smarter load balancing at the cost of a client library in every language you use.

Kubernetes does server-side discovery through DNS. A Service gets a name; kube-proxy or the CNI programmes rules so traffic to the Service address is distributed to the current endpoints. Endpoints are populated from readiness, so discovery and health checking are the same mechanism.

Outside Kubernetes the same job is done by cloud service discovery products, by Consul, or simply by a load balancer with a DNS record.

Two practical notes. DNS caching in some runtimes and language libraries will happily hold a resolved address well past its TTL, which produces connections to Pods that no longer exist — check your client's behaviour. And a service mesh moves discovery and load balancing into a sidecar, which gives you retries, circuit breaking and mutual TLS without changing application code.`,
    keyPoints: [
      'Server-side discovery keeps clients simple; client-side allows smarter balancing.',
      'In Kubernetes, endpoints come from readiness — discovery and health are one mechanism.',
      'Aggressive DNS caching in clients causes connections to dead Pods.',
      'A mesh moves discovery, retries and mTLS into a sidecar.',
    ],
    related: ['kubernetes-networking', 'load-balancing', 'probes', 'dns-resolution'],
  },
  {
    id: 'operators-and-crds',
    title: 'Operators and custom resources',
    category: 'kubernetes',
    short: 'Teach the cluster a new noun, then write the controller that makes it true.',
    body: `Kubernetes is a set of control loops over an API. Custom resource definitions let you add your own nouns to that API — a Database, a Tenant, a Certificate — and an operator is the controller that watches those objects and does whatever is required to make reality match them.

The value is that operational knowledge stops living in a runbook and starts living in code that runs continuously. The cert-manager operator notices a Certificate object, requests one from the issuer, stores it in a Secret and renews it before expiry, forever, without anyone remembering. A database operator handles provisioning, failover, backup and version upgrade in the same way. Anything a competent operator would do on a schedule is a candidate.

Writing one is more subtle than it looks, and three properties matter. Reconciliation must be idempotent and level-triggered: the loop is given the current desired state and the current actual state, and must converge — not react to a stream of events, because events are lost, duplicated and reordered. It must be safe to interrupt at any point, since the process will be killed mid-operation eventually. And it must report status honestly on the object, because the status field is the only thing a user or an automation has to go on.

Practical guidance that saves pain later. Version your CRDs from the beginning, because changing the schema of a resource that other teams' manifests depend on is a migration. Use finalisers for cleanup that must happen before deletion, and make sure they cannot deadlock — a finaliser whose controller is gone leaves objects that cannot be deleted. Limit the operator's RBAC to the resources it manages; an operator with cluster-admin is a privilege escalation path from anyone who can create its custom resources.

The judgement call is whether you need one. An operator is a distributed system you now maintain. If the task is "run this job weekly", a CronJob is enough. Operators pay off when the thing being managed has real state and a lifecycle — and when the alternative is a human following a document.`,
    keyPoints: [
      'A CRD adds a noun to the API; the operator is the loop that makes it real.',
      'Reconcile from current state, idempotently — never from an event stream.',
      'Version CRDs early and keep finalisers from deadlocking on a removed controller.',
      'An operator is a distributed system; a CronJob is often the honest answer.',
    ],
    related: ['control-loop', 'declarative-vs-imperative', 'kubernetes-architecture', 'stateful-workloads'],
  },
  {
    id: 'kubernetes-autoscaling',
    title: 'Autoscaling in Kubernetes',
    category: 'kubernetes',
    short: 'Five autoscalers at two layers: more Pods, bigger Pods, and the nodes to put them on.',
    body: `Scaling a Kubernetes workload happens at two layers, and confusing them is the usual source of frustration. Pod autoscaling changes how many replicas exist. Node autoscaling changes how much machine there is to run them on. Neither helps if the other is missing: Pods that cannot be scheduled stay Pending, and empty nodes cost money.

The Horizontal Pod Autoscaler adds and removes replicas based on a metric — CPU by default, or any custom or external metric. It is the right default for stateless request-serving workloads. Two details decide whether it behaves: the target must be a resource the workload actually saturates (CPU is meaningless for an IO-bound service, where concurrency or queue depth is the real signal), and requests must be set sensibly, since CPU targets are a percentage of the request.

The Vertical Pod Autoscaler adjusts the requests themselves, which is a different job: right-sizing rather than scaling. It is most useful in recommendation mode, feeding real numbers into what people would otherwise guess. Running it in automatic mode alongside an HPA on the same CPU metric makes the two fight, and resizing used to mean restarting Pods — in-place Pod resize became stable in Kubernetes 1.35, and the VPA can now patch a running Pod where the resize is feasible and fall back to eviction where it is not.

KEDA scales on events rather than resource usage — queue length, stream lag, database rows, scheduled time — and, crucially, can scale to zero. For a consumer that is idle most of the day and must drain a backlog quickly when one appears, it fits where a CPU-based HPA does not: by the time CPU rises, the queue is already deep.

At the node layer, the Cluster Autoscaler grows and shrinks existing node groups; Karpenter (and the equivalent managed offerings) instead provisions individual nodes chosen to fit the pending Pods, which makes it faster and better at consolidating underused nodes onto fewer, cheaper instances. Either way, the constraint is the same: scaling out takes as long as a node takes to become ready, so keep headroom — or pre-provisioned spare capacity — for anything faster than that.`,
    keyPoints: [
      'HPA scales replicas, VPA scales requests, KEDA scales on events, node autoscalers supply capacity.',
      'Pick a metric the workload actually saturates; CPU is wrong for IO-bound services.',
      'KEDA scales to zero and reacts to backlog before resource usage moves.',
      'Node provisioning takes minutes — keep headroom for anything faster.',
    ],
    related: ['autoscaling', 'resource-requests-limits', 'kubernetes-scheduling', 'capacity-planning'],
  },
  {
    id: 'gateway-api',
    title: 'Ingress and the Gateway API',
    category: 'kubernetes',
    short: 'The replacement for Ingress, with roles separated and the vendor annotations gone.',
    body: `Ingress was the original way to get HTTP traffic into a cluster, and its limitations became well known: it only really covers HTTP, everything beyond basic path and host routing lives in implementation-specific annotations, and a single Ingress resource mixes concerns that belong to different people — TLS and listener configuration, which is infrastructure, alongside routing rules, which belong to the application team.

The Gateway API is the successor, and it is role-oriented by design. GatewayClass describes an implementation, and is an infrastructure concern. A Gateway is an instance of it with listeners, addresses and certificates, owned by whoever runs the cluster. Routes — HTTPRoute, GRPCRoute, TLSRoute, TCPRoute and UDPRoute — are owned by application teams and attach to a Gateway, subject to rules the Gateway owner sets about which namespaces may attach. That separation is the practical reason to adopt it: an application team can change its routing without touching shared listener configuration, and cluster operators can delegate safely.

Capability follows. Header-based matching, traffic splitting by weight (which is what makes canary deployments expressible without annotations), request and response header manipulation, timeouts and cross-namespace references with an explicit ReferenceGrant are part of the specification rather than a vendor extension; retries are specified too, but remain in the experimental channel. The same manifests work across conformant implementations, which is a genuine change from the annotation era.

The API reached GA in 2023 and has moved features from the experimental channel into the standard one steadily since: TLSRoute and ReferenceGrant in v1.5, TCPRoute and UDPRoute in v1.6, which also gave new experimental resources their own API group so the boundary is visible in the manifest. It is implemented by Istio, Envoy Gateway, NGINX Gateway Fabric, Traefik, Cilium and the managed offerings of the major clouds, though each supports a different subset — check the conformance profile rather than assuming.

For new clusters, start here. For existing ones, note that ingress-nginx reached end of life in March 2026 — the repository is archived and receives no further security patches — so anyone still running it is running unpatched software. Ingress resources themselves continue to work; migration is per-route rather than all at once, and both can serve traffic side by side during the move.`,
    keyPoints: [
      'Gateway API separates infrastructure (Gateway) from application routing (Routes).',
      'Traffic splitting, header matching and timeouts are specified, not vendor annotations.',
      'Cross-namespace attachment is explicit, so delegation is safe.',
      'Implementations vary — check conformance, and migrate route by route; ingress-nginx is now end of life.',
    ],
    related: ['kubernetes-networking', 'load-balancing', 'deployment-strategies', 'tls-termination'],
  },
  {
    id: 'admission-control',
    title: 'Admission control',
    category: 'kubernetes',
    short: 'The last place to say no before an object is written to the cluster.',
    body: `Every request to the Kubernetes API is authenticated, authorised, and then passed through admission control before it is persisted. Admission is where "you may create Pods" becomes "but not privileged ones, not from that registry, and not without resource limits". RBAC answers who may act on what; admission answers what the object is allowed to contain.

There are two kinds, and the order matters. Mutating admission runs first and can change the object — injecting a sidecar, adding default labels, filling in a missing resource request. Validating admission runs after and can only accept or reject. The sequencing is why a policy that validates something a mutation is supposed to add will behave correctly, and why two controllers mutating the same field is a source of confusing bugs.

In practice most teams use a policy engine rather than writing webhooks: Kyverno, which expresses policies as Kubernetes resources and can validate, mutate and generate; or Gatekeeper, which brings Open Policy Agent and Rego. Kubernetes also ships built-in options — Pod Security Admission, which enforces the privileged, baseline and restricted standards per namespace with one label per mode, and the CEL admission policies, ValidatingAdmissionPolicy (stable since 1.30) and MutatingAdmissionPolicy (stable since 1.36), which evaluate inside the API server with no webhook to operate. Start with the built-ins; they cover a surprising amount and have no availability implications.

That last point is the operational trap. A webhook with failurePolicy: Fail that becomes unavailable will reject the API requests it intercepts — and if it intercepts broadly, that is a cluster that can no longer schedule anything, including the Pods that would restore the webhook. Scope webhooks narrowly with namespace and object selectors, exclude system namespaces, run the webhook with multiple replicas, and be deliberate about the failure policy: fail closed for genuine security controls, fail open for conveniences.

Run every new policy in audit mode first. The gap between the cluster you think you have and the cluster you have is discovered here, cheaply, rather than by blocking a deploy at an inconvenient moment.`,
    keyPoints: [
      'Admission decides what an object may contain, after RBAC decides who may act.',
      'Mutating webhooks run before validating ones; two mutators on one field is a bug source.',
      'Prefer built-in Pod Security Admission and CEL policies before operating webhooks.',
      'A broadly scoped failing-closed webhook can make a cluster unable to schedule anything.',
    ],
    related: ['policy-as-code', 'rbac', 'kubernetes-architecture', 'least-privilege'],
  },
  {
    id: 'stateful-workloads',
    title: 'State in Kubernetes',
    category: 'kubernetes',
    short: 'Stable identity, attached volumes, and the question of whether the database belongs here at all.',
    body: `A Deployment treats its Pods as interchangeable: any replica can be replaced by another with a different name and no storage. Databases, queues and consensus members are not interchangeable — they have identity, they have data on disk, and they often care about start-up order.

A StatefulSet provides what they need. Stable network identity (pod-0, pod-1, addressable through a headless Service), stable storage (each Pod keeps its own PersistentVolumeClaim across restarts and rescheduling), and ordered, controlled rollout and scale-down. That combination is what allows a replicated database to know which member it is and to find its own data again after a restart.

Storage brings its own constraints, and the zone one catches people repeatedly. A typical cloud block volume exists in a single availability zone, so a Pod bound to it can only be scheduled in that zone — lose the zone and the Pod cannot start elsewhere, because its data is not there. The scheduler understands this through volume topology, but the implication for availability is architectural: zone-redundant storage, or replication between members in different zones, is what actually survives, not the StatefulSet by itself. Set the reclaim policy deliberately, since a StorageClass that deletes volumes when claims are removed will do exactly that.

Deleting a StatefulSet does not delete its PersistentVolumeClaims by default, which is a deliberate safety choice and a common source of surprise costs; orphaned volumes accumulate quietly. Since Kubernetes 1.32 the persistentVolumeClaimRetentionPolicy field makes the choice explicit — whenDeleted and whenScaled, each set to Retain or Delete — so decide it when you write the manifest rather than discovering it on a bill.

The bigger question is whether to run stateful systems on Kubernetes at all. Modern operators for PostgreSQL, Kafka and others are genuinely capable, and there are good reasons — one control plane, portability, cost. But a managed database gives you failover, backups, patching and a support contract, and the team running the cluster usually is not also a database team. The reasonable default is to run stateless workloads on Kubernetes and keep the primary datastore managed, until you have a specific reason and the expertise to do otherwise.`,
    keyPoints: [
      'StatefulSets give stable identity, per-Pod storage and ordered rollout.',
      'Block volumes are zone-bound: a Pod follows its data, and losing the zone strands it.',
      'PersistentVolumeClaims outlive the StatefulSet — orphaned volumes accumulate.',
      'Managed databases remain the sensible default unless you have the expertise and a reason.',
    ],
    related: ['kubernetes-workloads', 'block-vs-object-storage', 'availability-zones', 'operators-and-crds'],
  },
  {
    id: 'namespaces-and-quotas',
    title: 'Namespaces, quotas and fair sharing',
    category: 'kubernetes',
    short: 'A shared cluster needs boundaries, or the first team to misconfigure something takes the rest with it.',
    body: `A namespace is the basic unit of separation inside a cluster: a scope for names, a target for RBAC, a boundary for network policy, and the object a quota attaches to. It is not a security boundary on its own — namespaces share the node kernel, the control plane and, by default, the network — but it is the hook that every other control hangs from.

ResourceQuota caps what a namespace may consume in aggregate: total CPU and memory requests and limits, the number of Pods, PersistentVolumeClaims, Services of type LoadBalancer. Without it, one team's runaway deployment consumes the cluster and every other team's Pods stop being schedulable. Note the interaction that catches people: once a quota on CPU or memory exists, every Pod in that namespace must specify either a request or a limit for that resource, or the control plane rejects it — unless a LimitRange supplies the default on its behalf.

LimitRange fills the other half by supplying defaults and bounds per object — a default request for containers that specify none, and a ceiling on what any single Pod may ask for. Together they stop both the death by a thousand unbounded Pods and the single Pod requesting the entire cluster.

Scheduling fairness needs one more piece. PriorityClass decides what happens when the cluster is full: high-priority Pods can preempt lower-priority ones. Used well, it keeps critical workloads schedulable while batch work yields. Used carelessly — every team declaring itself high priority — it degenerates into the same free-for-all with extra configuration.

Where isolation must be stronger than "cooperating teams", namespaces are not enough. A hostile tenant, a regulatory boundary or a workload running untrusted code needs separate node pools with taints, network policies that default to deny, a hardened runtime such as gVisor or Kata, or a separate cluster entirely. The honest guidance is that soft multi-tenancy inside a cluster works for teams in the same organisation; anything adversarial belongs on its own control plane.`,
    keyPoints: [
      'Namespaces scope names, RBAC, network policy and quota — but do not isolate the kernel.',
      'ResourceQuota prevents one team consuming the cluster; adding it makes requests mandatory unless a LimitRange defaults them.',
      'LimitRange supplies defaults and ceilings so unbounded Pods cannot exist.',
      'Adversarial or regulated tenants need separate node pools or separate clusters.',
    ],
    related: ['multi-tenancy', 'resource-requests-limits', 'kubernetes-scheduling', 'rbac'],
  },
  {
    id: 'cluster-upgrades',
    title: 'Cluster upgrades',
    category: 'kubernetes',
    short: 'Kubernetes moves three times a year, and a cluster left behind becomes an unsupported cluster.',
    body: `Kubernetes releases roughly three minor versions a year, and upstream patch support covers about the last three — around fourteen months of support for any given release. Managed offerings track this with their own windows and will eventually upgrade a cluster whether you have planned it or not, sometimes with extended support at a premium in between. Upgrading is therefore not a project you can decline; the only choice is whether it is routine or an emergency.

The sequence is fixed: control plane first, then nodes, and never more than one minor version at a time. The version skew policy lets the kubelet run up to three minor versions behind the API server, which is what makes the staged approach safe. The control plane itself cannot skip a minor, so a cluster three versions behind is three sequential control plane upgrades — though the nodes can be rolled once at the end rather than three times.

API deprecations are what actually break things, and they break at apply time rather than at upgrade time. A removed API version means manifests that worked last month are rejected, and the affected manifests are frequently not yours — they are in a Helm chart, an operator, or an admission webhook installed a year ago. Run the deprecation detectors against your manifests and your running objects before the upgrade, and check every add-on's compatibility matrix: CNI, CSI drivers, ingress controller, service mesh and metrics components are the usual casualties.

Node upgrades are a rolling replacement, which makes them a live test of everything you believe about workload resilience. PodDisruptionBudgets are what stop the drain taking every replica of a service at once — and a badly specified budget, such as minAvailable equal to the replica count, blocks the drain entirely and stalls the upgrade. Pods without a controller, or with long terminationGracePeriodSeconds, will make the process slow in ways that are worth discovering in a test cluster.

The organisational answer is cadence. Upgrade on a schedule, in a non-production cluster first, with a habit of staying within one version of current. Teams that upgrade quarterly find small problems; teams that upgrade when forced find all of them at once.`,
    keyPoints: [
      'Roughly three releases a year and about fourteen months of upstream patch support.',
      'Control plane first, one minor at a time; nodes may lag by up to three and can be rolled once at the end.',
      'Removed APIs break add-ons and charts more often than your own manifests.',
      'Node drains test your PodDisruptionBudgets; a bad budget stalls the upgrade entirely.',
    ],
    related: ['kubernetes-architecture', 'rolling-updates', 'kubernetes-workloads', 'environments'],
  },
  {
    id: 'service-mesh',
    title: 'Service mesh',
    category: 'kubernetes',
    short: 'Move retries, mTLS and traffic policy out of every service and into the network layer.',
    body: `In a system of many services, a set of concerns repeats in every one of them: mutual TLS between peers, retries and timeouts, circuit breaking, traffic splitting for canaries, and consistent request metrics. Implementing those in each service means a library per language, a different version everywhere, and a policy change that takes a quarter to roll out. A service mesh moves them into the infrastructure, where they are configured once and applied uniformly.

Mechanically, a proxy intercepts traffic for each workload and a control plane configures those proxies. The classic arrangement is a sidecar container in every Pod, which is uniform and language-agnostic but costs memory and CPU per Pod and adds a hop on both sides of every call. Newer designs reduce that overhead: Istio's ambient mode moves the layer 4 work — mutual TLS, authorisation, telemetry — to a per-node ztunnel, with an optional waypoint proxy, usually one per namespace, for the layer 7 features; Cilium keeps layer 3 and 4 in eBPF in the kernel and shares a single per-node Envoy for layer 7 rather than giving every Pod its own.

The strongest single argument for adopting one is mutual TLS with automatic certificate rotation for every service-to-service call, which is otherwise a substantial engineering programme. Identity-based authorisation policies — this service may call that endpoint — follow from the same certificates, and are what makes zero-trust networking practical inside a cluster. Uniform golden-signal metrics for every call, without touching application code, is the other benefit teams notice immediately.

The cost is real complexity: a control plane to run and upgrade, proxies in the request path of everything, and a new place for failures to originate. Debugging becomes harder before it becomes easier, because the first mesh-related incident is always confusing. Mesh upgrades touch every workload.

The reasonable threshold: adopt when you have enough services that the per-service alternative is genuinely worse, and when you have a specific requirement — mTLS everywhere, per-service authorisation, traffic shifting — rather than as a default. A handful of services are better served by a library and an ingress controller.`,
    keyPoints: [
      'A mesh moves mTLS, retries, timeouts and traffic policy into the infrastructure.',
      'Sidecars are uniform but costly; per-node designs such as ambient and eBPF cut the overhead.',
      'Automatic mTLS and identity-based authorisation are the strongest reasons to adopt.',
      'It adds a control plane and a proxy to every request path — have a specific requirement first.',
    ],
    related: ['mtls', 'kubernetes-networking', 'zero-trust', 'circuit-breaker'],
  },
]
