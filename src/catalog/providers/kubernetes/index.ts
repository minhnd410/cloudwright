import type { ResourceDef } from '../../schema/types'
import { inPort, outPort, TELEMETRY_OUT, TIER_NOTE } from '../../schema/presets'

const cluster: ResourceDef = {
  id: 'k8s.cluster',
  provider: 'kubernetes',
  name: 'Kubernetes Cluster',
  short: 'Cluster',
  archetype: 'k8s-cluster',
  category: 'kubernetes',
  icon: 'k8s',
  tagline: 'A control plane that continuously reconciles reality with intent',
  description:
    'Kubernetes is a control loop. You declare what should exist — five replicas of this image, reachable on this name — and controllers work continuously to make reality match. Nothing is imperative: you never tell it to start a container, you tell it how many should exist and it notices when that is untrue. Understanding that single idea explains almost every behaviour that otherwise looks strange.',
  container: {
    accepts: ['k8s-nodepool', 'k8s-workload', 'k8s-service', 'k8s-ingress', 'k8s-config', 'autoscaler', 'firewall', 'service-mesh'],
    label: 'Drop node pools and workloads inside',
    size: { width: 820, height: 520 },
    padding: 30,
  },
  ports: [
    inPort('api', 'API server', ['http'], { position: 'top' }),
    TELEMETRY_OUT,
  ],
  props: [
    {
      key: 'distribution',
      label: 'Distribution',
      type: 'select',
      default: 'eks',
      help: 'Who runs the control plane.',
      impact:
        'Managed control planes remove the hardest operational work — etcd, certificates, upgrades of the API server. What differs is the defaults: EKS gives you almost nothing pre-installed, GKE Autopilot manages the nodes as well, AKS sits between them.',
      affects: ['cost', 'availability'],
      options: [
        { value: 'eks', label: 'Amazon EKS', note: '$0.10/hr control plane, you bring the add-ons' },
        { value: 'aks', label: 'Azure AKS', note: 'Free control plane on the standard tier' },
        { value: 'gke', label: 'Google GKE', note: '$0.10/hr after one free zonal cluster' },
        { value: 'gke-autopilot', label: 'GKE Autopilot', note: 'Nodes managed for you, billed per Pod' },
        { value: 'self', label: 'Self-managed', note: 'You own etcd. Think carefully.' },
      ],
    },
    {
      key: 'version',
      label: 'Version',
      type: 'select',
      default: 'current',
      help: 'How current your Kubernetes version is.',
      impact:
        'Kubernetes releases roughly three times a year and each version is supported for about fourteen months. Fall behind and upgrades stop being routine: you cannot skip minor versions, so catching up means several sequential upgrades, each with its own deprecated-API surprises.',
      affects: ['security', 'availability'],
      options: [
        { value: 'current', label: 'Current (n)', note: 'Latest supported' },
        { value: 'n-1', label: 'One behind (n-1)', note: 'The sensible place to sit' },
        { value: 'eol', label: 'End of life', note: 'No security patches' },
      ],
      danger: (v) => (v === 'eol' ? 'An unsupported Kubernetes version receives no security patches, and upgrading later means several sequential jumps.' : null),
    },
    {
      key: 'privateEndpoint',
      label: 'Private API endpoint',
      type: 'boolean',
      default: false,
      help: 'Restricts the Kubernetes API server to your network instead of publishing it to the internet.',
      impact:
        'A public API endpoint is a credential-stuffing target and the front door to your whole cluster. Private endpoints mean administration happens through a bastion or VPN, which is more friction and considerably safer.',
      affects: ['security'],
      danger: (v) => (v === false ? 'The Kubernetes API server is reachable from the internet. It is authenticated, but it is also constantly probed.' : null),
    },
    {
      key: 'rbac',
      label: 'RBAC posture',
      type: 'select',
      default: 'scoped',
      help: 'How permissions are granted to users and workloads inside the cluster.',
      impact:
        'cluster-admin handed out freely means one compromised CI token owns everything. Namespace-scoped roles contain a compromise to one team\'s workloads — which is the entire point of namespaces.',
      affects: ['security'],
      options: [
        { value: 'cluster-admin', label: 'cluster-admin for everyone', note: 'No containment at all' },
        { value: 'scoped', label: 'Namespace-scoped roles', note: 'Least privilege' },
      ],
      danger: (v) => (v === 'cluster-admin' ? 'Everyone has cluster-admin. Any compromised credential owns every workload and secret in the cluster.' : null),
    },
  ],
  sim: {
    availability: 0.9995,
    mitigates: { 'lateral-movement': 0.2 },
    failureModes: [
      { id: 'etcd', label: 'etcd degraded', symptom: 'API calls become slow or time out; nothing new schedules, though running Pods keep serving.', remedy: 'The control plane is the brain, not the heart. Existing workloads survive a control plane outage — deploys and self-healing do not.' },
      { id: 'version-skew', label: 'Deprecated API removed by an upgrade', symptom: 'Manifests that applied yesterday are rejected after the upgrade.', remedy: 'Run the deprecation checks before upgrading, and never skip a minor version.' },
    ],
  },
  cost: {
    hourly: (p) => (p.distribution === 'aks' ? 0 : 0.1),
    note: `Control plane only. Worker nodes are billed separately and are almost always the larger number. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'Create a cluster',
        lang: 'bash',
        code: `# EKS
eksctl create cluster --name prod --region us-east-1 \\
  --nodegroup-name workers --node-type m5.large \\
  --nodes 3 --nodes-min 3 --nodes-max 10 --managed

# AKS
az aks create -g prod-rg -n prod --node-count 3 \\
  --enable-cluster-autoscaler --min-count 3 --max-count 10 \\
  --network-plugin azure --enable-managed-identity

# GKE
gcloud container clusters create-auto prod --region us-central1`,
      },
      {
        label: 'First things to check',
        lang: 'bash',
        code: `kubectl get nodes -o wide           # are they Ready, and what versions?
kubectl get pods -A                 # anything CrashLoopBackOff or Pending?
kubectl top nodes                   # actual usage vs capacity
kubectl get events -A --sort-by=.lastTimestamp | tail -30
kubectl auth can-i --list           # what can this credential actually do?`,
      },
    ],
    docs: [{ label: 'Kubernetes concepts', url: 'https://kubernetes.io/docs/concepts/' }],
    gotchas: [
      'Existing Pods keep running when the control plane is unavailable. What stops is scheduling, scaling and self-healing — so a node failure during a control plane outage is not repaired.',
      'You cannot skip minor versions when upgrading. Falling three behind means three sequential upgrades.',
      'A managed control plane does not manage your add-ons. CNI, CoreDNS, ingress controller and CSI drivers are all yours to keep current.',
    ],
  },
  concepts: ['kubernetes-architecture', 'declarative-vs-imperative', 'control-loop', 'rbac'],
  keywords: ['kubernetes', 'k8s', 'cluster', 'eks', 'aks', 'gke', 'control plane'],
}

