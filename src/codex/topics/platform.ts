import type { Concept } from '../types'

export const platform: Concept[] = [
  {
    id: 'platform-engineering',
    title: 'Platform engineering',
    category: 'platform',
    short: 'Building the thing your product teams build on, and treating it as a product.',
    body: `Give every product team full ownership of its infrastructure and each one solves the same problems differently: a different way to get a database, a different pipeline, a different idea of what "production ready" means. Centralise it all in an operations team instead and that team becomes a ticket queue, which is where delivery speed goes to die.

Platform engineering is the third position. A small team builds an internal product — a set of paved, self-service capabilities — and product teams consume it without raising a ticket and without becoming infrastructure experts. The CNCF's definition is worth holding onto: a platform is an integrated collection of capabilities, defined and presented according to the needs of the people who use it.

The word that carries the weight is *product*. A platform with users who were told to use it is a mandate; a platform with users who would choose it is a product. That difference shows up in everything — whether you do user research before building, whether adoption is measured, whether there is a roadmap, whether anyone is accountable when the platform is the reason a team missed a deadline.

What it is not: a rebranded operations team, a Kubernetes cluster, or a wiki page of standards. Kubernetes is a platform for building platforms, not a platform for application developers — handing a team raw cluster access and a link to the documentation moves the cognitive load rather than removing it.

The honest measure of whether you have one: how long does it take a new service to go from an empty repository to serving production traffic with logging, metrics, a pipeline, a database and an on-call rota attached? If the answer is a day, you have a platform. If it is three weeks of meetings, you have a wiki.`,
    keyPoints: [
      'A platform is an integrated set of capabilities shaped by its users\' needs, not a tool collection.',
      'Treating it as a product — research, roadmap, adoption metrics — is what separates it from a ticket queue.',
      'Kubernetes is a platform for building platforms, not a developer-facing platform.',
      'Measure it by time from empty repository to production traffic.',
    ],
    related: ['internal-developer-platform', 'golden-paths', 'developer-experience', 'platform-adoption'],
  },
  {
    id: 'internal-developer-platform',
    title: 'The internal developer platform',
    category: 'platform',
    short: 'The capabilities a product team needs, behind one consistent interface.',
    body: `An internal developer platform is the concrete thing a platform team ships: the interfaces, templates and automation through which a product team gets what it needs. The CNCF platforms white paper enumerates thirteen capability domains to consider, and the list is a useful completeness check — web portals and APIs for provisioning, golden path templates and documentation, build and test automation, delivery and verification, development environments, observability covering functionality, performance and cost, infrastructure services, data services, messaging and event services, identity and secret management, security services, and artefact storage.

Nothing on that list needs to be built. Most of it should not be. The platform's job is integration and presentation: the managed database exists already, but the version your teams get is in the right network, encrypted with the right key, backed up on the right schedule, with credentials delivered to the workload and metrics flowing to the right dashboard. That assembly is the product.

Interfaces matter more than they seem. A portal is discoverable and good for onboarding. An API or CLI is what automation and experienced engineers actually use. A Git repository is what fits the workflow developers are already in. Most successful platforms offer several, over the same underlying capability, rather than forcing one.

The failure mode is building an abstraction that leaks and then refusing to open it. When the abstraction does not cover a case — and it will not — teams need an escape hatch that does not mean abandoning the platform. Composable and optional beats all-or-nothing; a platform that cannot be partially adopted tends not to be adopted.

Keep the interface narrow and the implementation free. If teams declare what they need rather than how to build it, you can change the how — swap the ingress, move regions, add a control — without touching a hundred repositories. That freedom is the return on the whole investment.`,
    keyPoints: [
      'Integration and presentation of existing services is the product, not new infrastructure.',
      'Offer portal, API, CLI and Git interfaces over the same capability rather than one.',
      'Always provide an escape hatch; abstractions leak and unavoidable exceptions exist.',
      'A narrow declarative interface lets you change the implementation underneath.',
    ],
    related: ['platform-engineering', 'golden-paths', 'self-service-guardrails', 'service-catalogue'],
  },
  {
    id: 'golden-paths',
    title: 'Golden paths',
    category: 'platform',
    short: 'The supported way to build a service, made easier than any alternative.',
    body: `A golden path is a templated, well-integrated route from idea to running service: a project template, a pipeline, the standard observability wiring, the deployment manifests and documentation, all composed and known to work together. Its purpose is to make the supported thing the easy thing.

The distinction that matters is between a paved road and a golden cage. A paved road is optional and better — teams take it because starting from it is faster than starting from nothing, and they can leave it when they have a reason. A golden cage is mandatory and worse — teams route around it, and you discover the shadow platform during an incident. Compliance achieved by making the compliant option the path of least resistance survives; compliance achieved by mandate erodes.

A golden path is not the same as scaffolding. Generating a repository from a template once is a wedding, not a marriage: six months later that repository has drifted and nobody knows which of forty services still has the current pipeline. The paths that hold up are the ones that stay connected — a shared pipeline definition, a base image, a library version that can be rolled forward centrally, so improvements reach existing services and not only new ones.

Choose few paths and make them excellent. "A stateless HTTP service in Go" and "an event consumer in Python" deserve real paths. Twelve half-maintained templates are worse than two good ones, because a path nobody maintains still carries the implication of support.

And accept the deliberate cost: a golden path constrains choice on purpose. The return is that a team can ship without deciding how to do logging, how to structure a pipeline, how to get a certificate, or what a health endpoint should return — decisions that have a right answer at your organisation and no value in being made again.`,
    keyPoints: [
      'Make the supported path the easy path; mandates produce shadow platforms.',
      'Golden paths stay connected to what they generate — a one-off template drifts immediately.',
      'Two excellent paths beat twelve maintained by nobody.',
      'The constraint is the point: it removes decisions that have one right answer here.',
    ],
    related: ['platform-engineering', 'internal-developer-platform', 'developer-experience', 'policy-as-code'],
  },
  {
    id: 'developer-experience',
    title: 'Developer experience and cognitive load',
    category: 'platform',
    short: 'The limit on a team is what it can hold in its head, not how hard it works.',
    body: `A product team that owns its service, its pipeline, its database, its dashboards, its infrastructure code, its on-call rota and its cloud account is not empowered — it is saturated. Team Topologies gives the useful frame: a team has a finite cognitive capacity, and the job of a platform is to take load off it so the remaining capacity goes to the domain problem the team was hired to solve.

Not all load is equal, and Team Topologies borrows three kinds. Intrinsic load is the technical fundamentals — the language, the framework, the runtime — lowered by training and by having fewer technologies in play. Extraneous load is everything accidental: remembering which of four ways to get a secret is current, hand-writing the same pipeline, discovering that staging needs a different flag. Germane load is the business domain, and it is the load you want a team's capacity spent on. A platform deletes the extraneous and holds the intrinsic down so the germane has room. The mistake is abstracting away the domain instead, which is how platforms that hide the thing a team was hired to understand get built.

Feedback loops dominate the experience. Time to first successful deploy, time from commit to knowing whether it worked, time to reproduce a failure locally, time to get an environment. These compound: a ten-minute pipeline and a fifty-minute pipeline produce different engineering cultures, because the second one makes people batch changes, and batched changes fail in ways that are harder to diagnose.

Measure it deliberately rather than by anecdote. The DORA throughput and instability metrics tell you about the system; periodic developer surveys tell you where the friction is felt; support-request volume tells you which part of the platform is not self-explanatory. The SPACE framework exists because any single number here is easy to game — optimise deployment frequency alone and you get more, smaller, equally painful deploys.

The signal to watch for: when a team's own estimate of "how long to get this in front of users" is dominated by anything other than writing the change.`,
    keyPoints: [
      'A team\'s capacity is bounded by cognitive load; the platform exists to lower it.',
      'Delete accidental load and hold technical load down, so domain load has room.',
      'Feedback-loop length shapes behaviour: slow pipelines produce large, risky batches.',
      'Combine delivery metrics with surveys; one number alone gets gamed.',
    ],
    related: ['platform-engineering', 'golden-paths', 'dora-metrics', 'environments'],
  },
  {
    id: 'self-service-guardrails',
    title: 'Self-service and guardrails',
    category: 'platform',
    short: 'Let teams provision what they need, inside limits that make the bad outcomes unreachable.',
    body: `Self-service means a team can get a database, an environment or a deployment without waiting for another human. That is where the delivery speed comes from — every approval step in the provisioning path is queue time, and queue time routinely dwarfs the work itself.

The obvious objection is control, and the answer is guardrails rather than gates. A gate is a human decision in the path of every change; it is slow, it becomes a rubber stamp under load, and a rubber stamp is a delay wearing the costume of a control. A guardrail is a constraint that holds without anyone present: the provisioning interface only offers encrypted storage, the policy engine rejects a public bucket, the organisation policy makes an unapproved region unusable, the budget caps what a team can spend without a conversation.

Guardrails come in two kinds and you want both. Preventive controls stop the thing happening — admission policies, service control policies, an IaC module that does not expose the dangerous setting. Detective controls find what got through — configuration scanning, drift detection, anomaly alerts. Preventive is better where the blast radius justifies it; detective is what you use where prevention would block legitimate work.

Keep the escape hatch explicit and visible. There will be a case the platform does not cover, and the choice is between a documented exception with an owner and an expiry, or a team quietly building its own path outside your view. The first is governable and the second is what you find during the incident review.

A useful test of the balance: can a new engineer, on their first week, provision something in production that costs the company a lot of money or exposes data? If yes, the guardrails are thin. Can they provision anything at all without asking? If no, you have a ticket queue with extra steps.`,
    keyPoints: [
      'Queue time in provisioning routinely dwarfs the work itself.',
      'Guardrails hold without a human in the path; gates become rubber stamps.',
      'Use preventive controls where blast radius warrants, detective controls elsewhere.',
      'Make the exception path official, or teams will build an unofficial one.',
    ],
    related: ['policy-as-code', 'landing-zones', 'least-privilege', 'internal-developer-platform'],
  },
  {
    id: 'service-catalogue',
    title: 'The service catalogue',
    category: 'platform',
    short: 'Knowing what exists, who owns it, and what happens when it breaks at 3am.',
    body: `Past a few dozen services, "who owns this?" becomes a genuinely hard question, and it is asked at the worst possible times: during an incident, during a security patch, during a migration. A service catalogue is the answer — an inventory where every service has an owning team, a contact path, a repository, dashboards, runbooks, dependencies and a tier.

The critical design decision is where the data lives. A catalogue maintained by hand is accurate on the day it is built and wrong within a quarter. The ones that survive keep ownership metadata next to the code, in a descriptor file the catalogue discovers from source control, so updating it is part of the change that made it stale. Backstage popularised this shape — a catalog-info.yaml in each repository, maintained through the team's normal Git workflow. The tool matters far less than the property that the metadata is reviewed alongside the code rather than kept in a separate register somebody has to remember.

What makes it operationally valuable is the links outward. From a service you should reach its dashboards, its recent deploys, its on-call rota and its dependencies in one step. That turns "an alert fired on a service I have never heard of" from an archaeology exercise into a click.

Dependency data is the part people underinvest in and later wish they had. It answers questions that are otherwise guesswork: what breaks if this database goes down, which services still use the library with the vulnerability, who do I need to tell before this API changes. Derived dependencies — from traces, from build manifests, from IaC — beat declared ones, because declared dependencies are documentation and documentation drifts.

And the catalogue is where tiering belongs. Not every service deserves the same availability target, the same review depth or the same paging policy, and writing that down once stops the argument being had per incident.`,
    keyPoints: [
      'Ownership is the question asked during incidents; it needs an authoritative answer.',
      'Keep catalogue metadata beside the code and discover it from there — separate registers rot.',
      'Link outward to dashboards, deploys, rotas and runbooks, or it is a list and nothing more.',
      'Derived dependency graphs answer blast-radius questions declarations cannot.',
    ],
    related: ['internal-developer-platform', 'on-call', 'runbooks', 'incident-response'],
  },
  {
    id: 'landing-zones',
    title: 'Landing zones and account structure',
    category: 'platform',
    short: 'The account, subscription or project boundary is your strongest blast radius control.',
    body: `The account (AWS), subscription (Azure) or project (GCP) boundary is the hardest isolation line a cloud provider gives you. Quotas are per-account, most default permissions stop at it, billing rolls up by it, and a compromise or a runaway process is contained by it in a way that a tag or a naming convention never will be. Deciding how you draw those boundaries is an architectural decision, not an administrative one.

The pattern that has settled: many accounts, organised into a hierarchy, with separation by environment and by workload. Production and non-production never share an account. A team's experimentation lives somewhere that cannot reach production data. Shared services — networking, logging, identity, artefact storage — live in their own accounts, as do security and audit functions, so that an engineer compromising a workload account cannot also erase the logs that would show it.

A landing zone is that structure, delivered as a repeatable thing: a new account arrives with networking connected, guardrail policies attached, log forwarding configured, identity federation wired, budget alerts set and a baseline of security services enabled. The point is that account number two hundred is as correct as account number one, because nobody assembled it by hand.

Organisation-level policies are the strongest guardrail available. AWS service control policies, Azure Policy at management-group scope and GCP organisation policy constraints all set a ceiling that even an account administrator cannot exceed — denying regions you do not operate in, preventing the disabling of audit logging, blocking public access to storage. They are preventive controls that survive a mistake and a compromised account administrator — with one exception worth knowing: service control policies do not apply to the organisation's management account or to service-linked roles, which is the reason that account carries no workloads and very few people.

The two things people get wrong: leaving the network design until after the account structure (address space planning is much harder retrofitted), and creating so many accounts that nobody can find anything — every boundary has an operational cost, and the right number follows blast radius and ownership, not neatness.`,
    keyPoints: [
      'Accounts, subscriptions and projects are the strongest isolation boundary on offer.',
      'Separate production from non-production, and keep logging, identity and audit apart from workloads.',
      'A landing zone makes the hundredth account as correct as the first.',
      'Organisation policies set a ceiling an account admin cannot lift — except in the management account itself.',
    ],
    related: ['blast-radius', 'self-service-guardrails', 'policy-as-code', 'vpc-design'],
  },
  {
    id: 'policy-as-code',
    title: 'Policy as code',
    category: 'platform',
    short: 'Rules that a machine evaluates, at a point where the answer still matters.',
    body: `A standard written in a document is advice. The same standard expressed as code that runs in the pipeline and at admission is a control. Policy as code is the practice of moving rules — no public storage buckets, images must come from our registry, every resource must carry an owner tag, no container runs as root — into something evaluated automatically and identically every time.

Where you evaluate it changes what it costs. In the editor or a pre-commit hook, feedback is instant and the fix is cheap. In the pull request, against the plan output, the author still has context and nothing has been created. At admission, when the cluster or cloud API receives the request, you catch what bypassed the pipeline, including manual changes. Continuously, against what actually exists, you catch drift and things created before the policy existed. Mature setups use all four, with the same rule expressed once.

The tools cluster around a few choices. Open Policy Agent with Rego is the general-purpose engine — Kubernetes admission, API authorisation, Terraform plan evaluation, all with one language; at Kubernetes admission it is usually deployed as Gatekeeper. Kubernetes also ships its own CEL-based admission policies, evaluated inside the API server with no webhook to run, which cover straightforward rules without another component in the request path. Kyverno expresses policies as Kubernetes resources, which many teams find easier to read, and it can mutate, generate and clean up as well as validate; it began as Kubernetes-only and now evaluates any JSON payload through its CLI — a Terraform plan or a Dockerfile as readily as a manifest. Cloud-native options — service control policies, Azure Policy, organisation policy constraints — are less expressive but sit inside the provider's own API, so a workload cannot route around them. Read their exceptions before relying on one: service control policies do not restrict an organisation's management account or service-linked roles, and Azure Policy assignments can be exempted.

Two practical rules. Ship every policy in audit mode first and look at what it would have blocked; policies written from an idea of the estate rather than the estate itself routinely break something nobody predicted. And make the violation message say what to do — "denied by policy require-owner-tag" costs an engineer half an hour, while "add an owner tag naming the team; see the linked guide" costs a minute.

Mutation deserves particular care. A policy that fills in a missing default is a kindness; a policy that silently changes what someone asked for is a debugging nightmare.`,
    keyPoints: [
      'A rule in a document is advice; a rule in an engine is a control.',
      'Evaluate at commit, in the pipeline, at admission and continuously — one rule, four points.',
      'Run new policies in audit mode first; the estate always contains surprises.',
      'The denial message is part of the policy: say what to do, not only what failed.',
    ],
    related: ['self-service-guardrails', 'admission-control', 'landing-zones', 'compliance'],
  },
  {
    id: 'multi-tenancy',
    title: 'Multi-tenancy',
    category: 'platform',
    short: 'Shared infrastructure is cheaper until one tenant\'s behaviour becomes everyone\'s problem.',
    body: `Whenever more than one customer, team or workload shares infrastructure, you are choosing a point on a line between cost and isolation, and the choice is usually described with three models. Silo: each tenant gets its own stack, and isolation is close to absolute at the highest cost. Pool: everyone shares one stack, separated in software, which is the cheapest and where every isolation bug lives. Bridge: shared where it is safe, separated where it is not — shared compute with a database per tenant, or a shared cluster with a namespace and quota per team.

The pooled model fails in two characteristic ways. The noisy neighbour: one tenant's expensive query, hot partition or runaway loop consumes shared capacity and everyone's latency rises. The isolation defect: a missing tenant predicate in one query, a cache key without a tenant prefix, and one customer sees another's data. The first is an engineering problem with well-understood fixes; the second is a breach, and it is why identifiers derived from the request path rather than the authenticated session keep appearing in incident write-ups.

The controls that actually work are quotas and shared-nothing keys. Every tenant gets a rate limit, a resource quota and a concurrency cap, so consumption is bounded by design rather than by good behaviour. Every partition key, cache key and storage prefix starts with the tenant identifier, so the data layout enforces what the code is also supposed to enforce. Where the platform is Kubernetes, that means a namespace with a ResourceQuota and LimitRange per tenant, network policies denying cross-namespace traffic, and separate node pools where the workload justifies it.

Charge and measure per tenant from the beginning. Cost per tenant, capacity per tenant and error rate per tenant are the numbers that tell you whether a customer is profitable and which one is degrading the rest. Retrofitting that attribution once everything is pooled is painful.

And be honest that some tenants do not belong in the pool. Regulatory requirements, a customer large enough to be a load profile of its own, and a genuinely hostile-until-proven-otherwise workload are all reasons to run a silo and price it accordingly.`,
    keyPoints: [
      'Silo, pool and bridge trade cost against isolation; most platforms end up bridging.',
      'Pooled tenancy fails through noisy neighbours and missing tenant predicates.',
      'Per-tenant quotas and tenant-prefixed keys make isolation structural, not procedural.',
      'Measure cost, capacity and errors per tenant from day one.',
    ],
    related: ['namespaces-and-quotas', 'rate-limiting', 'partition-keys', 'blast-radius'],
  },
  {
    id: 'platform-adoption',
    title: 'Platform adoption',
    category: 'platform',
    short: 'A platform nobody chose to use is an expensive internal fork of what teams already had.',
    body: `The most common way a platform fails is not technical. It is built without users, announced with a mandate, and adopted on paper while teams keep their own pipelines running underneath. The CNCF white paper lists the failure modes plainly: shipping features without user feedback, relying on top-down mandates for adoption, picking the wrong first capability or the wrong first partner team, losing executive support, and never measuring whether any of it helped.

Adoption is earned in the same way any product earns it. Start with one or two teams who have a real problem and the appetite to co-design — early adopters who will tell you the truth are worth more than a large captive audience. Solve the whole problem for them rather than part of it for everyone; a half-migration leaves a team running two systems, which is worse than either. Then let those teams be the reference.

Migration cost is the number that decides everything, and platform teams routinely under-price it. The correct question is not "is the platform better?" but "is it better by more than the cost of moving, to a team measured on shipping features?" If the answer is no, the platform pays: automated migration, a compatibility path, a period of running both, or engineers embedded with the team doing the work.

Measure a small set of things and publish them. Share of services on the paved path, time from repository to production, support-request volume per capability, and satisfaction from a short recurring survey. Track which capabilities are used and which are ignored — an unused capability is either badly communicated or was never needed, and both answers are useful.

The uncomfortable discipline is deletion. Platform teams accumulate capabilities and rarely retire them, and every one carries maintenance, documentation and cognitive cost. If a capability has two users and neither would notice its absence, it is subtracting from the platform rather than adding to it.`,
    keyPoints: [
      'Mandated adoption produces paper compliance and a shadow platform underneath.',
      'Start with a few engaged teams and solve their whole problem, not part of everyone\'s.',
      'The platform should absorb migration cost; teams are measured on shipping, not moving.',
      'Publish adoption, lead time, support load and satisfaction — and retire what nobody uses.',
    ],
    related: ['platform-engineering', 'developer-experience', 'golden-paths', 'dora-metrics'],
  },
]
