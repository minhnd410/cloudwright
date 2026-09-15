import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import type { WidgetId } from '../types'
import { Slider } from '@/ui/primitives'

export function ConceptWidget({ id }: { id: WidgetId }) {
  switch (id) {
    case 'osi': return <OsiExplorer />
    case 'cidr': return <CidrCalculator />
    case 'availability-math': return <AvailabilityMath />
    case 'latency-ladder': return <LatencyLadder />
    case 'tcp-handshake': return <HandshakeAnimation mode="tcp" />
    case 'tls-handshake': return <HandshakeAnimation mode="tls" />
    case 'dns-walk': return <DnsWalk />
    case 'cache-hit': return <CacheHit />
    case 'error-budget': return <ErrorBudget />
    case 'probe-simulator': return <ProbeSimulator />
    case 'cap-triangle': return <CapTriangle />
    default: return null
  }
}

function Frame({ title, children, caption }: { title: string; children: React.ReactNode; caption?: string }) {
  return (
    <figure className="my-5 overflow-hidden rounded-xl border border-line bg-abyss/60">
      <figcaption className="border-b border-line px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        {title}
      </figcaption>
      <div className="p-3.5">{children}</div>
      {caption && <p className="border-t border-line px-3 py-2 text-[11px] leading-relaxed text-ink-faint">{caption}</p>}
    </figure>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-[11.5px]">
      <span className="w-[102px] shrink-0 text-ink-faint">{label}</span>
      <span className="min-w-0 flex-1 text-ink-dim">{value}</span>
    </div>
  )
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-ink-dim">{label}</div>
      {children}
    </div>
  )
}

function Metric({ label, value, sub, tone = 'default' }: { label: string; value: string; sub?: string; tone?: 'default' | 'warn' }) {
  return (
    <div>
      <div className="text-[9.5px] uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={clsx('mt-0.5 font-mono text-[15px] font-semibold tabular-nums', tone === 'warn' ? 'text-ember' : 'text-ink')}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-ink-faint">{sub}</div>}
    </div>
  )
}

// ── OSI explorer ────────────────────────────────────────────────────────────

const OSI_LAYERS = [
  { n: 7, name: 'Application', examples: 'HTTP, gRPC, DNS, TLS payloads', sees: 'URLs, headers, cookies, request bodies', cloud: 'ALB · Application Gateway · WAF · API Gateway · CDN', colour: 'var(--color-flux)' },
  { n: 6, name: 'Presentation', examples: 'TLS encryption, compression, encoding', sees: 'The encrypted session', cloud: 'TLS termination on a load balancer or CDN', colour: 'var(--color-flow-tcp)' },
  { n: 5, name: 'Session', examples: 'Session establishment and teardown', sees: 'Connection lifecycle', cloud: 'Rarely reasoned about directly', colour: 'var(--color-flow-tcp)' },
  { n: 4, name: 'Transport', examples: 'TCP, UDP', sees: 'Ports, connections, sequence numbers', cloud: 'NLB · Azure Load Balancer · security groups', colour: 'var(--color-flow-queue)' },
  { n: 3, name: 'Network', examples: 'IP, ICMP, routing', sees: 'Source and destination addresses', cloud: 'VPC routes · NACLs · NAT · BGP', colour: 'var(--color-signal)' },
  { n: 2, name: 'Data link', examples: 'Ethernet, MAC addressing', sees: 'Frames on one physical segment', cloud: 'Managed entirely by the provider', colour: 'var(--color-ink-faint)' },
  { n: 1, name: 'Physical', examples: 'Fibre, copper, radio', sees: 'Bits on a wire', cloud: 'Managed entirely by the provider', colour: 'var(--color-ink-faint)' },
]