const nodepool: ResourceDef = {
  id: 'k8s.nodepool',
  provider: 'kubernetes',
  name: 'Node Pool',
  short: 'Node Pool',
  archetype: 'k8s-nodepool',
  category: 'kubernetes',
  icon: 'servers',
  tagline: 'The actual machines your Pods land on',
  description:
    'A group of identically configured worker nodes. Pods are scheduled onto nodes based on their resource requests, so a node pool is really a pool of allocatable CPU and memory. The number that catches people out is how much of each node the system already consumes: the kubelet, the container runtime, the OS and the reserved eviction threshold typically claim a noticeable slice before any of your workloads get a share.',
  wantsContainer: ['k8s-cluster'],
  container: {
    accepts: ['k8s-workload'],
    label: 'Pods scheduled here',
    size: { width: 360, height: 220 },
    padding: 22,
  },
  ports: [inPort('schedule', 'Scheduling', ['schedule'], { position: 'top' })],
  props: [
    {
      key: 'nodeSize',
      label: 'Node size',
      type: 'select',
      default: 'medium',
      help: 'CPU and memory per node.',
      impact:
        'Few large nodes pack efficiently and waste less on system overhead, but losing one takes a bigger share of your capacity with it. Many small nodes spread risk and waste more. There is also a hard cap of 110 Pods per node by default, which small workloads hit before they run out of CPU.',
      affects: ['capacity', 'cost', 'availability'],
      options: [
        { value: 'small', label: '2 vCPU / 8 GB', meta: { cpu: 2, memGb: 8, hourly: 0.096 } },
        { value: 'medium', label: '4 vCPU / 16 GB', meta: { cpu: 4, memGb: 16, hourly: 0.192 } },
        { value: 'large', label: '8 vCPU / 32 GB', meta: { cpu: 8, memGb: 32, hourly: 0.384 } },
      ],
    },
    {
      key: 'nodeCount',
      label: 'Nodes',
      type: 'number',
      default: 3,
      min: 1,
      max: 100,
      help: 'How many nodes are in the pool.',
      impact: 'Total schedulable capacity. Spread across zones, this is also what decides whether losing a zone costs you a third of your capacity or all of it.',
      affects: ['capacity', 'cost', 'availability'],
    },
    {
      key: 'spot',
      label: 'Spot / preemptible nodes',
      type: 'boolean',
      default: false,
      help: 'Uses spare provider capacity at a large discount, reclaimed on short notice.',
      impact:
        'Up to 90% cheaper, and the provider can take a node back with about two minutes of warning. Perfectly good for stateless workloads with a PodDisruptionBudget and graceful shutdown; a bad idea for anything that cannot be interrupted.',
      affects: ['cost', 'availability'],
    },
    {
      key: 'spreadZones',
      label: 'Spread across zones',
      type: 'boolean',
      default: true,
      help: 'Distributes nodes over multiple availability zones.',
      impact: 'Without this the entire pool is in one zone, and a zone outage takes every Pod with it regardless of how many replicas you set.',
      affects: ['availability'],
      danger: (v) => (v === false ? 'All nodes in a single zone. Replica count offers no protection against losing that zone.' : null),
    },
    {
      key: 'autoscale',
      label: 'Cluster autoscaler',
      type: 'boolean',
      default: true,
      help: 'Adds nodes when Pods cannot be scheduled and removes nodes that are underused.',
      impact:
        'Note the trigger: it reacts to *unschedulable Pods*, not to CPU. A Pod sits Pending, the autoscaler notices, a node boots and joins — typically a couple of minutes end to end. That delay is why the Horizontal Pod Autoscaler alone cannot save you if there is no room to put the new Pods.',
      affects: ['capacity', 'cost'],
    },
  ],
  sim: {
    capacity: 4000,
    availability: 0.995,
    failureModes: [
      { id: 'pending-pods', label: 'Pods stuck Pending', symptom: 'kubectl describe pod shows "0/3 nodes are available: Insufficient cpu".', remedy: 'The cluster has no room. Add nodes, lower the Pod\'s requests, or wait for the cluster autoscaler — which needs a couple of minutes.' },
      { id: 'spot-reclaim', label: 'Spot node reclaimed', symptom: 'Nodes disappear with roughly two minutes of notice and Pods are rescheduled elsewhere.', remedy: 'Set a PodDisruptionBudget, handle SIGTERM properly, and keep a baseline of on-demand nodes for critical workloads.' },
      { id: 'node-pressure', label: 'Node under memory pressure', symptom: 'The kubelet starts evicting Pods; BestEffort Pods go first.', remedy: 'Set memory requests and limits. Pods with requests equal to limits are evicted last.' },
    ],
  },
  cost: {
    hourly: (p) => {
      const base = { small: 0.096, medium: 0.192, large: 0.384 }[String(p.nodeSize)] ?? 0.192
      return base * Number(p.nodeCount ?? 1) * (p.spot ? 0.3 : 1)
    },
    note: `Worker nodes are usually the dominant Kubernetes cost. ${TIER_NOTE}`,
  },
  setup: {
    snippets: [
      {
        label: 'Where did the capacity go?',
        lang: 'bash',
        code: `# Allocatable is always less than capacity: the kubelet, the runtime,
# the OS and the eviction threshold are all reserved before your Pods.
kubectl describe node ip-10-0-1-23 | sed -n '/Capacity/,/Allocated/p'

# What is actually requested vs what exists
kubectl describe node ip-10-0-1-23 | grep -A6 'Allocated resources'

# Why is this Pod not scheduling?
kubectl describe pod web-7d9f -n prod | tail -20`,
      },
    ],
    gotchas: [
      'Allocatable is meaningfully smaller than the node\'s total capacity. Sizing a node pool from raw vCPU numbers always over-estimates what you get.',
      'The default limit is 110 Pods per node. With AWS VPC CNI the real limit is often lower still, set by how many IP addresses the instance type can hold.',
      'The cluster autoscaler reacts to Pending Pods, not to load. It is a floor-raiser, not a spike absorber — the Horizontal Pod Autoscaler asks for Pods, and the cluster autoscaler then finds somewhere to put them.',
    ],
    docs: [{ label: 'Node allocatable', url: 'https://kubernetes.io/docs/tasks/administer-cluster/reserve-compute-resources/' }],
  },
  concepts: ['kubernetes-scheduling', 'resource-requests-limits', 'autoscaling', 'availability-zones'],
  keywords: ['node', 'nodepool', 'worker', 'spot', 'karpenter'],
}

