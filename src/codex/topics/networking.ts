import type { Concept } from '../types'

export const networking: Concept[] = [
  {
    id: 'osi-model',
    title: 'The OSI model, and the four layers you actually use',
    category: 'networking',
    short: 'Seven layers exist on paper. In cloud work you touch three of them constantly.',
    widget: 'osi',
    body: `The OSI model splits networking into seven layers so that each one can change without the others caring. Ethernet at layer 2 can be replaced by Wi-Fi without TCP noticing; HTTP at layer 7 can become HTTP/3 without your router noticing. That independence is the whole point.

In practice, cloud engineering happens at four of them. Layer 3 is IP: addresses, routes, subnets, and the reason a packet can find its way from your laptop to a machine in Virginia. Layer 4 is TCP and UDP: ports, connections, and the handshake that makes a stream reliable. Layer 7 is HTTP and its relatives: URLs, headers, status codes, and everything a person would recognise as "the request".

Why it matters practically: it tells you what each piece of your infrastructure can possibly know. A network load balancer works at layer 4, so it sees an address and a port and nothing else — it cannot route by URL path because it never parses one. An application load balancer works at layer 7, so it can read the Host header and the path, but pays the cost of terminating and re-establishing connections. A security group filters by address and port, which is layer 3 and 4; a WAF inspects request bodies, which is layer 7. When someone asks "why can't the NLB do path-based routing?", the answer is always the layer.`,
    keyPoints: [
      'Layer 3 = IP addresses and routing. Layer 4 = TCP/UDP ports and connections. Layer 7 = HTTP and application protocols.',
      'A component can only filter or route on information from the layer it operates at.',
      'L4 load balancers are faster and dumber; L7 load balancers are slower and can read your request.',
      'Volumetric DDoS attacks live at layers 3 and 4; application floods and injection live at layer 7.',
    ],
    related: ['load-balancing', 'tcp-handshake', 'tls-handshake', 'stateful-vs-stateless-firewall'],
  },
  {
    id: 'cidr-subnetting',
    title: 'CIDR and subnetting',
    category: 'networking',
    short: 'The slash number is how many bits are fixed. Everything else follows from that.',
    widget: 'cidr',
    body: `An IPv4 address is 32 bits. CIDR notation writes a range as an address plus how many of those bits are fixed: 10.0.0.0/16 means the first 16 bits are the network and the remaining 16 are free for hosts, giving 65,536 addresses. Each extra bit in the prefix halves the range, so a /17 is half a /16, and a /24 is 256 addresses.

The arithmetic worth memorising: /24 is 256, /20 is 4,096, /16 is 65,536. Cloud providers reserve some addresses in every subnet — AWS takes five, Azure takes five, GCP takes four — so a /28 gives you eleven usable hosts, not sixteen. That catches everyone once.

The decision that actually matters is the one you make first. A VPC's primary range is effectively permanent, and two networks with overlapping ranges can never be peered. Pick from RFC 1918 space deliberately: 10.0.0.0/8 gives you the most room, 172.16.0.0/12 is the middle option, and 192.168.0.0/16 is small enough that home routers already use it, which makes VPN conflicts likely. Leave generous gaps between environments, and size subnets for Kubernetes before you need Kubernetes — with the AWS VPC CNI every Pod consumes a real subnet address, and a /24 runs out at around 250 Pods.`,
    keyPoints: [
      'A smaller slash number means a bigger range. /16 is 65,536 addresses; /24 is 256.',
      'Cloud providers reserve four or five addresses in every subnet.',
      'Overlapping CIDR ranges make peering impossible, and you find out years later.',
      'Kubernetes with a VPC-native CNI consumes one subnet address per Pod. Size for it early.',
    ],
    snippets: [{
      label: 'Working it out',
      lang: 'text',
      code: `10.0.0.0/16     →  10.0.0.0   – 10.0.255.255   (65,536 addresses)
  10.0.0.0/20   →  10.0.0.0   – 10.0.15.255    ( 4,096)
  10.0.16.0/20  →  10.0.16.0  – 10.0.31.255    ( 4,096)
  10.0.32.0/20  →  10.0.32.0  – 10.0.47.255    ( 4,096)

A typical three-zone layout inside one /16:
  public   10.0.0.0/20,  10.0.16.0/20,  10.0.32.0/20
  private  10.0.64.0/20, 10.0.80.0/20,  10.0.96.0/20
  data     10.0.128.0/22, 10.0.132.0/22, 10.0.136.0/22

…and half the /16 still free for whatever you have not thought of.`,
    }],
    related: ['vpc-design', 'public-vs-private-subnet', 'network-isolation'],
  },
  {
    id: 'public-vs-private-subnet',
    title: 'What actually makes a subnet public',
    category: 'networking',
    short: 'The route table. Nothing else. There is no "public" checkbox.',
    body: `A subnet is public if its route table sends 0.0.0.0/0 to an internet gateway. It is private if that route points at a NAT gateway instead — outbound works, inbound does not. It is isolated if there is no default route at all, so nothing reaches the internet in either direction.

That is the entire distinction. Two subnets with identical CIDR sizes, identical security groups and identical names differ only by where their default route points. This is worth internalising because it reframes the question: "is this resource exposed?" becomes "what does its subnet's route table say, and does it have a public IP?"

The standard three-tier layout follows directly. Public subnets hold only the things that must be reachable — load balancers, NAT gateways, bastion hosts. Private subnets hold your application tier, which needs to pull packages and call APIs but should never accept an inbound connection from outside. Isolated subnets hold your databases, which need neither.

Azure inverts one default worth knowing: outbound internet access exists unless you remove it, rather than existing only when you add a NAT gateway. That implicit access is being retired, so attach a NAT gateway explicitly rather than depending on it.`,
    keyPoints: [
      'Public = default route to an internet gateway. Private = default route to a NAT gateway. Isolated = no default route.',
      'An instance needs three things to be reachable: a public IP, a route to the gateway, and a permitting firewall rule.',
      'Databases belong in isolated subnets. They need no internet access in either direction.',
      'NAT gateways live in public subnets; private subnets route to them.',
    ],
    related: ['cidr-subnetting', 'nat-vs-igw', 'network-isolation', 'trust-boundary'],
  },
  {
    id: 'nat-vs-igw',
    title: 'NAT gateway versus internet gateway',
    category: 'networking',
    short: 'One lets traffic in and out; the other only lets it out.',
    body: `An internet gateway is a two-way door. It allows traffic between your network and the internet in both directions, and performs one-to-one address translation for resources that hold a public IP. It is free, horizontally scaled, and does nothing at all until a route points at it.

A NAT gateway is a one-way door. Resources in a private subnet send traffic through it to reach the internet; the gateway rewrites the source address to its own, and replies come back through the same mapping. Nothing on the internet can initiate a connection inward, because there is no mapping until you create one by going out.

The practical differences are cost and failure domain. An internet gateway is free; a NAT gateway costs roughly $33 a month plus a per-gigabyte processing charge, which adds up surprisingly fast when your deploys pull container images through it. And a NAT gateway lives in exactly one availability zone — if that zone fails, outbound internet stops for everything routing through it, even though your compute is spread across three zones. One NAT gateway per zone costs three times as much and removes that failure mode.

The cost lever most people miss: VPC endpoints for S3 and DynamoDB are free gateway endpoints that keep that traffic off the NAT entirely.`,
    keyPoints: [
      'Internet gateway: bidirectional, free, one per VPC.',
      'NAT gateway: outbound only, billed hourly and per GB, scoped to one availability zone.',
      'A single NAT gateway is a zone-scoped single point of failure for your entire private tier.',
      'Gateway VPC endpoints for object storage are free and remove a large NAT bill.',
    ],
    related: ['public-vs-private-subnet', 'private-connectivity', 'cost-optimisation'],
  },
  {
    id: 'dns-resolution',
    title: 'How a name becomes an address',
    category: 'networking',
    short: 'Every request starts with a lookup, and caching makes the result slow to change.',
    widget: 'dns-walk',
    body: `When a browser needs app.example.com, it asks a recursive resolver — usually your ISP's, or 8.8.8.8, or one your network hands you. If the resolver does not already have the answer cached, it walks down the hierarchy: a root server says who is authoritative for .com, the .com servers say who is authoritative for example.com, and that authoritative server finally returns the address record.

Each answer comes with a TTL, and every resolver along the way is allowed to cache it for that long. This is what makes DNS fast and also what makes it slow to change. If you publish a record with a one-hour TTL and then need to fail over, some users keep hitting the dead address for up to an hour, and there is nothing you can do about it — you cannot retroactively shorten a TTL that has already been handed out. Lower the TTL days before a planned migration, not during it.

Two consequences shape real architectures. DNS-based failover is inherently slow and partial, which is why global anycast load balancers — a single address announced from many locations — have become the preferred way to move traffic between regions. And a DNS record left pointing at a deleted resource is a subdomain takeover waiting to happen: whoever claims that resource name next can serve content from your domain.`,
    keyPoints: [
      'Resolution walks root → TLD → authoritative, and every step can be cached.',
      'TTL is how long a change takes to reach everyone. It cannot be shortened retroactively.',
      'DNS failover is slow and partial; anycast load balancing moves traffic instantly.',
      'Delete DNS records when you delete the resource, or someone else can claim the name.',
    ],
    snippets: [{
      label: 'Seeing it happen',
      lang: 'bash',
      code: `dig +trace app.example.com     # walk the delegation yourself
dig app.example.com +noall +answer   # the TTL counting down
dig @8.8.8.8 app.example.com   # what a public resolver has cached
dig app.example.com CNAME      # is this an alias, and to what?`,
    }],
    related: ['ttl-and-caching', 'subdomain-takeover', 'anycast', 'multi-region'],
  },
  {
    id: 'ttl-and-caching',
    title: 'TTL: the number that decides how long a mistake lasts',
    category: 'networking',
    short: 'Caching trades freshness for speed, and TTL is where you set the exchange rate.',
    body: `Every cache — DNS resolvers, CDN edges, browsers, your application's own memory — holds a copy of something for a while. TTL is how long. A short TTL means changes propagate quickly and you pay for more lookups. A long TTL means excellent performance and a change that takes as long as the TTL to be universally visible.

The asymmetry that catches people is that you can raise a TTL instantly and lower it only slowly. Raising it affects the next answer you give. Lowering it does nothing for answers already cached at the old value — you have to wait out the old TTL before the new one takes effect. This is why "lower the TTL a few days before the migration" is standard practice and why doing it during the incident does not help.

For HTTP the equivalent lever is Cache-Control, and the modern pattern is worth knowing: cache fingerprinted assets forever with ‘immutable’, since a new build produces a new filename that nobody has cached; revalidate HTML on every request so a deploy is visible immediately; and use ‘stale-while-revalidate’ for the middle ground, where the cache serves the old copy instantly and fetches a fresh one in the background.`,
    keyPoints: [
      'Raising a TTL takes effect immediately; lowering it takes one full old-TTL period.',
      'Fingerprint asset filenames and cache them forever. Never cache HTML for long.',
      'stale-while-revalidate serves fast and fresh at the same time.',
      'Add jitter to TTLs so a batch of keys written together does not expire together.',
    ],
    related: ['dns-resolution', 'caching', 'cache-invalidation', 'thundering-herd'],
  },
  {
    id: 'tcp-handshake',
    title: 'The TCP handshake, and why connections cost something',
    category: 'networking',
    short: 'Three packets before a single byte of your data moves.',
    widget: 'tcp-handshake',
    body: `TCP is connection-oriented, which means both ends agree to talk before any data flows. The client sends SYN, the server replies SYN-ACK, the client sends ACK. That is one full round trip before the request is even sent — and if the server is on another continent, that round trip is 140 milliseconds you have spent on nothing.

Add TLS and it gets more expensive: TLS 1.2 needs two more round trips, TLS 1.3 needs one, and session resumption can get it to zero for a returning client. This is the entire argument for connection reuse. HTTP keep-alive, connection pools, and HTTP/2 multiplexing all exist to amortise that setup cost across many requests.

It also explains two things that look unrelated. Why a CDN helps even for content it cannot cache: the expensive handshakes happen against an edge node a few milliseconds away, and the connection from edge to origin is already warm. And why a Lambda that opens a fresh database connection on every invocation is so much slower than one that reuses a pooled connection — it is paying the handshake every time.

UDP skips all of this, which is why it is fast, unreliable, and the preferred vehicle for amplification attacks: there is no handshake to prove the sender's address is real.`,
    keyPoints: [
      'SYN, SYN-ACK, ACK — one round trip before any data.',
      'TLS adds one more round trip (1.3) or two (1.2) on top.',
      'Connection reuse and keep-alive exist to amortise that cost.',
      'UDP has no handshake, which makes source addresses trivially forgeable.',
    ],
    related: ['tls-handshake', 'latency-budget', 'connection-pooling', 'osi-model'],
  },
  {
    id: 'tls-handshake',
    title: 'TLS: what the padlock actually proves',
    category: 'networking',
    short: 'Identity first, then encryption. The certificate is about the first part.',
    widget: 'tls-handshake',
    body: `TLS does two jobs and people usually only think about the second. First it authenticates: the server presents a certificate signed by a certificate authority your device already trusts, proving it controls the name you asked for. Then it encrypts: the two sides agree on a session key and everything after that is unreadable in transit.

The authentication half is what makes the encryption meaningful. Encrypting a conversation with an attacker is not security. That is why certificate validation errors are full-page browser interstitials rather than small warnings, and why a certificate is scoped to specific names.

Operationally, the thing that breaks is expiry. A certificate has a fixed lifetime — now typically around 90 days for automated issuers, and the industry is moving shorter — and when it passes, every client fails simultaneously. It is a scheduled outage that nobody scheduled. The fix is entirely automation: DNS-validated certificates that renew themselves, cert-manager in Kubernetes, and an alarm on days-to-expiry as a backstop.

Where you terminate TLS is an architectural choice. Terminating at the edge (CDN, load balancer) is fastest and lets your WAF read the request. Terminating at the workload means traffic is encrypted end to end, which some compliance regimes require. Doing both — terminate at the edge, re-encrypt to the backend — is the common compromise.`,
    keyPoints: [
      'TLS authenticates the server first, then encrypts. The certificate is about authentication.',
      'Expiry is a total, simultaneous outage. Automate renewal; alarm as a backstop.',
      'Terminating at the edge is faster and lets the WAF inspect; end-to-end satisfies stricter requirements.',
      'A certificate for CloudFront must be issued in us-east-1, regardless of where anything else is.',
    ],
    related: ['certificate-lifecycle', 'pki', 'tls-termination', 'tcp-handshake'],
  },
  {
    id: 'tls-termination',
    title: 'Where to terminate TLS',
    category: 'networking',
    short: 'Decrypt at the edge for speed and inspection, or end-to-end for strict isolation.',
    body: `Terminating TLS means decrypting the connection. Whoever does it can read the request — which is exactly what a WAF, a path-based router and a cache all need to do their jobs.

Terminate at the edge and you get the fastest handshake (the client's round trip is to a nearby PoP, not to your origin), full layer 7 routing, WAF inspection, and one certificate to manage. Traffic from the edge to your origin then travels over the provider's backbone, usually re-encrypted but with a certificate you control rather than a public one.

Terminate at the workload and nothing between the client and your code can read the traffic. Some regulated environments require this. The costs are real: no path-based routing, no WAF, no caching, and certificate management multiplied across every service.

The middle path — terminate at the edge, re-encrypt to the backend — is what most production systems do. You keep inspection and routing while nothing travels in plain text, even inside your own network. In Kubernetes a service mesh takes this further with automatic mutual TLS between every Pod, so identity is cryptographic rather than network-based.`,
    keyPoints: [
      'Whoever terminates TLS can read the request; everything else follows from that.',
      'Edge termination gives routing, caching and WAF inspection.',
      'Re-encrypting to the backend keeps traffic off the wire in plain text without losing inspection.',
      'Mutual TLS in a mesh makes identity cryptographic instead of positional.',
    ],
    related: ['tls-handshake', 'waf', 'load-balancing', 'zero-trust'],
  },
  {
    id: 'load-balancing',
    title: 'Load balancing',
    category: 'networking',
    short: 'Spreading traffic is the obvious part. Removing sick instances is the valuable part.',
    body: `A load balancer distributes requests across several backends. That much is obvious. The part that turns a group of servers into a service is the health check: the balancer continually asks each backend whether it is well, and stops sending traffic to any that are not. Without that, one bad instance keeps receiving a share of every request forever.

Layer matters. An L7 balancer parses HTTP, so it can route by hostname and path, terminate TLS, rewrite headers, and health-check by requesting a URL and reading the status code. An L4 balancer forwards TCP connections without inspecting them, which makes it dramatically faster at high throughput and useless for anything that requires reading the request.

Algorithm matters less than people think, but not nothing. Round robin assumes every request costs the same. Least-outstanding-requests adapts when some requests are slow or some backends are struggling, which usually improves tail latency on mixed workloads. Sticky sessions pin a client to one backend — a workaround for in-memory session state that unbalances load and loses sessions when a backend dies.

The subtle trap is the health check itself. A shallow check ("is the process alive?") belongs on the load balancer. A deep check that verifies the database means a database blip pulls every backend out of rotation at once, turning a degraded service into a complete outage.`,
    keyPoints: [
      'Health checks, not distribution, are what make a load balancer valuable.',
      'L7 can route on paths and headers; L4 is faster and sees only addresses and ports.',
      'Least-outstanding-requests beats round robin when request costs vary.',
      'Never health-check your dependencies from the load balancer, or one failure removes every backend.',
    ],
    related: ['health-checks', 'osi-model', 'tls-termination', 'self-healing'],
  },
  {
    id: 'anycast',
    title: 'Anycast: one address, many locations',
    category: 'networking',
    short: 'The same IP announced from everywhere, so the network routes each user to their nearest copy.',
    body: `With anycast, the same IP address is advertised from many locations at once, and the internet's own routing sends each packet to whichever announcement is closest. A user in Sydney and a user in Dublin use the identical address and reach entirely different datacentres.

This changes what failover looks like. DNS-based failover requires changing a record and waiting for caches to expire, which is minutes to hours and never reaches everyone at once. With anycast, withdrawing an announcement reroutes traffic in seconds, at the network layer, with no client involvement at all. Google's global load balancer works this way, as do CDNs and most large DNS providers.

It is also the standard defence against volumetric attacks. A flood aimed at an anycast address is split across every location announcing it, so a terabit attack becomes many manageable fractions rather than one saturated link.

The trade-off is that anycast suits stateless, short-lived requests. A long-lived connection can in principle be rerouted mid-flight if routing changes, which is why anycast is ubiquitous for DNS and HTTP and rare for stateful protocols.`,
    keyPoints: [
      'One address announced from many places; the network picks the nearest.',
      'Failover happens in seconds at the routing layer, with no DNS propagation.',
      'Distributes volumetric attacks across every location automatically.',
      'Best suited to stateless request/response protocols.',
    ],
    related: ['dns-resolution', 'multi-region', 'ddos-mitigation', 'cdn'],
  },
  {
    id: 'cdn',
    title: 'Content delivery networks',
    category: 'networking',
    short: 'Serve from near the user, and keep the flood away from your origin.',
    body: `A CDN puts caching servers in hundreds of locations and serves each user from the nearest one. For cacheable content the request never reaches your infrastructure at all, which is simultaneously a latency improvement, a capacity multiplier and a cost reduction.

Cache hit ratio is the only number that matters. At 95% hits, your origin sees one request in twenty and a traffic spike is a non-event. At 5% hits, the CDN is an expensive extra hop. What destroys hit ratio is cache key bloat: every header, cookie and query parameter you include in the key multiplies the number of distinct cached objects, and forwarding everything means nearly every request is unique.

CDNs help even for content they cannot cache. TLS terminates at an edge node milliseconds away instead of across an ocean, and the connection from edge to origin runs over the provider's private backbone rather than the public internet.

The security benefit is equally large and often the real reason to adopt one. A volumetric attack lands on the CDN's globally distributed capacity rather than your origin — provided your origin address is not publicly reachable. A CDN in front of an origin that anyone can still hit directly has protected nothing.`,
    keyPoints: [
      'Cache hit ratio is the whole game; cache key bloat is what destroys it.',
      'Version asset filenames so a deploy changes the URL — invalidation is a fallback, not a strategy.',
      'CDNs help uncacheable traffic too, by terminating TLS near the user.',
      'Keep origins private, or the CDN and its WAF are trivially bypassed.',
    ],
    related: ['caching', 'ttl-and-caching', 'ddos-mitigation', 'anycast'],
  },
  {
    id: 'vpc-design',
    title: 'Designing a network you will not regret',
    category: 'networking',
    short: 'The address plan is the one decision you cannot easily undo.',
    body: `Network design is mostly one irreversible choice followed by many reversible ones. The irreversible one is the address range: you cannot shrink or renumber a VPC's primary CIDR, and overlapping ranges make peering permanently impossible between two networks.

So plan the address space first, across every environment and account you might ever have, with generous gaps. Then build the standard structure: subnets in at least three availability zones, split into public (load balancers, NAT gateways), private (application tier) and isolated (data tier). Route tables define which is which.

The providers differ in ways that change the design. AWS subnets are zone-scoped, so you create one per zone. Azure subnets are region-scoped and resources choose their own zone. GCP goes furthest: the VPC itself is global, subnets are regional, and two subnets in different continents route to each other privately with no peering at all — which makes multi-region architectures on GCP structurally simpler.

Then keep traffic private wherever you can. VPC endpoints and private links let you reach managed services without crossing the public internet, which removes both an attack surface and a NAT bill.`,
    keyPoints: [
      'Plan CIDR ranges across all environments before creating anything.',
      'Three zones, three tiers: public, private, isolated.',
      'AWS subnets are zonal; Azure subnets are regional; GCP VPCs are global.',
      'Private endpoints remove both internet exposure and NAT charges.',
    ],
    related: ['cidr-subnetting', 'public-vs-private-subnet', 'private-connectivity', 'network-isolation'],
  },
  {
    id: 'network-isolation',
    title: 'Network isolation',
    category: 'networking',
    short: 'Deciding what can reach what, before deciding who is allowed to do what.',
    body: `Isolation is the structural half of security: not "is this request authorised" but "can this packet arrive at all". It is cheaper and more reliable than authorisation because it fails closed and does not depend on application code being correct.

The layers stack. A separate account or subscription is the strongest boundary, because it separates the blast radius of credentials as well as of packets. A VPC is next. Within it, subnets and route tables decide what has a path to the internet. Within that, security groups and network policies decide which workloads may talk to which. Each layer catches what the one above it missed.

The habit that matters most is referencing identities rather than addresses. A security group rule that says "allow from the web tier's security group" stays correct forever as instances come and go. A rule listing IP ranges is out of date the moment something scales. In Kubernetes the same idea appears as label selectors in a NetworkPolicy.

And the half that gets forgotten: egress. Most networks control inbound traffic carefully and permit outbound to anywhere, which is precisely the path an attacker uses to exfiltrate data or reach a command-and-control server.`,
    keyPoints: [
      'Isolation fails closed; authorisation depends on code being right.',
      'Reference security groups and labels, not IP addresses.',
      'Separate accounts are a stronger boundary than separate networks.',
      'Egress control is the half almost everyone skips.',
    ],
    related: ['network-segmentation', 'least-privilege-network', 'zero-trust', 'lateral-movement'],
  },
  {
    id: 'network-segmentation',
    title: 'Segmentation and blast radius',
    category: 'networking',
    short: 'Assume one thing will be compromised, and decide now how far it gets.',
    body: `Segmentation is designing for the compromise you have not had yet. The question is not whether an attacker gets in — it is what they can reach once they do.

In a flat network, one foothold is effectively total access: every service reachable, every database port open, every credential on disk useful somewhere. In a segmented one, a compromised web container can reach exactly the two services its policy permits, and nothing else. The attack still happens; the incident is a fraction of the size.

Kubernetes is the clearest example because its default is the worst case. Every Pod can reach every other Pod in every namespace until a NetworkPolicy says otherwise. A default-deny policy plus explicit allows is the single highest-value security change available in most clusters, and it costs a few dozen lines of YAML.

The measure to think in is blast radius: if this identity, host or container is fully compromised, what is the complete list of things it can read, write or reach? That question is answerable through network policy and IAM, and the answer is a design output rather than a discovery you make during an incident.`,
    keyPoints: [
      'Design for containment, not just prevention.',
      'Kubernetes allows all Pod-to-Pod traffic until a NetworkPolicy says otherwise.',
      'Blast radius is a number you can reason about in advance.',
      'Segmentation and least-privilege IAM are the same idea at two layers.',
    ],
    related: ['lateral-movement', 'blast-radius', 'zero-trust', 'least-privilege'],
  },
  {
    id: 'private-connectivity',
    title: 'Private endpoints and PrivateLink',
    category: 'networking',
    short: 'Reach managed services over the provider backbone instead of the public internet.',
    body: `Managed services normally have public endpoints. Traffic from your VPC to an object store or a secrets manager leaves through a NAT gateway, crosses the public internet, and comes back — encrypted, but exposed to the network and billed on the way out.

A private endpoint puts that service inside your network. Gateway endpoints (for object storage and some databases) work by adding a route and are typically free. Interface endpoints place an actual network interface with a private address in your subnet, so the service resolves to an address you own, and bill per hour per zone plus data.

Three benefits follow. Traffic never traverses the internet, so it cannot be intercepted or observed there. The managed service can have its public endpoint disabled entirely, removing it from every scanner's view. And you stop paying NAT processing charges, which frequently makes interface endpoints cheaper than the thing they replace.

One thing to get right: attach a policy to the endpoint. An unrestricted endpoint to object storage can reach every bucket on the provider, including an attacker's — which is exactly the exfiltration path the endpoint was supposed to close.`,
    keyPoints: [
      'Gateway endpoints are usually free; interface endpoints bill per hour per zone.',
      'A private endpoint lets you disable the service\'s public endpoint entirely.',
      'Often cheaper than the NAT charges it replaces.',
      'Always attach an endpoint policy, or it can reach any account\'s resources.',
    ],
    related: ['nat-vs-igw', 'data-exfiltration', 'network-isolation', 'cost-optimisation'],
  },
  {
    id: 'trust-boundary',
    title: 'Trust boundaries',
    category: 'networking',
    short: 'A line where data changes hands. Everything crossing it needs checking.',
    body: `A trust boundary is any point where data moves between things with different levels of trust: the internet to your load balancer, your application to your database, one microservice to another, a third-party webhook to your API. Drawing them explicitly is most of what threat modelling is.

Every crossing needs the same three questions answered. Who is the caller, and how do we know (authentication)? What are they allowed to do (authorisation)? And is what they sent actually valid (validation)? Injection vulnerabilities are always a validation failure at a boundary. Privilege escalation is always an authorisation failure at one.

The classical mistake is treating the network perimeter as the only boundary — trusted inside, untrusted outside. That model fails the moment anything inside is compromised, which is why zero trust replaces it: every request is authenticated and authorised regardless of where it came from, and being on the internal network grants nothing by itself.

In practice the most valuable boundary to get right is the one between your application tier and your data tier. That is where least-privilege credentials, parameterised queries and network policy all pay off at once.`,
    keyPoints: [
      'Authenticate, authorise and validate at every boundary crossing.',
      'Injection is a validation failure; escalation is an authorisation failure.',
      '"Inside the network" is not an identity and should grant nothing.',
      'The application-to-data boundary is the highest-value one to harden.',
    ],
    related: ['zero-trust', 'authn-vs-authz', 'sql-injection', 'network-isolation'],
  },
  {
    id: 'bgp',
    title: 'BGP, briefly',
    category: 'networking',
    short: 'The protocol networks use to tell each other which addresses they can reach.',
    body: `The internet is tens of thousands of independent networks, and BGP is how they announce routes to each other: "traffic for this address range, send it to me". There is no central authority deciding the map; it emerges from those announcements.

This matters to cloud engineers for two reasons. It is the mechanism behind anycast — announcing the same range from many locations and letting the protocol pick the nearest. And it is a source of large, visible internet outages: a misconfigured announcement can attract traffic for addresses a network does not actually serve, and it propagates globally within minutes. Several well-known outages, at major providers and at national scale, have been exactly this.

You will rarely configure BGP directly unless you run a Direct Connect or ExpressRoute circuit into a cloud provider, where it is how your on-premises network and the cloud exchange routes. But knowing it exists explains why "the internet is down" is sometimes literally true for a subset of routes, and why route origin validation (RPKI) has become a meaningful security control.`,
    keyPoints: [
      'BGP is how independent networks advertise reachability to each other.',
      'Anycast is built on it.',
      'Misconfigured or hijacked announcements cause global outages and traffic interception.',
      'You configure it directly only for dedicated interconnects.',
    ],
    related: ['anycast', 'dns-resolution', 'multi-region'],
  },
  {
    id: 'latency-budget',
    title: 'Latency budgets',
    category: 'networking',
    short: 'Decide how long the whole thing may take, then spend it deliberately.',
    widget: 'latency-ladder',
    body: `Pick a target — say 200ms at the 95th percentile — and then account for where it goes. The physical parts are not negotiable: a round trip across the Atlantic is roughly 140ms, across the Pacific closer to 200ms, and no amount of optimisation changes the speed of light in fibre. If your users are far away, distance alone can consume the entire budget before your code runs.

Then the handshakes. TCP costs one round trip, TLS 1.3 one more. For a first-time visitor on another continent, you have spent 400ms before the request is sent. This is why edge termination is not a micro-optimisation: it collapses those round trips to a nearby PoP.

Then your own system. Each service hop adds its own latency plus a network hop. A serial chain of five services each taking 20ms is 100ms, and any one of them having a bad tail affects everything. Parallelising independent calls turns a sum into a maximum, which is usually the single biggest structural win available.

Finally, remember that queueing is non-linear. A component at 50% utilisation adds almost nothing; the same component at 95% adds a great deal, because requests wait behind other requests. Latency budgets are therefore also capacity plans.`,
    keyPoints: [
      'Geography sets a floor you cannot optimise past — only move closer.',
      'A cold connection costs two round trips before your code runs.',
      'Parallel calls turn a sum of latencies into a maximum.',
      'Latency rises sharply above about 80% utilisation. Headroom is a latency feature.',
    ],
    snippets: [{
      label: 'Numbers worth knowing',
      lang: 'text',
      code: `L1 cache reference                       ~1 ns
Main memory reference                  ~100 ns
SSD random read                        ~16 µs
Round trip within a datacentre         ~0.5 ms
Round trip, same region                ~1-2 ms
Round trip, cross-region (US↔EU)      ~80-100 ms
Round trip, US↔Australia              ~180-200 ms

TCP handshake       = 1 round trip
TLS 1.3 handshake   = 1 more round trip
So a cold HTTPS request from Sydney to Virginia
costs roughly 600 ms before your server does anything.`,
    }],
    related: ['tcp-handshake', 'tls-handshake', 'cdn', 'capacity-planning'],
  },
]