function OsiExplorer() {
  const [active, setActive] = useState(7)
  const layer = OSI_LAYERS.find((l) => l.n === active)!
  return (
    <Frame title="The seven layers" caption="The three highlighted layers are where cloud engineering decisions are actually made. Select one to see what a component at that layer can and cannot know.">
      <div className="space-y-1">
        {OSI_LAYERS.map((l) => {
          const key = [3, 4, 7].includes(l.n)
          return (
            <button
              key={l.n}
              onClick={() => setActive(l.n)}
              className={clsx(
                'focusable flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition',
                active === l.n ? 'border-transparent' : 'border-line hover:border-line-bright',
                !key && 'opacity-55',
              )}
              style={active === l.n ? { background: `color-mix(in oklab, ${l.colour} 13%, transparent)`, borderColor: l.colour } : undefined}
            >
              <span className="w-5 shrink-0 font-mono text-[12px] font-bold tabular-nums" style={{ color: l.colour }}>{l.n}</span>
              <span className="w-[86px] shrink-0 text-[12px] font-medium text-ink">{l.name}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">{l.examples}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-3 space-y-2 rounded-lg border border-line bg-surface/60 p-3">
        <Row label="What it can see" value={layer.sees} />
        <Row label="In the cloud" value={layer.cloud} />
      </div>
    </Frame>
  )
}

// ── CIDR calculator ─────────────────────────────────────────────────────────

function lastAddress(prefix: number) {
  const size = 2 ** (32 - prefix)
  const last = size - 1
  const second = Math.floor(last / 65536) % 256
  const third = Math.floor(last / 256) % 256
  const fourth = last % 256
  return `10.${second}.${third}.${fourth}`
}

function CidrCalculator() {
  const [prefix, setPrefix] = useState(20)
  const total = 2 ** (32 - prefix)
  const usable = Math.max(0, total - 5)
  const perZone = Math.floor(total / 3)

  return (
    <Frame
      title="Subnet size calculator"
      caption="Cloud providers reserve four or five addresses in every subnet, which is why a /28 gives eleven usable hosts rather than sixteen."
    >
      <Slider value={prefix} min={16} max={28} onChange={setPrefix} format={(v) => `/${v}`} />
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Metric label="Total addresses" value={total.toLocaleString()} />
        <Metric label="Usable hosts" value={usable.toLocaleString()} tone={usable < 20 ? 'warn' : 'default'} />
        <Metric label="Split three ways" value={`/${prefix + 2} each`} sub={`${perZone.toLocaleString()} addresses`} />
      </div>
      <p className="mt-3 rounded-lg border border-line bg-surface/60 p-2.5 font-mono text-[11px] leading-relaxed text-ink-dim">
        10.0.0.0/{prefix} → 10.0.0.0 – {lastAddress(prefix)}
      </p>
      {prefix >= 24 && (
        <p className="mt-2 text-[11px] leading-relaxed text-ember">
          With a VPC-native Kubernetes CNI every Pod consumes one subnet address. A /{prefix} runs out at roughly {usable} Pods.
        </p>
      )}
    </Frame>
  )
}

// ── Availability maths ──────────────────────────────────────────────────────

function AvailabilityMath() {
  const [deps, setDeps] = useState(3)
  const [per, setPer] = useState(99.9)
  const [replicas, setReplicas] = useState(1)

  const single = per / 100
  const withRedundancy = 1 - (1 - single) ** replicas
  const combined = withRedundancy ** deps
  const minutes = (1 - combined) * 43800

  return (
    <Frame
      title="Dependencies multiply, redundancy compounds"
      caption="Redundancy only compounds when failures are independent. Replicas sharing a zone, a deployment or a config store do not."
    >
      <div className="space-y-3">
        <Labelled label="Availability of one component">
          <Slider value={per} min={95} max={99.999} step={0.001} onChange={setPer} format={(v) => `${v.toFixed(3)}%`} />
        </Labelled>
        <Labelled label="Independent copies of each">
          <Slider value={replicas} min={1} max={5} onChange={setReplicas} />
        </Labelled>
        <Labelled label="Hard dependencies in the chain">
          <Slider value={deps} min={1} max={8} onChange={setDeps} />
        </Labelled>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3">
        <Metric label="Per tier" value={`${(withRedundancy * 100).toFixed(4)}%`} />
        <Metric label="End to end" value={`${(combined * 100).toFixed(3)}%`} tone={combined < 0.999 ? 'warn' : 'default'} />
        <Metric
          label="Downtime"
          value={minutes < 60 ? `${minutes.toFixed(0)} min` : `${(minutes / 60).toFixed(1)} h`}
          sub="per month"
          tone={minutes > 43 ? 'warn' : 'default'}
        />
      </div>
    </Frame>
  )
}

// ── Latency ladder ──────────────────────────────────────────────────────────

const LATENCY_ROWS = [
  { label: 'L1 cache reference', ns: 1 },
  { label: 'Main memory reference', ns: 100 },
  { label: 'SSD random read', ns: 16_000 },
  { label: 'Same-datacentre round trip', ns: 500_000 },
  { label: 'Same-region round trip', ns: 1_500_000 },
  { label: 'US east ↔ US west', ns: 70_000_000 },
  { label: 'US ↔ Europe', ns: 90_000_000 },
  { label: 'US ↔ Australia', ns: 190_000_000 },
]

function formatNs(ns: number) {
  if (ns < 1000) return `${ns} ns`
  if (ns < 1_000_000) return `${(ns / 1000).toFixed(0)} µs`
  return `${(ns / 1_000_000).toFixed(0)} ms`
}

function LatencyLadder() {
  const max = Math.log10(LATENCY_ROWS[LATENCY_ROWS.length - 1].ns)
  return (
    <Frame
      title="Latency, to scale"
      caption="The bars are logarithmic — a cross-ocean round trip is roughly two hundred million times a cache reference. Distance is the one number you cannot optimise away."
    >
      <div className="space-y-1.5">
        {LATENCY_ROWS.map((row) => (
          <div key={row.label} className="flex items-center gap-2.5">
            <span className="w-[178px] shrink-0 text-[11px] text-ink-dim">{row.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(Math.log10(row.ns) / max) * 100}%`,
                  background: row.ns > 10_000_000 ? 'var(--color-alarm)' : row.ns > 100_000 ? 'var(--color-ember)' : 'var(--color-signal)',
                }}
              />
            </div>
            <span className="w-[62px] shrink-0 text-right font-mono text-[10.5px] tabular-nums text-ink-faint">{formatNs(row.ns)}</span>
          </div>
        ))}
      </div>
    </Frame>
  )
}

// ── Handshake animation ─────────────────────────────────────────────────────

const TCP_STEPS = [
  { from: 'client', text: 'SYN — I would like to open a connection', note: 'Client picks a random sequence number' },
  { from: 'server', text: 'SYN-ACK — acknowledged, and here is mine', note: 'Server allocates state for this connection' },
  { from: 'client', text: 'ACK — acknowledged', note: 'One full round trip has now elapsed' },
  { from: 'client', text: 'The actual request', note: 'Only now does any data move' },
]

const TLS_STEPS = [
  { from: 'client', text: 'ClientHello — supported ciphers, key share', note: 'TLS 1.3 sends a key share immediately' },
  { from: 'server', text: 'ServerHello, certificate, Finished', note: 'One round trip; the certificate proves identity' },
  { from: 'client', text: 'Finished — encrypted from here', note: 'Client validates the chain to a trusted root' },
  { from: 'client', text: 'The actual request, encrypted', note: 'TLS 1.2 would have needed one more round trip' },
]

function HandshakeAnimation({ mode }: { mode: 'tcp' | 'tls' }) {
  const steps = mode === 'tcp' ? TCP_STEPS : TLS_STEPS
  const [step, setStep] = useState(steps.length - 1)
  const [run, setRun] = useState(0)

  useEffect(() => {
    if (run === 0) return
    const timer = setInterval(() => {
      setStep((s) => {
        if (s >= steps.length - 1) {
          clearInterval(timer)
          return s
        }
        return s + 1
      })
    }, 900)
    return () => clearInterval(timer)
  }, [run, steps.length])

  return (
    <Frame
      title={mode === 'tcp' ? 'The TCP three-way handshake' : 'The TLS 1.3 handshake'}
      caption={mode === 'tcp'
        ? 'One full round trip before a single byte of your request moves. Across an ocean that is 140ms spent on nothing, which is why connection reuse matters.'
        : 'TLS 1.3 completes in one round trip on top of TCP. TLS 1.2 needed two. Session resumption can reduce a returning client to zero.'}
    >
      <div className="flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
        <span>Client</span>
        <span>Server</span>
      </div>
      <div className="mt-2 space-y-2">
        {steps.map((s, i) => (
          <div key={i} className={clsx('flex transition-opacity duration-300', i > step ? 'opacity-20' : 'opacity-100', s.from === 'server' && 'justify-end')}>
            <div className={clsx('max-w-[78%] rounded-lg border px-2.5 py-1.5', s.from === 'client' ? 'border-flux/40 bg-flux/8' : 'border-signal/40 bg-signal/8')}>
              <div className="font-mono text-[11px] text-ink">{s.text}</div>
              <div className="mt-0.5 text-[10px] text-ink-faint">{s.note}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={() => { setStep(0); setRun((r) => r + 1) }} className="focusable rounded-lg bg-raised px-2.5 py-1 text-[11px] text-ink-dim transition hover:bg-line hover:text-ink">Replay</button>
        <button onClick={() => setStep((s) => Math.min(s + 1, steps.length - 1))} className="focusable rounded-lg px-2.5 py-1 text-[11px] text-ink-faint transition hover:text-ink">Step</button>
      </div>
    </Frame>
  )
}

// ── DNS walk ────────────────────────────────────────────────────────────────

const DNS_STEPS = [
  { who: 'Browser → resolver', q: 'app.example.com?', a: 'Checking cache… nothing.' },
  { who: 'Resolver → root', q: 'app.example.com?', a: 'Ask the .com servers.' },
  { who: 'Resolver → .com', q: 'app.example.com?', a: 'Ask ns1.example.com.' },
  { who: 'Resolver → authoritative', q: 'app.example.com?', a: 'A 203.0.113.42, TTL 300.' },
  { who: 'Resolver → browser', q: '', a: '203.0.113.42 — cached for 300 seconds by everyone on the way.' },
]

function DnsWalk() {
  const [step, setStep] = useState(DNS_STEPS.length - 1)
  return (
    <Frame
      title="Resolving a name"
      caption="Every resolver on the path may cache the answer for its TTL. That is what makes DNS fast, and what makes a failover slow to reach everyone."
    >
      <div className="space-y-1.5">
        {DNS_STEPS.map((s, i) => (
          <div key={i} className={clsx('rounded-lg border px-2.5 py-1.5 transition-opacity', i > step ? 'border-line opacity-25' : 'border-line-bright opacity-100')}>
            <div className="text-[10.5px] font-medium text-ink-faint">{s.who}</div>
            {s.q && <div className="font-mono text-[11px] text-flux">{s.q}</div>}
            <div className="font-mono text-[11px] text-ink-dim">{s.a}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={() => setStep(0)} className="focusable rounded-lg bg-raised px-2.5 py-1 text-[11px] text-ink-dim transition hover:bg-line hover:text-ink">Restart</button>
        <button onClick={() => setStep((s) => Math.min(s + 1, DNS_STEPS.length - 1))} className="focusable rounded-lg px-2.5 py-1 text-[11px] text-ink-faint transition hover:text-ink">Step</button>
      </div>
    </Frame>
  )
}

// ── Cache hit ratio ─────────────────────────────────────────────────────────

function CacheHit() {
  const [hitRate, setHitRate] = useState(90)
  const [rps, setRps] = useState(10000)
  const origin = Math.round(rps * (1 - hitRate / 100))

  return (
    <Frame
      title="What a cache hit ratio is worth"
      caption="Cache key bloat is what destroys hit ratio: every header, cookie and query parameter you include multiplies the number of distinct cached objects."
    >
      <div className="space-y-3">
        <Labelled label="Incoming requests per second">
          <Slider value={rps} min={100} max={100000} step={100} onChange={setRps} format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
        </Labelled>
        <Labelled label="Cache hit ratio">
          <Slider value={hitRate} min={0} max={99} onChange={setHitRate} unit="%" />
        </Labelled>
      </div>
      <div className="mt-3 flex h-7 overflow-hidden rounded-lg border border-line">
        <div className="grid place-items-center bg-signal/25 text-[10.5px] font-medium text-signal transition-[width] duration-300" style={{ width: `${hitRate}%` }}>
          {hitRate > 12 && 'served from cache'}
        </div>
        <div className="grid flex-1 place-items-center bg-ember/20 text-[10.5px] font-medium text-ember">
          {100 - hitRate > 12 && 'hits your origin'}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Metric label="Origin load" value={`${origin.toLocaleString()} rps`} tone={origin > 2000 ? 'warn' : 'default'} />
        <Metric label="Requests avoided" value={`${(rps - origin).toLocaleString()} rps`} />
      </div>
    </Frame>
  )
}

// ── Error budget ────────────────────────────────────────────────────────────

const SLO_OPTIONS = [99, 99.5, 99.9, 99.95, 99.99, 99.999]

function ErrorBudget() {
  const [slo, setSlo] = useState(99.9)
  const budgetMinutes = ((100 - slo) / 100) * 43800
  const [burn, setBurn] = useState(1)
  const exhaustHours = budgetMinutes / 60 / burn

  return (
    <Frame
      title="Error budget and burn rate"
      caption="Alerting on burn rate produces far fewer, far more meaningful pages than any set of static thresholds."
    >
      <div className="flex flex-wrap gap-1.5">
        {SLO_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setSlo(s)}
            className={clsx(
              'focusable rounded-md border px-2 py-1 font-mono text-[11px] transition',
              slo === s ? 'border-signal/60 bg-signal/12 text-signal' : 'border-line text-ink-faint hover:text-ink-dim',
            )}
          >
            {s}%
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Metric label="Monthly budget" value={budgetMinutes < 60 ? `${budgetMinutes.toFixed(1)} min` : `${(budgetMinutes / 60).toFixed(1)} h`} sub="of failed requests" />
        <Metric
          label="Exhausted in"
          value={exhaustHours < 1 ? `${(exhaustHours * 60).toFixed(0)} min` : exhaustHours > 720 ? 'never this month' : `${exhaustHours.toFixed(1)} h`}
          tone={exhaustHours < 24 ? 'warn' : 'default'}
        />
      </div>
      <div className="mt-3">
        <Labelled label={`Burn rate — ${burn}× the sustainable pace`}>
          <Slider value={burn} min={1} max={30} onChange={setBurn} format={(v) => `${v}×`} />
        </Labelled>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-dim">
        {burn >= 14
          ? 'Fast burn. At this rate an hour costs 2% of the month. This should page someone immediately.'
          : burn >= 6
            ? 'Elevated burn. Worth paging if it persists for several hours.'
            : burn > 1
              ? 'Slow burn. Open a ticket rather than waking anyone up.'
              : 'Sustainable. You are exactly on budget.'}
      </p>
    </Frame>
  )
}

// ── Probe simulator ─────────────────────────────────────────────────────────

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="focusable flex w-full items-center gap-2.5 rounded-lg border border-line px-2.5 py-2 text-left transition hover:border-line-bright"
    >
      <span className={clsx('h-[16px] w-7 shrink-0 rounded-full border transition-colors', value ? 'border-signal bg-signal/60' : 'border-line-bright bg-raised')}>
        <span className={clsx('block size-2.5 rounded-full bg-ink transition-transform', value ? 'translate-x-[14px] translate-y-px' : 'translate-x-0.5 translate-y-px')} />
      </span>
      <span className="text-[11.5px] text-ink-dim">{label}</span>
    </button>
  )
}

function ProbeSimulator() {
  const [depCheck, setDepCheck] = useState(true)
  const [dbDown, setDbDown] = useState(false)

  const outcome = useMemo(() => {
    if (!dbDown) return { text: 'All three replicas are healthy and serving.', tone: 'good' as const }
    if (depCheck) {
      return {
        text: 'The database blip fails the liveness probe on every replica at once. Kubernetes restarts all of them. Nothing can serve, and the restart loop continues even after the database recovers — a degraded service has become a dead one.',
        tone: 'bad' as const,
      }
    }
    return {
      text: 'Liveness still passes — the processes are fine. Readiness fails, so the Pods leave the Service endpoints and stop receiving traffic. When the database returns, readiness passes and they come back automatically. No restarts.',
      tone: 'good' as const,
    }
  }, [depCheck, dbDown])

  return (
    <Frame
      title="What a liveness probe should check"
      caption="Liveness asks whether the container should be restarted. Readiness asks whether it should receive traffic. Using one for the other's job is the classic Kubernetes self-inflicted outage."
    >
      <div className="space-y-2">
        <ToggleRow label="Liveness probe checks the database" value={depCheck} onChange={setDepCheck} />
        <ToggleRow label="The database has a 30-second blip" value={dbDown} onChange={setDbDown} />
      </div>
      <div
        className={clsx(
          'mt-3 rounded-lg border px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-dim',
          outcome.tone === 'good' ? 'border-signal/35 bg-signal/6' : 'border-alarm/40 bg-alarm/6',
        )}
      >
        {outcome.text}
      </div>
    </Frame>
  )
}

// ── CAP triangle ────────────────────────────────────────────────────────────

function CapTriangle() {
  const [choice, setChoice] = useState<'cp' | 'ap'>('ap')
  return (
    <Frame
      title="During a partition, you must choose"
      caption="Partition tolerance is not optional — networks fail. The real choice is what your system does while they are split."
    >
      <div className="flex gap-2">
        <button
          onClick={() => setChoice('cp')}
          className={clsx('focusable flex-1 rounded-lg border px-3 py-2.5 text-left transition', choice === 'cp' ? 'border-flux/60 bg-flux/8' : 'border-line hover:border-line-bright')}
        >
          <div className="text-[12px] font-semibold text-ink">Choose consistency</div>
          <div className="mt-1 text-[11px] leading-relaxed text-ink-faint">
            Refuse the write. Nobody reads stale data, and the service is unavailable until the partition heals.
          </div>
        </button>
        <button
          onClick={() => setChoice('ap')}
          className={clsx('focusable flex-1 rounded-lg border px-3 py-2.5 text-left transition', choice === 'ap' ? 'border-signal/60 bg-signal/8' : 'border-line hover:border-line-bright')}
        >
          <div className="text-[12px] font-semibold text-ink">Choose availability</div>
          <div className="mt-1 text-[11px] leading-relaxed text-ink-faint">
            Accept the write on both sides and reconcile later. Always up, temporarily inconsistent.
          </div>
        </button>
      </div>
      <div className="mt-3 rounded-lg border border-line bg-surface/60 p-3 text-[11.5px] leading-relaxed text-ink-dim">
        {choice === 'cp'
          ? 'Banking and inventory usually land here: declining a transaction is far better than permitting a double-spend. Typical examples are Spanner, etcd and a Postgres primary with synchronous replication.'
          : 'Shopping carts, social feeds and session stores usually land here: accepting the write and resolving a conflict later beats showing an error. Typical examples are DynamoDB global tables, Cassandra and Cosmos DB with eventual consistency.'}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        And the half people forget — PACELC: even with no partition at all, strong consistency still costs a round trip to a quorum.
      </p>
    </Frame>
  )
}