const deployment: ResourceDef = {
  id: 'k8s.deployment',
  provider: 'kubernetes',
  name: 'Deployment',
  short: 'Deployment',
  archetype: 'k8s-workload',
  category: 'kubernetes',
  icon: 'pods',
  tagline: 'Declare how many Pods should exist, and Kubernetes keeps it true',
  description:
    'A Deployment manages a ReplicaSet, which manages Pods. You declare the desired replica count and the Pod template; controllers make it so, replace Pods that die, and roll out template changes gradually. Almost everything that goes wrong with a Deployment comes down to two things: what you asked for in resources, and whether your probes tell the truth.',
  wantsContainer: ['k8s-nodepool', 'k8s-cluster'],
  ports: [
    inPort('in', 'Traffic from Service', ['http', 'grpc', 'tcp']),
    outPort('out', 'Outbound calls', ['http', 'grpc', 'sql', 'nosql', 'cache', 'queue', 'stream', 'object', 'search']),
    inPort('config', 'Config, secrets & deploys', ['secret', 'identity', 'image', 'deploy'], { position: 'top' }),
    TELEMETRY_OUT,
  ],
  props: [
    {
      key: 'replicas',
      label: 'Replicas',
      type: 'number',
      default: 3,
      min: 0,
      max: 100,
      help: 'How many Pods should be running.',
      impact:
        'One replica means every rollout, node drain and eviction is downtime. Two is the minimum that survives anything. Three lets you lose one and still have redundancy while it recovers.',
      affects: ['capacity', 'availability', 'cost'],
      danger: (v) => (Number(v) < 2 ? 'A single replica means every rollout, node drain or eviction is a gap in service.' : null),
    },
    {
      key: 'cpuRequest',
      label: 'CPU request',
      type: 'number',
      default: 250,
      min: 10,
      max: 8000,
      step: 10,
      unit: 'm',
      help: 'The CPU the scheduler reserves for this Pod. 1000m is one core.',
      impact:
        'Requests are how the scheduler decides where a Pod fits — this number is what it subtracts from a node\'s allocatable capacity. Set it too high and Pods sit Pending on a cluster with plenty of idle CPU; too low and Pods land on nodes that are already oversubscribed and fight for cycles.',
      affects: ['capacity', 'cost', 'latency'],
    },
    {
      key: 'cpuLimit',
      label: 'CPU limit',
      type: 'number',
      default: 0,
      min: 0,
      max: 8000,
      step: 10,
      unit: 'm',
      help: 'A hard ceiling on CPU. Zero means no limit.',
      impact:
        'A CPU limit is enforced by throttling: when the container hits it, the kernel simply stops scheduling it until the next period, which shows up as latency spikes with no obvious cause. Many teams deliberately set CPU requests and no CPU limit, letting Pods use idle capacity — memory is where the hard limit matters.',
      affects: ['latency', 'capacity'],
      advanced: true,
    },
    {
      key: 'memRequest',
      label: 'Memory request',
      type: 'number',
      default: 512,
      min: 16,
      max: 32768,
      step: 16,
      unit: ' Mi',
      help: 'Memory reserved for scheduling.',
      impact: 'Memory cannot be compressed the way CPU can. When a node runs short, the kubelet evicts Pods — and Pods using less than their request are evicted last.',
      affects: ['capacity', 'cost'],
    },
    {
      key: 'memLimit',
      label: 'Memory limit',
      type: 'number',
      default: 1024,
      min: 16,
      max: 32768,
      step: 16,
      unit: ' Mi',
      help: 'The hard memory ceiling. Exceed it and the container is killed.',
      impact:
        'This one is absolute: cross the limit and the kernel OOM-kills the container immediately, producing a restart and exit code 137. A memory limit set too close to real usage turns a mild traffic increase into a CrashLoopBackOff.',
      affects: ['availability'],
    },
    {
      key: 'livenessProbe',
      label: 'Liveness probe',
      type: 'select',
      default: 'http',
      help: 'How Kubernetes decides a container is broken and should be restarted.',
      impact:
        'A failing liveness probe restarts the container. That is a big hammer: if the probe checks a dependency, an outage in that dependency makes Kubernetes restart every one of your Pods in a loop, turning a degraded service into a dead one. Liveness should only ask "is this process wedged".',
      affects: ['availability'],
      options: [
        { value: 'none', label: 'None', note: 'A hung process is never noticed' },
        { value: 'http', label: 'HTTP GET /healthz', note: 'Shallow — the right kind' },
        { value: 'deep', label: 'HTTP check including dependencies', note: 'Dangerous' },
      ],
      danger: (v) => {
        if (v === 'deep') return 'A liveness probe that checks dependencies restarts every Pod when a dependency fails, converting a degraded service into an outage.'
        if (v === 'none') return 'No liveness probe. A deadlocked process keeps receiving traffic forever.'
        return null
      },
    },
    {
      key: 'readinessProbe',
      label: 'Readiness probe',
      type: 'boolean',
      default: true,
      help: 'Decides whether this Pod should receive traffic right now.',
      impact:
        'This is the probe that matters for rollouts. A failing readiness probe removes the Pod from the Service endpoints without killing it — so a Pod that is still warming up, or temporarily overloaded, stops receiving requests instead of failing them. Without it, traffic reaches Pods before they can serve it.',
      affects: ['availability'],
      danger: (v) => (v === false ? 'No readiness probe: Pods receive traffic the instant they start, before the application can serve it.' : null),
    },
    {
      key: 'pdb',
      label: 'PodDisruptionBudget',
      type: 'boolean',
      default: false,
      help: 'The minimum number of Pods that must stay available during voluntary disruptions.',
      impact:
        'Stops a node drain or a cluster upgrade from taking down all your replicas at once. Without one, draining a node evicts whatever is on it immediately — and if your Pods happened to be co-located, that is all of them.',
      affects: ['availability'],
    },
    {
      key: 'antiAffinity',
      label: 'Pod anti-affinity',
      type: 'boolean',
      default: false,
      help: 'Asks the scheduler to spread replicas across different nodes or zones.',
      impact:
        'Without it, nothing stops all three replicas from landing on the same node. They look redundant in kubectl and they are not — losing that node loses everything.',
      affects: ['availability'],
    },
    {
      key: 'runAsNonRoot',
      label: 'Run as non-root',
      type: 'boolean',
      default: true,
      help: 'Refuses to start a container whose image runs as UID 0.',
      impact: 'A container escape from a root process is dramatically more useful to an attacker than one from an unprivileged user. This is one line of YAML.',
      affects: ['security'],
      danger: (v) => (v === false ? 'Containers running as root. A container escape starts with root on the node.' : null),
    },
  ],
  sim: {
    capacity: 300,
    latencyMs: 12,
    availability: 0.99,
    demandsSchedulingSlots: 1,
    vulnerableTo: ['supply-chain', 'lateral-movement', 'privilege-escalation'],
    failureModes: [
      { id: 'crashloop', label: 'CrashLoopBackOff', symptom: 'Pods restart repeatedly with increasing back-off between attempts.', remedy: 'kubectl logs --previous shows why it died last time. Exit 137 is an OOM kill; exit 1 is usually configuration.' },
      { id: 'oomkill', label: 'OOMKilled', symptom: 'Container terminated with reason OOMKilled and exit code 137.', remedy: 'Raise the memory limit or fix the leak. Memory limits are hard ceilings, not guidance.' },
      { id: 'throttling', label: 'CPU throttling', symptom: 'Latency spikes in a regular pattern; container_cpu_cfs_throttled_seconds is climbing.', remedy: 'Raise or remove the CPU limit. The container is being stopped by the kernel, not by anything in your code.' },
      { id: 'imagepull', label: 'ImagePullBackOff', symptom: 'Pods never start; events show a failure pulling the image.', remedy: 'Check the image name and tag, the registry credentials in imagePullSecrets, and whether the nodes can reach the registry at all.' },
      { id: 'pending', label: 'Pending — insufficient resources', symptom: 'Pods stay Pending; describe shows "Insufficient cpu" or "Insufficient memory".', remedy: 'Requests exceed what any node has free. Lower the requests or add nodes.' },
    ],
  },
  cost: { note: 'Pods do not bill directly — the nodes they occupy do. Requests are what actually consume purchased capacity.' },
  setup: {
    snippets: [
      {
        label: 'A Deployment with the parts that matter',
        lang: 'yaml',
        code: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: prod
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0   # never drop below the desired count
      maxSurge: 1         # add one new Pod at a time
  selector:
    matchLabels: { app: web }
  template:
    metadata:
      labels: { app: web }
    spec:
      # Without this, all three replicas may land on one node.
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels: { app: web }
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: web
          image: registry.example.com/web@sha256:abc123...
          ports: [{ containerPort: 8080 }]
          resources:
            requests: { cpu: 250m, memory: 512Mi }
            limits:   { memory: 1Gi }   # memory limit yes, CPU limit deliberately not
          # Shallow: "is this process wedged?" — nothing about dependencies.
          livenessProbe:
            httpGet: { path: /healthz, port: 8080 }
            periodSeconds: 10
            failureThreshold: 3
          # "Should I get traffic right now?" — this one may check dependencies.
          readinessProbe:
            httpGet: { path: /ready, port: 8080 }
            periodSeconds: 5
            failureThreshold: 2
          # Gives a slow starter time without a lenient liveness probe.
          startupProbe:
            httpGet: { path: /healthz, port: 8080 }
            failureThreshold: 30
            periodSeconds: 5
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: ["ALL"] }
      # Let in-flight requests finish before the process is killed.
      terminationGracePeriodSeconds: 45`,
      },
      {
        label: 'PodDisruptionBudget',
        lang: 'yaml',
        code: `apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web
spec:
  minAvailable: 2          # or maxUnavailable: 1
  selector:
    matchLabels: { app: web }

# Without this, "kubectl drain" during a node upgrade can evict
# every replica at once if they happen to share a node.`,
      },
      {
        label: 'Debugging a broken Pod',
        lang: 'bash',
        code: `kubectl get pods -n prod -l app=web
kubectl describe pod web-7d9f -n prod        # events are at the bottom — read them first
kubectl logs web-7d9f -n prod --previous     # why it died on the LAST attempt
kubectl get events -n prod --sort-by=.lastTimestamp | tail -20

# Exit code 137 = SIGKILL, almost always an OOM kill
kubectl get pod web-7d9f -n prod -o jsonpath='{.status.containerStatuses[0].lastState}'

# Is it being CPU throttled?
kubectl top pod web-7d9f -n prod --containers

# Get a shell without a shell in the image
kubectl debug -it web-7d9f -n prod --image=busybox --target=web`,
      },
    ],
    docs: [
      { label: 'Deployments', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/' },
      { label: 'Configure probes', url: 'https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/' },
    ],
    gotchas: [
      'Liveness and readiness answer different questions. Liveness: "should this container be restarted?" Readiness: "should this Pod get traffic?" Using a dependency check for liveness turns a downstream outage into a cluster-wide restart loop.',
      'Set maxUnavailable to 0 for user-facing services. The default rolling update will otherwise take Pods out before replacements are ready.',
      'Requests decide scheduling; limits decide enforcement. A Pod with no requests is BestEffort and is the first thing evicted when a node runs short.',
      'Handle SIGTERM. Kubernetes sends it, waits for the grace period, then sends SIGKILL. An application that ignores SIGTERM drops every in-flight request on every rollout.',
    ],
  },
  concepts: ['kubernetes-workloads', 'probes', 'resource-requests-limits', 'pod-lifecycle', 'rolling-updates'],
  keywords: ['deployment', 'pod', 'replicaset', 'workload', 'container'],
}

