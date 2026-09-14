import type { Concept } from '../types'

export const kubernetes: Concept[] = [
  {
    id: 'kubernetes-architecture',
    title: 'What Kubernetes actually is',
    category: 'kubernetes',
    short: 'A database of desired state, and controllers that work to make it true.',
    body: `Kubernetes is often described as a container orchestrator, which undersells it. It is a general-purpose reconciliation system: you write down what should be true, and controllers work continuously to make reality match.

The control plane has four parts. The API server is the only thing anything talks to — kubectl, controllers, kubelets, all of it goes through the API. etcd stores the state; it is the only stateful component and losing it means losing the cluster. The scheduler watches for Pods with no node assigned and picks one based on resource requests, affinity rules and constraints. The controller manager runs the control loops: the Deployment controller creates ReplicaSets, the ReplicaSet controller creates Pods, and dozens of others do the same for everything else.

On every worker node, the kubelet watches for Pods assigned to it and makes them exist, while kube-proxy programmes the networking rules that make Services work.

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
    related: ['kubernetes-architecture', 'declarative-vs-imperative', 'self-healing'],
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
    related: ['control-loop', 'immutable-infrastructure', 'ci-cd'],
  },
  {
    id: 'kubernetes-workloads',
    title: 'Deployments, StatefulSets, DaemonSets and Jobs',
    category: 'kubernetes',
    short: 'Four controllers for four genuinely different kinds of workload.',
    body: `A Deployment manages stateless, interchangeable replicas. Pods get random names, can be created and destroyed in any order, and any one can serve any request. This covers the large majority of application workloads.

A StatefulSet is for workloads where identity matters. Pods get stable, ordered names (db-0, db-1) and stable persistent storage that follows the name, and they are created and terminated in order. Databases and clustered systems that care which member is which need this. It is meaningfully harder to operate, so use it only when identity genuinely matters.

A DaemonSet runs exactly one Pod on every node, automatically including nodes added later. Log collectors, metrics agents, CNI plugins and storage drivers are DaemonSets.

A Job runs Pods until a specified number complete successfully, then stops. A CronJob creates Jobs on a schedule. Batch processing, migrations and scheduled maintenance.

Underneath all of them is the Pod: one or more containers sharing a network namespace and storage volumes. Containers in a Pod reach each other on localhost, which is what makes the sidecar pattern work — a proxy, a log shipper or a credential agent alongside your application.

The default instinct should be Deployment. Reach for the others when you can name the specific property you need.`,
    keyPoints: [
      'Deployment for stateless replicas — the default.',
      'StatefulSet for stable identity and per-Pod storage.',
      'DaemonSet for one Pod per node; Job and CronJob for work that finishes.',
      'Containers in a Pod share localhost, which is what enables sidecars.',
    ],
    related: ['pod-lifecycle', 'probes', 'kubernetes-scheduling', 'rolling-updates'],
  },
  {
    id: 'pod-lifecycle',
    title: 'The life and death of a Pod',
    category: 'kubernetes',
    short: 'Understanding termination is what stops your deploys dropping requests.',
    body: `Starting: the Pod is Pending until the scheduler finds a node with room. The kubelet pulls images (ImagePullBackOff if that fails), runs init containers to completion, then starts the main containers. The Pod is Running once containers have started, but it receives no traffic until its readiness probe passes.

Termination is the part that matters and the part people get wrong. When a Pod is deleted, two things happen *simultaneously*: it is removed from Service endpoints, and SIGTERM is sent to the containers. Those propagate at different speeds, so for a brief window the Pod may still receive requests after it has been told to shut down. This is why a preStop hook with a short sleep is a common and genuinely useful pattern — it gives endpoint removal time to propagate before the process starts refusing work.

Then the process has terminationGracePeriodSeconds (default 30) to finish in-flight requests and exit. If it has not exited by then, it gets SIGKILL and whatever it was doing is lost.

So an application that ignores SIGTERM drops requests on every single deploy, every scale-in, and every node drain. Handling it means: stop accepting new connections, finish the ones in flight, close resources, exit.

And the exit codes worth recognising: 137 is SIGKILL, almost always an OOM kill; 143 is SIGTERM handled normally.`,
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

A limit is a hard ceiling, and CPU and memory behave completely differently at it. CPU is compressible: exceed the limit and the kernel throttles you — stops scheduling the container until the next period. The symptom is latency spikes in a regular pattern with no obvious cause in your code. Memory is not compressible: exceed the limit and the container is OOM-killed immediately, exit code 137.

This asymmetry is why many experienced teams set memory requests and limits but deliberately set no CPU limit. Without a CPU limit, a Pod can use idle capacity on the node and the request still guarantees its fair share under contention. With one, you are throttled even when the node is idle. The counter-argument is predictability in multi-tenant clusters; both positions are defensible, and knowing why the debate exists is what matters.

Quality of Service follows from these. Guaranteed (requests equal limits for everything) is evicted last. Burstable is in the middle. BestEffort (no requests at all) is evicted first — which is why "we did not set resources" tends to mean "our Pods die first under pressure".`,
    keyPoints: [
      'Requests drive scheduling; limits drive enforcement.',
      'CPU limits throttle; memory limits kill. Very different consequences.',
      'Many teams set memory limits and no CPU limit, deliberately.',
      'No requests means BestEffort, which is evicted first.',
    ],
    related: ['kubernetes-scheduling', 'pod-lifecycle', 'capacity-planning'],
  },
  {
    id: 'kubernetes-scheduling',
    title: 'How Pods end up on nodes',
    category: 'kubernetes',
    short: 'Filter the nodes that could work, score the rest, pick the best.',
    body: `The scheduler runs two phases. Filtering removes nodes that cannot work: not enough allocatable CPU or memory for the Pod's requests, a taint the Pod does not tolerate, a node selector that does not match, a required affinity rule that fails. Scoring ranks what remains — spreading across zones, preferring nodes that already have the image, balancing utilisation — and the best node wins.

If no node survives filtering, the Pod stays Pending. ‘kubectl describe pod’ then tells you exactly why, one line per node, and it is usually "Insufficient cpu". That message is the single most useful diagnostic in Kubernetes and people often scroll past it.

The controls worth knowing. Node selectors and node affinity attract Pods to nodes with particular labels — GPU nodes, a specific instance family. Taints and tolerations do the opposite: a taint repels every Pod that does not explicitly tolerate it, which is how you dedicate nodes to particular workloads. Pod affinity and anti-affinity place Pods relative to other Pods; anti-affinity is what stops all your replicas landing on one node and looking redundant while they are not. Topology spread constraints are the modern, more expressive version and spread Pods evenly across zones or nodes.

And remember the two-loop structure: the scheduler only places Pods on existing nodes. If there is no room, the Pod waits for the cluster autoscaler to provision one — a process measured in minutes.`,
    keyPoints: [
      'Filter, then score. Pending means nothing survived filtering.',
      'describe pod names the exact reason, per node.',
      'Anti-affinity or topology spread stops replicas sharing a node.',
      'The scheduler places; the cluster autoscaler provisions. Different speeds.',
    ],
    related: ['resource-requests-limits', 'autoscaling', 'redundancy', 'availability-zones'],
  },
  {
    id: 'kubernetes-networking',
    title: 'Kubernetes networking',
    category: 'kubernetes',
    short: 'Every Pod gets an IP, every Pod can reach every other Pod — until you stop it.',
    body: `The model has four rules. Every Pod gets its own IP address. Pods can reach each other directly without NAT. Nodes can reach Pods. And containers within a Pod share a network namespace, so they talk over localhost.

The third consequence of rule two is a security problem: by default, every Pod in every namespace can reach every other Pod. Namespaces are an organisational boundary, not a network one, until a NetworkPolicy says otherwise.

Since Pod IPs change constantly, a Service provides a stable virtual address and DNS name, backed by an endpoints list of Pods currently passing their readiness probe. That connection between readiness and endpoints is the single most useful thing to know when debugging: ‘kubectl get endpoints’ empty means either your label selector matches nothing, or nothing is ready. Those are the two causes, and the first is a silent typo.

Above Services, an Ingress defines HTTP routing rules and an ingress controller implements them — usually one shared load balancer for many Services, rather than one cloud load balancer per Service at full price. Gateway API is the more capable successor and where new clusters should generally start.

DNS inside the cluster follows a predictable shape: service.namespace.svc.cluster.local, with shorter forms resolving within a namespace. And when a default-deny NetworkPolicy breaks everything mysteriously, it is because you blocked port 53.`,
    keyPoints: [
      'Every Pod has an IP and can reach every other Pod by default.',
      'Namespaces are not a network boundary; a NetworkPolicy is.',
      'Empty endpoints means a bad selector or failing readiness. Always check it first.',
      'A default-deny egress policy blocks DNS. Allow port 53 to kube-system.',
    ],
    related: ['service-discovery', 'network-segmentation', 'probes', 'kubernetes-architecture'],
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
]
