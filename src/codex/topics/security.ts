import type { Concept } from '../types'

export const security: Concept[] = [
  {
    id: 'least-privilege',
    title: 'Least privilege',
    category: 'security',
    short: 'Every identity gets exactly what it needs, because that is what bounds the damage.',
    body: `Least privilege is not bureaucracy. It is the variable that decides, on the day something is compromised, whether you lose one bucket or the account.

The method that works: start from nothing and add what breaks. Starting from a broad policy and narrowing it later almost never happens, because nothing is broken so nothing is urgent. Cloud providers now generate policies from observed usage — IAM Access Analyzer, Policy Analyzer — which makes the tightening step mechanical rather than archaeological.

Scope matters as much as actions. ‘s3:GetObject’ on one bucket prefix is a different grant from ‘s3:*’ on everything, and both are written in three lines. Condition keys narrow further without enumerating resources: requiring a source VPC means a stolen credential is useless from outside your network; requiring MFA means a stolen session is not enough.

The cloud-specific escalation path worth knowing is PassRole. Whoever can pass a powerful role to a service they are allowed to launch effectively holds that role — they launch a function with it and run whatever they like. Privilege escalation in cloud environments is usually a permissions puzzle rather than a software exploit, which is why automated analysis of who can reach what matters.

And separate human roles from workload roles. They have different lifecycles, different risks, and different appropriate permissions.`,
    keyPoints: [
      'Start from nothing; generate policies from real usage.',
      'Scope to specific resources, and use condition keys to narrow further.',
      'PassRole is the classic cloud escalation path.',
      'Human and workload identities should never share a role.',
    ],
    related: ['blast-radius', 'zero-trust', 'authn-vs-authz', 'rbac'],
  },
  {
    id: 'least-privilege-network',
    title: 'Least privilege on the network',
    category: 'security',
    short: 'Default deny, then allow exactly what is needed — in both directions.',
    body: `The network equivalent of least privilege: nothing can reach anything until a rule says so. Cloud firewalls are already allow-lists by default (a security group with no rules permits nothing inbound), so most of the work is not undoing that with a permissive rule.

Reference identities rather than addresses. A rule saying "allow from the web tier's security group" stays correct forever as instances come and go; a rule listing IP ranges is stale the moment something scales. GCP goes further by letting rules target service accounts, which is stronger than tags because a tag can be added by anyone with instance edit permission.

Ports are a policy statement. Every open port needs a patched service behind it. SSH and RDP open to the internet are the two most brute-forced ports there are, and they are also entirely avoidable — Session Manager, IAP and Bastion all give you administrative access with no inbound port at all.

And then the half almost everyone skips: egress. Outbound is permitted by default nearly everywhere, which is precisely the path used to exfiltrate data and to reach a command-and-control server. Restricting egress is more work — you have to know what your workloads legitimately call — and it is the control that turns a compromise into a contained one.`,
    keyPoints: [
      'Reference security groups, labels or service accounts, never IP lists.',
      'Never expose management ports; use Session Manager, IAP or Bastion.',
      'Egress is permitted by default and is how data leaves.',
      'Cloud firewalls are allow-lists already — the risk is a permissive rule.',
    ],
    related: ['network-segmentation', 'stateful-vs-stateless-firewall', 'data-exfiltration', 'zero-trust'],
  },
  {
    id: 'zero-trust',
    title: 'Zero trust',
    category: 'security',
    short: 'Being on the network is not an identity and grants nothing.',
    body: `The perimeter model assumes inside is trusted and outside is not. That breaks the moment anything inside is compromised — and with remote work, third-party integrations and cloud services, "inside" stopped being a meaningful location anyway.

Zero trust replaces location with identity. Every request is authenticated and authorised on its own merits, regardless of where it came from. A service inside your VPC proves who it is before another service answers it, exactly as an external caller would.

In practice this looks like: workload identity instead of network position (managed identities, IRSA, workload identity federation); mutual TLS between services, usually via a mesh, so identity is cryptographic; per-request authorisation rather than per-network-segment; short-lived credentials so a stolen token expires quickly; and device and user context for human access, which is what Identity-Aware Proxy and its equivalents provide.

The pragmatic point is that zero trust and network segmentation are complements, not alternatives. Segmentation reduces what an attacker can reach; identity verification reduces what they can do when they reach it. Doing only one leaves an obvious gap.

The adoption order that works: eliminate long-lived credentials first, then add workload identity, then tighten network policy, then add mutual TLS. Each step is useful alone.`,
    keyPoints: [
      'Network location grants nothing; identity is verified per request.',
      'Workload identity and short-lived credentials are the foundation.',
      'Mutual TLS makes service identity cryptographic rather than positional.',
      'Complements segmentation rather than replacing it.',
    ],
    related: ['least-privilege', 'network-segmentation', 'authn-vs-authz', 'secrets-management'],
  },
  {
    id: 'blast-radius',
    title: 'Blast radius',
    category: 'security',
    short: 'If this is fully compromised, what exactly can it reach?',
    body: `Blast radius is the answer to one question asked about each component: assume it is completely compromised — what is the full list of things the attacker can now read, write, delete or reach?

It is worth asking deliberately because the answer is usually larger than expected, and because it is answerable in advance rather than discovered during an incident. A container with a wildcard IAM policy and no network policy has a blast radius of "everything". The same container with a scoped role and a default-deny policy has a blast radius you can write on one line.

Four dimensions cover most of it. Identity: what can these credentials do, including anything they can escalate to. Network: what can this reach, in both directions. Data: what is readable, and is it encrypted with a key this identity can use. Availability: what breaks if this stops.

The controls that shrink it are the ones already covered — scoped IAM, network policy, private subnets, short-lived credentials, separate accounts for separate environments — and account separation is the strongest, because it bounds identity and network at once.

Make it a design habit. Asking "what is the blast radius of this service account" during review catches more real problems than most security tooling does after the fact.`,
    keyPoints: [
      'Assume full compromise and enumerate what is reachable.',
      'Four dimensions: identity, network, data, availability.',
      'Separate accounts bound identity and network together.',
      'Ask it during design review, not during the incident.',
    ],
    related: ['least-privilege', 'network-segmentation', 'lateral-movement', 'defence-in-depth'],
  },
  {
    id: 'defence-in-depth',
    title: 'Defence in depth',
    category: 'security',
    short: 'Every control fails sometimes; layers mean no single failure is total.',
    body: `No control is perfect. WAF rules get bypassed, patches lag, credentials leak, code has bugs. Defence in depth accepts that and arranges controls so that any one of them failing is survivable.

A concrete stack for a web application: a CDN absorbs volumetric attacks; a WAF blocks known payload shapes; a rate limit stops one client hammering login; an API gateway authenticates and throttles; a security group only permits the load balancer's traffic; the application uses parameterised queries; the database credentials are scoped to one schema; the data is encrypted with a revocable key; network policy stops the compromised container reaching anything else; and egress rules stop the data leaving.

An attacker has to defeat all of them. Each one is individually imperfect and the combination is genuinely hard.

The right sequencing is worth being explicit about, because layers are not equivalent. Fix the cause where you can: a WAF blocking SQL injection is protecting an application that should have used parameterised queries. The WAF is a valuable layer, not a substitute — it buys time while you fix the code, and it catches the vulnerability you have not found yet.

The layers also have very different costs. Network policy and IAM scoping are free and structural. A WAF costs money and tuning. Start with the free structural ones.`,
    keyPoints: [
      'Assume each control fails; arrange them so no single failure is total.',
      'Compensating controls buy time; they do not replace the fix.',
      'Free structural layers — IAM scoping, network policy — first.',
      'The attacker must beat every layer; you only need one to hold.',
    ],
    related: ['blast-radius', 'waf', 'network-segmentation', 'owasp-top-10'],
  },
  {
    id: 'authn-vs-authz',
    title: 'Authentication versus authorisation',
    category: 'security',
    short: 'Who are you, and what may you do. Two questions, two failure modes.',
    body: `Authentication establishes identity: a password plus a second factor, a signed token, a certificate, a cloud metadata credential. Authorisation decides what that identity may do.

They fail differently and the second failure is more common. Broken authentication is credential stuffing, session fixation, a weak reset flow. Broken authorisation is more subtle and appears at the top of every vulnerability list: the API that checks you are logged in but not that the record belongs to you, so changing the id in the URL returns someone else's data. That is an insecure direct object reference, and it is everywhere.

The practical rule: authorisation must be checked server-side on every request, against the specific resource being touched. Hiding a button is not authorisation. Checking at the gateway that a token is valid is authentication; whether *this* user may read *this* order is a question only the service holding the data can answer.

In cloud platforms the same split appears. Authentication is "this workload is the payments service"; authorisation is the IAM policy saying what that service may do. Managed identity and workload identity federation solve the first half well, which leaves the second half as the part you must get right.

Firestore security rules are a good place to see this concretely: a rule allowing any signed-in user is authentication with no meaningful authorisation.`,
    keyPoints: [
      'Authentication = who. Authorisation = what they may do.',
      'Broken object-level authorisation is the most common real vulnerability.',
      'Check ownership server-side on every request, per resource.',
      'A hidden button is not a permission check.',
    ],
    related: ['rbac', 'least-privilege', 'zero-trust', 'owasp-top-10'],
  },
  {
    id: 'rbac',
    title: 'Role-based access control',
    category: 'security',
    short: 'Grant permissions to roles, assign roles to identities, and keep both small.',
    body: `RBAC assigns permissions to named roles and then assigns roles to people and workloads. It scales better than per-identity permissions because there are far fewer roles than identities, and because a role documents an intent.

In Kubernetes there are four objects and the distinction matters. A Role grants permissions within one namespace; a ClusterRole grants them cluster-wide. A RoleBinding grants a role within a namespace; a ClusterRoleBinding grants one everywhere. Binding a ClusterRole with a RoleBinding is the useful middle case — reuse a standard role definition, scoped to one namespace.

The failure mode is universal: cluster-admin, or Owner, or Contributor at subscription scope, handed out because scoping it properly was fiddly on a Friday. One compromised CI token then owns everything. Namespace-scoped roles are what make namespaces a security boundary rather than a naming convention.

Two habits pay off. Audit what a credential can actually do rather than what you think it can (‘kubectl auth can-i --list’, IAM policy simulators, Policy Analyzer) — inherited permissions are easy to lose track of. And review role bindings periodically, because permissions accumulate and nothing ever removes them.

Some platforms add attribute-based conditions on top — tags, request context, time of day — which express policies RBAC alone cannot.`,
    keyPoints: [
      'Roles document intent and scale better than per-identity grants.',
      'In Kubernetes, ClusterRole + RoleBinding scopes a shared definition to one namespace.',
      'cluster-admin everywhere makes namespaces meaningless as a boundary.',
      'Audit effective permissions; inherited grants are invisible otherwise.',
    ],
    related: ['least-privilege', 'authn-vs-authz', 'kubernetes-architecture', 'blast-radius'],
  },
  {
    id: 'secrets-management',
    title: 'Secrets management',
    category: 'security',
    short: 'The goal is not encryption. It is that the secret never exists where it can leak.',
    body: `A secret in a repository is a published secret — history is forever, and scanners find them within minutes of a push. A secret in an environment variable is readable by anything that can read the process environment, which includes most crash reporters. A secret in a container image ships to everyone who can pull it.

A secrets manager fixes this by keeping the value outside your artefacts. The application fetches it at runtime using an identity it already has — a managed identity, an instance role, a workload identity — so there is no bootstrap credential to protect. Every access is logged, and rotation is a schedule rather than a project.

Rotation is the feature that justifies the cost. An unrotated credential leaked two years ago is still valid today. Rotation bounds the useful lifetime of a leak and, just as importantly, forces you to prove your application can survive a credential change — which most teams have never tested.

The best secret is the one that does not exist. Managed identity to reach a database, workload identity federation for CI, IAM authentication to a data store: each removes a credential entirely rather than protecting it better.

A note on Kubernetes: a Secret object is base64-encoded, not encrypted. "Can read secrets in this namespace" is equivalent to "knows every credential in it", so etcd encryption plus tight RBAC — or an external store synced in — is what makes it meaningful.`,
    keyPoints: [
      'Never in git, never in an image, and prefer not in an environment variable.',
      'Fetch at runtime using an identity the platform already provides.',
      'Rotation bounds leak lifetime and proves the app can handle a change.',
      'Kubernetes Secrets are base64, not encrypted.',
    ],
    related: ['credential-rotation', 'zero-trust', 'least-privilege', 'key-management'],
  },
  {
    id: 'credential-rotation',
    title: 'Credential rotation',
    category: 'security',
    short: 'Short-lived credentials make a leak a temporary problem instead of a permanent one.',
    body: `Every credential should have a lifetime, and shorter is better. A credential valid for an hour that leaks is a one-hour problem. A static key valid until someone remembers to delete it is a problem for years.

Modern cloud platforms mostly solve this by removing static credentials entirely. An instance profile, a managed identity or a Kubernetes service account token is issued on demand, valid for minutes to hours, and refreshed automatically. There is nothing to rotate because nothing persists.

Where a real secret is unavoidable — a database password, a third-party API key — automated rotation is the answer. The mechanics that make it non-disruptive are worth knowing: support two valid credentials during the changeover, update the store first and the consumer second, and verify before retiring the old one. Managed rotation in Secrets Manager and Key Vault implements exactly this.

The test nobody runs until it fails: does your application actually pick up a rotated credential without a restart? A secret mounted as a file usually updates; one injected as an environment variable does not. Rotating a credential your application caches forever is how rotation becomes an outage.

And when rotation is genuinely impossible, at least detect: scan repositories, alert on anomalous use, and monitor for credentials appearing in public sources.`,
    keyPoints: [
      'Prefer platform identities with no static credential at all.',
      'Rotation needs two valid credentials during the changeover.',
      'Test that the application picks up a rotated value without a restart.',
      'Env-var secrets do not refresh; mounted files usually do.',
    ],
    related: ['secrets-management', 'zero-trust', 'least-privilege'],
  },
  {
    id: 'owasp-top-10',
    title: 'The OWASP Top Ten, condensed',
    category: 'security',
    short: 'The vulnerability classes that actually appear, in rough order of frequency.',
    body: `Broken access control is consistently first. The API checks you are logged in but not that the record is yours, so changing an id in the URL returns someone else's data. Fix: authorise per resource, server-side, on every request.

Cryptographic failures: data in transit without TLS, at rest without encryption, passwords hashed with something fast rather than bcrypt or argon2. Fix: TLS everywhere, encryption on by default, a password hash designed to be slow.

Injection — SQL, command, LDAP, template. Always caused by concatenating untrusted input into something that gets interpreted. Fix: parameterised queries and safe APIs, never string building.

Insecure design: the flaw is in the requirements, not the implementation. A password reset that reveals whether an account exists cannot be patched, only redesigned.

Security misconfiguration: default credentials, verbose errors, an unnecessary management interface, a public bucket. Fix: harden by default, and scan configuration the way you scan code.

Vulnerable components: your dependencies and base images carry more known vulnerabilities than your code does. Fix: scan and update on a schedule, not on an incident.

Also present and worth naming: identification and authentication failures (weak sessions, no MFA), software and data integrity failures (unsigned artefacts, supply-chain compromise), logging failures (you cannot investigate what you did not record), and SSRF (the server fetches a URL an attacker chose).`,
    keyPoints: [
      'Broken access control is the most common, by a wide margin.',
      'Injection is always string concatenation; parameterisation is the complete fix.',
      'Most vulnerabilities in a container come from the base image.',
      'Insufficient logging means you cannot investigate what happened.',
    ],
    related: ['sql-injection', 'ssrf', 'authn-vs-authz', 'supply-chain-security'],
  },
  {
    id: 'sql-injection',
    title: 'SQL injection',
    category: 'security',
    short: 'Decades old, entirely preventable, still in production somewhere near you.',
    body: `The mechanism is always the same: user input is concatenated into a query string, so input containing SQL syntax becomes part of the query. A query built as “WHERE id = '” + input + “'”, given an input of ' OR '1'='1, returns every row.

The complete fix is parameterised queries. The driver sends the query structure and the values separately, so the database never parses user input as SQL. There is no clever input that defeats this, which is why it is a genuine fix rather than a mitigation. Every mainstream driver supports it; ORMs do it by default, right up until someone drops to raw SQL for a complex query — which is exactly where the vulnerability appears.

Input validation is defence in depth, not the fix. Blocklists of dangerous characters are always incomplete, and encoding tricks defeat them.

The layers that reduce the damage when it happens anyway: a WAF catches known payload shapes; least-privilege database credentials mean a successful injection reads less (an application account does not need DROP TABLE); and threat detection on the database flags anomalous query patterns.

The same shape of bug appears wherever input meets an interpreter — shell commands, LDAP filters, template engines, NoSQL query objects. The lesson generalises: never build an instruction by concatenating data into it.`,
    keyPoints: [
      'Parameterised queries are a complete fix, not a mitigation.',
      'ORMs protect you until someone writes raw SQL for one hard query.',
      'Validation and WAFs reduce damage; they do not fix the bug.',
      'Scope database credentials so a successful injection reaches less.',
    ],
    snippets: [{
      label: 'The only difference that matters',
      lang: 'text',
      code: `// Vulnerable — input becomes part of the query
const q = "SELECT * FROM users WHERE email = '" + email + "'"
//  email = "' OR '1'='1" →  returns every user

// Safe — structure and values travel separately
db.query('SELECT * FROM users WHERE email = $1', [email])
//  the driver never lets $1 be parsed as SQL, whatever it contains`,
    }],
    related: ['owasp-top-10', 'waf', 'least-privilege', 'trust-boundary'],
  },
  {
    id: 'ssrf',
    title: 'Server-side request forgery',
    category: 'security',
    short: 'Make the server fetch a URL, and it reaches things the attacker cannot.',
    body: `Any endpoint that fetches a user-supplied URL — a webhook registration, an image importer, a PDF renderer, a link preview — can be pointed somewhere unintended. Your server is inside the network; the attacker is not. That asymmetry is the whole vulnerability.

The canonical target in cloud environments is the instance metadata endpoint at 169.254.169.254, which hands out the machine's IAM credentials to anything on the host that asks. One "fetch this URL for me" bug becomes full use of the instance's permissions. This is exactly how several large cloud breaches happened.

The specific defence is IMDSv2 and its equivalents: metadata requests must carry a session token obtained by a PUT with a low IP hop limit, which a simple proxied GET cannot produce. Requiring it is a single setting and it closes this path. GCP and Azure have equivalent protections.

Beyond that: allow-list destination hosts rather than blocking known-bad ones (blocklists lose to alternative encodings, DNS rebinding, and redirects); resolve the hostname and validate the resulting address *after* following redirects, not just the original URL; and use egress rules so workloads cannot reach internal ranges at all.

The general principle: if user input determines where your server connects, treat it as hostile and constrain the destination explicitly.`,
    keyPoints: [
      'The metadata endpoint is the classic target; IMDSv2 closes it.',
      'Allow-list destinations; blocklists lose to encoding and redirects.',
      'Validate the resolved address after redirects, not the original URL.',
      'Egress rules stop workloads reaching internal ranges.',
    ],
    related: ['owasp-top-10', 'least-privilege-network', 'blast-radius', 'trust-boundary'],
  },
  {
    id: 'waf',
    title: 'Web application firewalls',
    category: 'security',
    short: 'Pattern-matching on requests. A useful layer, never a substitute for the fix.',
    body: `A WAF inspects the content of HTTP requests — URI, headers, body — and matches them against rules. Managed rule groups cover the well-known attack classes out of the box, and rate-based rules stop one address from hammering an endpoint.

Where it genuinely earns its place: as a virtual patch while a real fix ships, as coverage for the vulnerability you have not found yet, as bot and scraper control, and as cheap rate limiting applied before the request costs you any compute.

What it does not do: make an insecure application secure. A WAF that blocks SQL injection is protecting code that should have used parameterised queries. Bypasses for signature-based rules are a known research field, and determined attackers find them.

The operational rule that matters most: run every new rule in count or preview mode first, and read the sampled requests for a week before enforcing. Real traffic contains things that look like attacks — file uploads, rich text editors, anything with encoded content — and an untuned rule set in blocking mode rejects real customers. Blocking legitimate users is a worse outage than the attack you were preventing.

And a WAF only sees what passes through it. An origin that is still reachable directly — a public bucket, an unprotected load balancer IP — makes the WAF trivially bypassable.`,
    keyPoints: [
      'Count or preview mode first, always. Tune before enforcing.',
      'A virtual patch and a safety net, not a fix.',
      'Rate-based rules are the highest-value single rule you can write.',
      'Keep origins private or the WAF is bypassed by going around it.',
    ],
    related: ['owasp-top-10', 'rate-limiting', 'defence-in-depth', 'ddos-mitigation'],
  },
  {
    id: 'rate-limiting',
    title: 'Rate limiting',
    category: 'security',
    short: 'A cap on how fast one client may consume your capacity.',
    body: `Rate limiting protects against abuse and against accidents in equal measure: credential stuffing, scraping, application-layer floods, and the customer whose retry loop has a bug. It is simultaneously a security control and a capacity control.

Where you apply it decides what it costs you. At the CDN or edge, a rejected request never touches your infrastructure — this is by far the cheapest place. At the API gateway, it protects your compute. In the application, you have already spent the resources deciding to reject it.

What you key on decides whether it works. Per IP address is simple and breaks for users behind shared NAT while doing little against a distributed attack. Per API key or account is fairer and requires the caller to be identified. Per endpoint matters because a login endpoint and a static asset deserve very different limits.

Two implementation notes. A token bucket allows short bursts while enforcing a sustained rate, which matches how real clients behave better than a fixed window does. And always return 429 with a Retry-After header — a client that knows when to come back retries politely; one that does not retries immediately and makes things worse.

Set limits generously enough that no legitimate user notices, and specifically enough that the login endpoint is not governed by the same number as your image CDN.`,
    keyPoints: [
      'Rejecting at the edge costs nothing; rejecting in the app costs everything up to that point.',
      'Key on identity where you can; IP alone is crude in both directions.',
      'Token buckets permit bursts while capping sustained rate.',
      'Return 429 with Retry-After so clients back off correctly.',
    ],
    related: ['backpressure', 'waf', 'ddos-mitigation', 'api-gateway-pattern'],
  },
  {
    id: 'ddos-mitigation',
    title: 'DDoS mitigation',
    category: 'security',
    short: 'Two very different attacks with two very different defences.',
    body: `Volumetric attacks at layers 3 and 4 try to saturate your capacity with sheer packet volume, often amplified by reflecting off open UDP services that reply with far more data than they receive. The only workable defence is having more capacity than the attacker, which is why the answer is architectural: serve through a CDN or global edge network so the flood lands on their absorption capacity rather than your origin. Every major provider absorbs common floods for all customers at no cost; paid tiers add tuning, response support and billing protection.

Application-layer attacks at layer 7 are the opposite shape. A few thousand well-chosen requests per second — a search with no cache key, a report generation, a login that hashes a password — can exhaust you while looking like ordinary traffic. Volume-based detection misses them entirely. The defences are rate limiting per client, bot detection and challenges, caching so repeated expensive requests are free, and autoscaling with a ceiling so you degrade rather than collapse.

The mistake that undoes all of it: putting a CDN in front while leaving the origin publicly reachable. An attacker who finds the origin address simply bypasses everything. Lock origins to accept traffic only from the edge — via private link, a shared secret header, or address allow-listing.

And decide in advance what you will shed. During an attack, serving your paying customers and rejecting everything else is a good outcome.`,
    keyPoints: [
      'Volumetric: absorb at a network larger than the attacker\'s. That means the edge.',
      'Application-layer: rate limit, challenge, cache, and cap autoscaling.',
      'A reachable origin makes the edge protection pointless.',
      'Plan which traffic you will shed before you need to.',
    ],
    related: ['cdn', 'rate-limiting', 'waf', 'backpressure'],
  },
  {
    id: 'lateral-movement',
    title: 'Lateral movement',
    category: 'security',
    short: 'What happens after the first compromise, and how far it gets.',
    body: `Attackers rarely land where they want to end up. They compromise something peripheral — a container running an outdated dependency, a leaked CI token, a misconfigured test service — and then move toward what matters.

The moves are predictable. Scan the internal network for reachable services, because a flat network makes everything reachable. Read credentials from disk, environment variables, or the instance metadata endpoint. Use those credentials to reach a data store or assume another role. Repeat.

The controls that stop it map one-to-one onto those steps. Network segmentation means the scan finds almost nothing — this is the single highest-value control in a Kubernetes cluster, where the default is that every Pod can reach every other Pod. Least-privilege IAM means stolen credentials unlock very little. Short-lived credentials mean a captured token expires before it is useful elsewhere. IMDSv2 means an SSRF bug cannot read the instance role.

Detection matters too, because prevention is never complete. Flow logs record what talked to what — without them, "did the compromised host reach the database" is unanswerable. Alert on unusual internal connections and on credentials being used from unexpected places.

The design question is the blast radius one: if this container is fully owned, what is the complete list of what it can reach? Answer it before an attacker does.`,
    keyPoints: [
      'Scan, steal credentials, escalate, repeat — the sequence is predictable.',
      'Kubernetes allows all Pod-to-Pod traffic by default; a NetworkPolicy is the fix.',
      'Short-lived credentials shrink the window; scoped ones shrink the reach.',
      'Flow logs are what make the investigation possible at all.',
    ],
    related: ['network-segmentation', 'blast-radius', 'least-privilege', 'ssrf'],
  },
  {
    id: 'data-exfiltration',
    title: 'Data exfiltration',
    category: 'security',
    short: 'Getting in is half the attack. Getting the data out is the other half.',
    body: `Most networks control inbound traffic carefully and allow outbound to anywhere. That asymmetry is exactly what makes the exfiltration step easy: once an attacker can read your data, sending it somewhere is usually unimpeded.

The paths are varied. A direct upload to the attacker's object storage. A DNS tunnel, because port 53 is almost always permitted. A legitimate-looking API call to a service you already allow. Or simply making a storage bucket public and walking away.

The controls, roughly in order of value. Egress filtering so workloads reach only approved destinations — the control almost nobody configures until after an incident. Private endpoints with restrictive policies, so an endpoint to object storage cannot reach an arbitrary account's bucket. Customer-managed encryption keys, so exported data is unreadable without a key you can revoke. And monitoring on outbound volume, because a sudden large transfer to an unfamiliar destination is one of the more reliable detection signals available.

Add the preventive layer: make the data harder to over-read in the first place. Scoped credentials, row-level access, tokenised or redacted sensitive fields. An identity that can only read one tenant's records can only exfiltrate one tenant's records.

The realistic framing: assume someone will eventually have read access they should not. What stops the data leaving?`,
    keyPoints: [
      'Outbound is unrestricted by default nearly everywhere.',
      'Endpoint policies stop a private endpoint reaching anyone\'s bucket.',
      'Customer-managed keys make exported data useless without the key.',
      'Anomalous outbound volume is a strong detection signal.',
    ],
    related: ['least-privilege-network', 'private-connectivity', 'encryption-at-rest', 'lateral-movement'],
  },
  {
    id: 'ransomware-resilience',
    title: 'Ransomware resilience',
    category: 'security',
    short: 'Whether you recover was decided months before the attack.',
    body: `Modern ransomware operations do not encrypt immediately. They dwell — often for weeks — and spend that time finding and destroying backups, because a victim who can restore does not pay. By the time encryption starts, the recovery options have usually already been removed.

That changes what "having backups" has to mean. Immutable backups that cannot be deleted or altered for a retention period, even by an administrator, are the control that works: object lock, retention policies, vault lock. If a sufficiently privileged credential can delete the backup, assume the attacker will have that credential.

Second: isolation. Backups in a separate account or subscription, with separate credentials and no trust path from production. Compromising production must not grant access to the backups.

Third: retention longer than a plausible dwell time. Thirty days of backups is no help against an attacker who was inside for sixty — every copy you hold is already poisoned.

Fourth, and the one most often skipped: a tested restore, with a measured elapsed time. A backup nobody has restored is a hypothesis.

Then the prevention layers that shrink the odds: MFA everywhere, least privilege so one compromise is not total, network segmentation to slow spread, endpoint detection, and patching the internet-facing things first.`,
    keyPoints: [
      'Attackers destroy backups before encrypting. Immutability is the answer.',
      'Backups belong in a separate account with separate credentials.',
      'Retention must exceed plausible dwell time, or every copy is poisoned.',
      'Measure a real restore. An untested backup is not a plan.',
    ],
    related: ['data-durability', 'rpo-rto', 'blast-radius', 'least-privilege'],
  },
  {
    id: 'supply-chain-security',
    title: 'Supply chain security',
    category: 'security',
    short: 'Your build pulls code from strangers and signs it with your name.',
    body: `Your application is mostly other people's code. A typical container image carries hundreds of packages and an operating system layer, and your build pipeline pulls all of it from the internet, assembles it and deploys it. Nothing in your own repository has to look wrong for the result to be malicious.

The attack surface is broad: a compromised package or a typosquatted name, a base image with a backdoor, a compromised build tool, or a compromised pipeline identity that can deploy directly.

The defences that matter most. Pin by digest, not by tag — a tag is a mutable pointer, a digest is content, and "what is actually running" should have a definite answer. Use a lockfile and commit it. Scan images and dependencies continuously and act on findings; most vulnerabilities in a container come from the base image, so a base image rebuild often clears dozens at once. Keep base images minimal — distroless or Alpine have far less to be vulnerable.

Then protect the pipeline itself, because it is the highest-value target in the organisation. It can deploy to production, so it needs the narrowest possible permissions, no long-lived credentials (workload identity federation), and required review on the pipeline definition as well as on the code.

Artefact signing and provenance attestations close the loop: verify at deploy time that what you are running came from your pipeline, from your source.`,
    keyPoints: [
      'Pin by digest; a tag can point anywhere tomorrow.',
      'Most container vulnerabilities come from the base image — keep it minimal and rebuild.',
      'The pipeline can deploy to production; treat its identity accordingly.',
      'Sign artefacts and verify provenance at deploy time.',
    ],
    related: ['ci-cd', 'immutable-infrastructure', 'least-privilege', 'containers'],
  },
  {
    id: 'subdomain-takeover',
    title: 'Subdomain takeover',
    category: 'security',
    short: 'A DNS record pointing at something you deleted is a gift to whoever claims it next.',
    body: `You create a bucket or an app service, point a CNAME at its provider-assigned name, and later delete the resource. The DNS record stays. Provider resource names are globally unique but reusable, so anyone can create a resource with that same name — and now they serve content from your subdomain.

The consequences are worse than they first appear. They can obtain a valid TLS certificate for your subdomain, because they genuinely control what it points to. They can receive cookies scoped to your parent domain. They can host convincing phishing on a name your users trust, and they can sometimes bypass same-origin protections.

The cause is always the same: DNS records outliving the resources they point to. The fix is process. Delete the record as part of deleting the resource, ideally by managing both in the same infrastructure-as-code stack so they are destroyed together. Audit for dangling records — several open-source tools resolve every record in a zone and flag those pointing at unclaimed provider names. And subscribe to certificate transparency monitoring for your domains, so a certificate issued for a name you did not request raises an alert.

This is a good example of a vulnerability class that is entirely an operational hygiene problem: no code is insecure, nothing was misconfigured, something was simply left behind.`,
    keyPoints: [
      'Provider resource names are reusable; your DNS record is not exclusive.',
      'The attacker gets a valid certificate, because they really do control the target.',
      'Manage DNS and the resource in the same stack so they are destroyed together.',
      'Audit for dangling records and monitor certificate transparency.',
    ],
    related: ['dns-resolution', 'certificate-lifecycle', 'pki'],
  },
  {
    id: 'stateful-vs-stateless-firewall',
    title: 'Stateful versus stateless filtering',
    category: 'security',
    short: 'One remembers the connection; the other sees each packet alone.',
    body: `A stateful firewall tracks connections. Allow an inbound connection and the reply is permitted automatically, because the firewall knows it belongs to a conversation you already approved. Security groups, Azure NSGs and GCP firewall rules all work this way, which is why you almost never write outbound rules for replies.

A stateless filter evaluates each packet in isolation. It has no idea a packet is a reply, so you must explicitly allow the return traffic — and because clients use random high-numbered source ports, that means allowing the ephemeral range 1024–65535. Forgetting this is one of the most confusing failures in networking: connections simply hang with no error and no log line, because the outbound packet left and the reply was silently dropped. AWS network ACLs are the common example.

So use each for what it is good at. Stateful rules are your everyday access control — they are easier to reason about and harder to get subtly wrong. Stateless filters are for coarse, subnet-wide blocks, particularly the thing security groups cannot express at all: an explicit deny for a known-bad range.

Two operational notes. Rules in a stateless ACL are evaluated in number order and the first match wins, so leave gaps for insertions. And where filters exist at both the subnet and the interface level, traffic must pass both — use the provider's "effective rules" view rather than reasoning about it.`,
    keyPoints: [
      'Stateful: replies are implicitly allowed. Stateless: they are not.',
      'Missing ephemeral ports in a stateless rule makes connections hang silently.',
      'Security groups cannot express deny; that is what a stateless ACL is for.',
      'When both layers apply, use the effective-rules view.',
    ],
    related: ['least-privilege-network', 'network-isolation', 'osi-model'],
  },
  {
    id: 'pki',
    title: 'Public key infrastructure',
    category: 'security',
    short: 'A chain of signatures ending at something your device already trusts.',
    body: `Your operating system and browser ship with a list of trusted root certificate authorities. A server presents a certificate signed by an intermediate, which is signed by a root on that list. Following the chain to a trusted root, and confirming the certificate covers the name you asked for and has not expired, is what validation means.

Domain validation proves you control the name, and is now fully automated — publish a DNS record or answer an HTTP challenge and a certificate is issued in seconds, free. That automation is why HTTPS became universal.

Internal PKI is the same structure with your own root. A private CA issues certificates for internal services, and every workload trusts your root. Service meshes use this to give each workload a certificate identity and negotiate mutual TLS automatically, which is what makes identity in a mesh cryptographic rather than based on IP address.

Two things to keep in view. Certificate transparency logs record every publicly issued certificate, so monitoring them tells you when someone obtains a certificate for your domain — one of the few ways to detect a subdomain takeover or a registrar compromise early. And certificate lifetimes keep getting shorter, which is deliberate: short lifetimes limit the damage of a key compromise and force the automation that makes expiry a non-event.`,
    keyPoints: [
      'Validation is a chain of signatures ending at a pre-trusted root.',
      'Domain validation is automated and free, which is why HTTPS is universal.',
      'Internal PKI plus a mesh gives workloads cryptographic identity.',
      'Certificate transparency monitoring detects certificates you did not request.',
    ],
    related: ['tls-handshake', 'certificate-lifecycle', 'zero-trust', 'subdomain-takeover'],
  },
  {
    id: 'certificate-lifecycle',
    title: 'Certificate lifecycle',
    category: 'security',
    short: 'Expiry is a scheduled outage nobody scheduled.',
    body: `A certificate expires at a specific moment, and when it does every client fails at once. There is no gradual degradation and no partial failure — browsers show a full-page interstitial, API clients throw, mobile apps stop working. It is one of the most predictable and most common self-inflicted outages there is.

The fix is automation end to end. Use DNS validation, which renews without human involvement, and leave the validation record in place forever — removing it does nothing today and quietly breaks renewal thirteen months later. Use managed certificates (ACM, Google-managed, Key Vault) or cert-manager in Kubernetes. Then alarm on days-to-expiry as a backstop, because automation also fails and you want to know weeks early rather than at the moment of expiry.

Certificate lifetimes are shrinking across the industry, which makes manual renewal steadily less viable and automation steadily more necessary. That is the intent.

Provider-specific things that catch people. A certificate for CloudFront must be issued in us-east-1 regardless of where everything else lives. ACM certificates cannot be exported, so they only work with services that integrate with ACM. And in Kubernetes, cert-manager needs its issuer configured and its challenge path reachable, or certificates silently stay pending.

Finally: monitor from outside. Check the certificate the way a user sees it, not the way your configuration claims it is.`,
    keyPoints: [
      'Expiry fails every client simultaneously, with no warning.',
      'DNS validation renews automatically — leave the validation record in place.',
      'Alarm on days-to-expiry as a backstop for the automation.',
      'CloudFront certificates must live in us-east-1.',
    ],
    related: ['tls-handshake', 'pki', 'incident-response', 'alerting'],
  },
  {
    id: 'compliance',
    title: 'Compliance, practically',
    category: 'security',
    short: 'Mostly a demand for evidence that you already do sensible things.',
    body: `SOC 2, ISO 27001, PCI DSS, HIPAA and GDPR differ in scope but overlap heavily in what they ask for: access control, encryption, logging and monitoring, change management, backup and recovery, vendor management, and incident response.

The realisation that makes compliance tractable is that these are the same practices that make a system reliable and secure. Least privilege, encryption at rest and in transit, audit logs with meaningful retention, reviewed changes, tested restores. If you do those, compliance is largely a documentation and evidence exercise rather than new engineering.

What genuinely does change the architecture: data residency, which constrains regions; retention requirements, which set log and backup lifetimes; separation of duties, which means the person who writes the code is not the person who approves the production deploy; and audit trails that must be tamper-evident, which means append-only or immutable log storage.

Cloud providers do a lot of the work through the shared responsibility model — they certify the infrastructure, you are responsible for what you build on it. Their compliance programmes cover the datacentre, not your IAM policy.

The practical advice: encode controls as infrastructure-as-code policy checks rather than as a document nobody reads. A rule that fails a pull request is a control; a paragraph in a wiki is an intention.`,
    keyPoints: [
      'The frameworks overlap on access, encryption, logging, change and recovery.',
      'Good engineering practice satisfies most of it; the gap is evidence.',
      'Residency, retention and separation of duties genuinely change design.',
      'Encode controls as automated policy checks, not as documents.',
    ],
    related: ['encryption-at-rest', 'key-management', 'observability', 'least-privilege'],
  },
]