const service: ResourceDef = {
  id: 'k8s.service',
  provider: 'kubernetes',
  name: 'Service',
  short: 'Service',
  archetype: 'k8s-service',
  category: 'kubernetes',
  icon: 'network',
  tagline: 'A stable name in front of Pods that keep changing',
  description:
    'Pods are ephemeral and their IP addresses change constantly. A Service provides one stable virtual address and DNS name, and keeps a list of the Pods currently ready to serve — the endpoints. The readiness probe is what populates that list, which is why readiness and Services are really one topic: a Pod that is not ready is not in the Service, and therefore receives nothing.',
  wantsContainer: ['k8s-cluster'],
  ports: [
    inPort('in', 'Requests', ['http', 'grpc', 'tcp']),
    outPort('out', 'To Pods', ['http', 'grpc', 'tcp']),
  ],
  props: [
    {
      key: 'serviceType',
      label: 'Service type',
      type: 'select',
      default: 'ClusterIP',
      help: 'How far outside the cluster this Service is reachable.',
      impact:
        'ClusterIP is internal only and is what you want for service-to-service traffic. LoadBalancer provisions a real cloud load balancer per Service, which is why an Ingress exists — sharing one balancer across many Services instead of paying for dozens.',
      affects: ['security', 'cost'],
      options: [
        { value: 'ClusterIP', label: 'ClusterIP', note: 'Internal only — the default, and usually right' },
        { value: 'NodePort', label: 'NodePort', note: 'A high port on every node' },
        { value: 'LoadBalancer', label: 'LoadBalancer', note: 'One cloud load balancer per Service' },
        { value: 'ExternalName', label: 'ExternalName', note: 'A CNAME to something outside' },
      ],
    },
    {
      key: 'sessionAffinity',
      label: 'Session affinity',
      type: 'boolean',
      default: false,
      help: 'Routes requests from one client IP to the same Pod.',
      impact: 'A crutch for applications holding session state in memory. It unbalances load and loses sessions when a Pod dies. Shared session storage is the real fix.',
      affects: ['capacity'],
    },
  ],
  sim: {
    latencyMs: 1,
    availability: 0.9999,
    failureModes: [
      { id: 'no-endpoints', label: 'Service has no endpoints', symptom: 'Connection refused; kubectl get endpoints shows <none>.', remedy: 'Either the label selector matches no Pods, or every Pod is failing its readiness probe. Check the selector first — a typo there is silent.' },
    ],
  },
  setup: {
    snippets: [
      {
        label: 'Service and the endpoints it builds',
        lang: 'yaml',
        code: `apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: prod
spec:
  type: ClusterIP
  selector:
    app: web          # must match the Pod LABELS, not the Deployment name
  ports:
    - port: 80        # what clients call
      targetPort: 8080 # what the container listens on
      protocol: TCP

# Reachable inside the cluster as:
#   web                     (same namespace)
#   web.prod                (cross-namespace)
#   web.prod.svc.cluster.local`,
      },
      {
        label: 'When a Service returns nothing',
        lang: 'bash',
        code: `# The first command to run, always. Empty means no READY Pod matches.
kubectl get endpoints web -n prod

# Does the selector match anything at all?
kubectl get pods -n prod -l app=web

# If Pods exist but endpoints is empty, they are failing readiness
kubectl get pods -n prod -l app=web -o wide

# Test resolution and connectivity from inside the cluster
kubectl run tmp --rm -it --image=nicolaka/netshoot -- \\
  sh -c 'nslookup web.prod.svc.cluster.local; curl -sv http://web.prod/healthz'`,
      },
    ],
    docs: [{ label: 'Service', url: 'https://kubernetes.io/docs/concepts/services-networking/service/' }],
    gotchas: [
      'The selector matches Pod labels, not the Deployment name. A mismatch produces a Service with zero endpoints and no error anywhere.',
      '`kubectl get endpoints` is the fastest diagnosis in Kubernetes networking. Empty means either the selector is wrong or nothing is ready.',
      'Each LoadBalancer Service provisions its own cloud load balancer, at full price. Twenty Services means twenty load balancers — use an Ingress.',
    ],
  },
  concepts: ['kubernetes-networking', 'service-discovery', 'probes', 'dns-resolution'],
  keywords: ['service', 'clusterip', 'endpoints', 'selector', 'svc'],
}

const ingress: ResourceDef = {
  id: 'k8s.ingress',
  provider: 'kubernetes',
  name: 'Ingress',
  short: 'Ingress',
  archetype: 'k8s-ingress',
  category: 'kubernetes',
  icon: 'door',
  tagline: 'One entry point, many Services, routed by host and path',
  description:
    'An Ingress is a set of HTTP routing rules; an ingress controller is the thing that actually implements them, usually as a load balancer plus a reverse proxy. It lets one external address and one certificate serve many Services — routing by hostname and path — instead of provisioning a cloud load balancer per Service. Without a controller installed, an Ingress resource does nothing at all.',
  wantsContainer: ['k8s-cluster'],
  ports: [
    inPort('in', 'External traffic', ['http', 'grpc']),
    outPort('out', 'To Services', ['http', 'grpc']),
    inPort('cert', 'TLS certificate', ['tls-cert'], { position: 'top' }),
  ],
  props: [
    {
      key: 'controller',
      label: 'Controller',
      type: 'select',
      default: 'nginx',
      help: 'The implementation behind the rules.',
      impact: 'Cloud-native controllers provision the provider\'s own load balancer and integrate with its WAF and certificates. NGINX runs in-cluster and is portable. Gateway API is the successor to Ingress and handles more than HTTP.',
      affects: ['cost', 'capacity'],
      options: [
        { value: 'nginx', label: 'ingress-nginx', note: 'Portable, in-cluster' },
        { value: 'alb', label: 'AWS Load Balancer Controller', note: 'Provisions a real ALB' },
        { value: 'gateway-api', label: 'Gateway API', note: 'The modern replacement for Ingress' },
      ],
    },
    {
      key: 'tls',
      label: 'TLS termination',
      type: 'boolean',
      default: true,
      help: 'Terminates HTTPS at the ingress, usually with certificates issued automatically by cert-manager.',
      impact: 'Without it, traffic between users and the cluster is plain HTTP. With cert-manager, certificates issue and renew themselves and expiry stops being a risk.',
      affects: ['security'],
      danger: (v) => (v === false ? 'Plain HTTP into the cluster. Session cookies and credentials travel in clear text.' : null),
    },
    {
      key: 'rateLimit',
      label: 'Rate limiting',
      type: 'boolean',
      default: false,
      help: 'Caps requests per client at the edge of the cluster.',
      impact: 'The cheapest place to shed an abusive client — before the request reaches a Pod that would have spent CPU on it.',
      affects: ['security', 'capacity'],
    },
  ],
  sim: {
    capacity: 20000,
    latencyMs: 3,
    availability: 0.999,
    mitigates: { 'app-ddos': 0.35 },
    failureModes: [
      { id: 'no-controller', label: 'No ingress controller installed', symptom: 'The Ingress resource exists, has no address, and nothing happens.', remedy: 'An Ingress is only a declaration. Install a controller and set ingressClassName.' },
      { id: 'cert-expiry', label: 'Certificate expired', symptom: 'Browsers refuse the connection with a certificate error.', remedy: 'Use cert-manager with automatic renewal, and alarm on days-to-expiry.' },
    ],
  },
  setup: {
    snippets: [
      {
        label: 'Ingress with automatic TLS',
        lang: 'yaml',
        code: `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: prod
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/limit-rps: "50"
spec:
  ingressClassName: nginx
  tls:
    - hosts: [app.example.com]
      secretName: web-tls     # cert-manager creates and renews this
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend: { service: { name: api, port: { number: 80 } } }
          - path: /
            pathType: Prefix
            backend: { service: { name: web, port: { number: 80 } } }`,
      },
    ],
    docs: [{ label: 'Ingress', url: 'https://kubernetes.io/docs/concepts/services-networking/ingress/' }],
    gotchas: [
      'An Ingress with no controller is inert YAML. If nothing is happening, check that a controller is installed and that ingressClassName matches it.',
      'Path matching rules differ between controllers, especially around rewrites and regular expressions. Manifests are not always portable.',
      'Gateway API is the direction of travel. New clusters should generally start there rather than on Ingress.',
    ],
  },
  concepts: ['kubernetes-networking', 'tls-termination', 'load-balancing'],
  keywords: ['ingress', 'nginx', 'gateway', 'routing', 'tls'],
}

const hpa: ResourceDef = {
  id: 'k8s.hpa',
  provider: 'kubernetes',
  name: 'Horizontal Pod Autoscaler',
  short: 'HPA',
  archetype: 'autoscaler',
  category: 'kubernetes',
  icon: 'scale',
  tagline: 'Adds Pods when a metric says they are needed',
  description:
    'The HPA watches a metric and adjusts a Deployment\'s replica count to hold it near a target. It is only half the story: adding Pods needs somewhere to put them, and if the cluster is full those Pods sit Pending until the cluster autoscaler provisions a node. Scaling in Kubernetes is therefore two loops at two different speeds, and the slower one is what determines whether you survive a spike.',
  wantsContainer: ['k8s-cluster'],
  ports: [
    inPort('in', 'Metrics', ['telemetry']),
    outPort('out', 'Scales', ['schedule']),
  ],
  props: [
    {
      key: 'metric',
      label: 'Scaling metric',
      type: 'select',
      default: 'cpu',
      help: 'What the autoscaler watches.',
      impact:
        'CPU is the default and is a lagging, indirect proxy for load. Requests per Pod tracks demand directly. Queue depth is better still for workers, because it measures the backlog rather than a symptom of it.',
      affects: ['capacity', 'latency'],
      options: [
        { value: 'cpu', label: 'CPU utilisation', note: 'Default, and a lagging indicator' },
        { value: 'rps', label: 'Requests per Pod', note: 'Tracks demand directly' },
        { value: 'queue', label: 'Queue depth', note: 'The right metric for workers' },
      ],
    },
    {
      key: 'targetValue',
      label: 'Target value',
      type: 'number',
      default: 70,
      min: 10,
      max: 95,
      help: 'The value the autoscaler tries to hold.',
      impact: 'A high target runs efficiently with no headroom. When a spike arrives you need that headroom to survive the minutes it takes new Pods — and possibly new nodes — to become ready.',
      affects: ['capacity', 'cost', 'latency'],
    },
    {
      key: 'minReplicas',
      label: 'Minimum replicas',
      type: 'number',
      default: 2,
      min: 1,
      max: 100,
      help: 'The floor.',
      impact: 'Your baseline capacity and your protection against scaling down so far that the next spike starts from nothing.',
      affects: ['availability', 'cost'],
    },
    {
      key: 'maxReplicas',
      label: 'Maximum replicas',
      type: 'number',
      default: 20,
      min: 1,
      max: 500,
      help: 'The ceiling.',
      impact: 'A cost cap and a protection for whatever is downstream. Scaling to two hundred Pods that each open database connections is a good way to take out the database instead.',
      affects: ['capacity', 'cost'],
    },
  ],
  sim: {
    failureModes: [
      { id: 'no-metrics', label: 'HPA reports unknown metrics', symptom: 'kubectl get hpa shows <unknown>/70%.', remedy: 'metrics-server is not installed, or the Pods have no CPU requests set — the HPA computes utilisation as a percentage of the request.' },
      { id: 'flapping', label: 'Replica count oscillating', symptom: 'Pods are added and removed repeatedly in a cycle.', remedy: 'Tune the stabilisation window and scale-down policy so it reacts fast upward and slowly downward.' },
    ],
  },
  setup: {
    snippets: [
      {
        label: 'HPA with sane scaling behaviour',
        lang: 'yaml',
        code: `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: web, namespace: prod }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: web }
  minReplicas: 3
  maxReplicas: 30
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: { type: Utilization, averageUtilization: 70 }
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0      # react immediately to load
      policies: [{ type: Percent, value: 100, periodSeconds: 30 }]
    scaleDown:
      stabilizationWindowSeconds: 300    # but come down slowly
      policies: [{ type: Percent, value: 20, periodSeconds: 60 }]`,
      },
    ],
    docs: [{ label: 'Horizontal Pod Autoscaling', url: 'https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/' }],
    gotchas: [
      'CPU-based HPA needs CPU requests on the Pods. Utilisation is measured as a percentage of the request, so with no request there is nothing to compute.',
      'Scale up fast and down slowly. Aggressive scale-down removes the capacity you are about to need again.',
      'The HPA only asks for Pods. If the cluster has no room they stay Pending until the cluster autoscaler adds a node, which takes minutes.',
    ],
  },
  concepts: ['autoscaling', 'kubernetes-scheduling', 'capacity-planning'],
  keywords: ['hpa', 'autoscaler', 'scale', 'keda', 'replicas'],
}

const networkPolicy: ResourceDef = {
  id: 'k8s.networkpolicy',
  provider: 'kubernetes',
  name: 'NetworkPolicy',
  short: 'NetPol',
  archetype: 'firewall',
  category: 'kubernetes',
  icon: 'shield',
  tagline: 'Pod-level firewall rules — the thing that stops lateral movement',
  description:
    'By default every Pod in a cluster can reach every other Pod, in every namespace. A NetworkPolicy changes that: it selects Pods and declares which traffic is allowed in and out. This is the single highest-value security control in a cluster, because without it one compromised container can reach your database, your secrets backend and every other team\'s workloads.',
  wantsContainer: ['k8s-cluster'],
  ports: [
    inPort('in', 'Pod traffic', ['http', 'grpc', 'tcp', 'sql', 'nosql', 'cache']),
    outPort('out', 'Allowed traffic', ['http', 'grpc', 'tcp', 'sql', 'nosql', 'cache']),
  ],
  props: [
    {
      key: 'defaultDeny',
      label: 'Default deny',
      type: 'boolean',
      default: true,
      help: 'Denies all traffic to and from selected Pods unless a policy explicitly allows it.',
      impact:
        'Flips the cluster from "everything can reach everything" to "nothing can, until stated". It is the foundation of segmentation inside Kubernetes, and it is off until you turn it on.',
      affects: ['security'],
      danger: (v) => (v === false ? 'Without a default-deny policy, every Pod in the cluster can reach every other Pod and every database endpoint.' : null),
    },
    {
      key: 'egressControl',
      label: 'Egress restrictions',
      type: 'boolean',
      default: false,
      help: 'Limits what Pods may connect out to.',
      impact:
        'Ingress rules stop an attacker getting in; egress rules stop them getting data out and stop a compromised Pod calling a command-and-control server. Most clusters only do the first half.',
      affects: ['security'],
    },
  ],
  sim: {
    mitigates: { 'lateral-movement': 0.8, 'data-exfiltration': 0.55, 'port-scan': 0.7, ransomware: 0.3 },
  },
  setup: {
    snippets: [
      {
        label: 'Default deny, then allow deliberately',
        lang: 'yaml',
        code: `# 1. Deny everything in the namespace, both directions.
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: default-deny-all, namespace: prod }
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
---
# 2. Allow exactly what the app needs, and nothing else.
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: web-allow, namespace: prod }
spec:
  podSelector: { matchLabels: { app: web } }
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
        - namespaceSelector: { matchLabels: { name: ingress-nginx } }
      ports: [{ port: 8080, protocol: TCP }]
  egress:
    # DNS, or nothing resolves and everything looks mysteriously broken
    - to: [{ namespaceSelector: { matchLabels: { name: kube-system } } }]
      ports: [{ port: 53, protocol: UDP }, { port: 53, protocol: TCP }]
    # The database, and only the database
    - to: [{ podSelector: { matchLabels: { app: postgres } } }]
      ports: [{ port: 5432, protocol: TCP }]`,
      },
    ],
    docs: [{ label: 'Network Policies', url: 'https://kubernetes.io/docs/concepts/services-networking/network-policies/' }],
    gotchas: [
      'Your CNI plugin must implement NetworkPolicy or the resource is silently ignored. Calico and Cilium do; some configurations of the basic plugins do not. Test that a denial actually denies.',
      'A default-deny egress policy blocks DNS. Every lookup fails and the symptom looks like anything but a network policy. Allow port 53 to kube-system first.',
      'Policies are additive and there is no deny rule — traffic is allowed if any policy permits it.',
    ],
  },
  concepts: ['zero-trust', 'network-segmentation', 'lateral-movement', 'kubernetes-networking'],
  keywords: ['networkpolicy', 'netpol', 'calico', 'cilium', 'segmentation'],
}

const configSecret: ResourceDef = {
  id: 'k8s.config',
  provider: 'kubernetes',
  name: 'ConfigMap & Secret',
  short: 'Config',
  archetype: 'k8s-config',
  category: 'kubernetes',
  icon: 'file',
  tagline: 'Configuration separated from the image',
  description:
    'ConfigMaps hold non-sensitive configuration; Secrets hold sensitive values. The crucial and frequently misunderstood point about Secrets is that they are base64-encoded, not encrypted — anyone who can read the Secret, or read etcd, sees the value. Making them genuinely secret requires encryption at rest plus RBAC, or an external store synced in.',
  wantsContainer: ['k8s-cluster'],
  ports: [outPort('out', 'Mounted by', ['secret', 'identity'])],
  props: [
    {
      key: 'secretSource',
      label: 'Secret source',
      type: 'select',
      default: 'k8s',
      help: 'Where the sensitive values actually live.',
      impact:
        'A native Secret is base64 in etcd. An external store — Secrets Manager, Key Vault, Vault — keeps the value outside the cluster, rotates it, and logs every access. The External Secrets Operator or the CSI driver syncs it in without your application knowing the difference.',
      affects: ['security'],
      options: [
        { value: 'k8s', label: 'Native Secret', note: 'Base64 in etcd — not encryption' },
        { value: 'external', label: 'External store + operator', note: 'Rotated and audited outside the cluster' },
      ],
    },
    {
      key: 'encryptedAtRest',
      label: 'etcd encryption at rest',
      type: 'boolean',
      default: false,
      help: 'Encrypts Secret values in etcd rather than storing them plainly.',
      impact: 'Without it, anyone who reads an etcd backup reads every Secret in the cluster in plain text.',
      affects: ['security'],
      danger: (v, p) => (v === false && p.secretSource === 'k8s' ? 'Secrets are stored unencrypted in etcd. An etcd snapshot is a complete credential dump.' : null),
    },
  ],
  sim: { mitigates: { 'credential-stuffing': 0.2 } },
  setup: {
    snippets: [
      {
        label: 'Secrets are not secret by default',
        lang: 'bash',
        code: `kubectl create secret generic db --from-literal=password='hunter2'

# This is all it takes to read it back. Base64 is encoding, not encryption.
kubectl get secret db -o jsonpath='{.data.password}' | base64 -d
# hunter2

# So the real controls are:
#   1. RBAC — who can 'get secrets' in this namespace?
#   2. Encryption at rest for etcd
#   3. An external store, so the value never lives in the cluster at all
kubectl auth can-i get secrets -n prod --as=system:serviceaccount:prod:web`,
      },
      {
        label: 'External Secrets Operator',
        lang: 'yaml',
        code: `apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata: { name: db-credentials, namespace: prod }
spec:
  refreshInterval: 1h          # picks up rotation automatically
  secretStoreRef: { name: aws-secrets-manager, kind: ClusterSecretStore }
  target: { name: db-credentials }
  data:
    - secretKey: password
      remoteRef: { key: prod/db/credentials, property: password }`,
      },
    ],
    docs: [{ label: 'Secrets', url: 'https://kubernetes.io/docs/concepts/configuration/secret/' }],
    gotchas: [
      'A Kubernetes Secret is base64-encoded, not encrypted. Treat "can read secrets in this namespace" as equivalent to "knows every credential in it".',
      'A Secret mounted as a volume updates when the Secret changes; one injected as an environment variable does not, and needs a Pod restart.',
      'Never commit Secret manifests to git. Use Sealed Secrets, SOPS, or an external store with an operator.',
    ],
  },
  concepts: ['secrets-management', 'twelve-factor', 'rbac'],
  keywords: ['configmap', 'secret', 'config', 'env', 'vault'],
}

export const kubernetesResources: ResourceDef[] = [
  cluster, nodepool, deployment, service, ingress, hpa, networkPolicy, configSecret,
]
