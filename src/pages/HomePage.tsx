import { Link } from 'react-router-dom'
import { ALL_RESOURCES, PROVIDER_META } from '@/catalog/registry'
import { CODEX_ENTRY_COUNT } from '@/codex/labels'
import { MISSIONS } from '@/scenarios/missions'
import { Logo } from '@/ui/Logo'
import { ResourceIcon } from '@/ui/ResourceIcon'

const FEATURES = [
  {
    title: 'Connections that refuse to lie',
    body: 'Drag a line from the internet to a database and it will not connect — and it will explain why, in terms of route tables, protocols and the attacks that follow. Every rejection is a lesson you did not have to read a book for.',
    icon: 'network',
  },
  {
    title: 'A simulation that actually models the trade-offs',
    body: 'Traffic flows through your graph. Latency climbs with utilisation, caches absorb reads, queues absorb spikes, and scaling a tier that is not the bottleneck changes nothing except the bill. You can watch that happen.',
    icon: 'chart',
  },
  {
    title: 'Break it on purpose',
    body: 'Inject an OOM kill, a zone outage, a cache stampede, a certificate expiry. Read the symptom, diagnose it from the metrics and the event log, and fix the architecture rather than the incident.',
    icon: 'skull',
  },
  {
    title: 'Attacks with real defences',
    body: 'A DDoS flood, SQL injection, lateral movement, ransomware. Each one walks your graph and is stopped — or not — by the controls it meets. Defence in depth stops being a slogan.',
    icon: 'shield',
  },
  {
    title: 'How to build it for real',
    body: 'Every resource carries the CLI commands, the Terraform, the console steps, and the operational gotchas that catch people. The bridge from the canvas to a terminal is one click.',
    icon: 'pipeline',
  },
  {
    title: 'One idea, three clouds',
    body: 'Every service maps to a provider-agnostic archetype, so you can see the AWS, Azure and GCP equivalents side by side. Learn the shape once and it transfers everywhere.',
    icon: 'cdn',
  },
]

export function HomePage() {
  const providerCounts = (['aws', 'azure', 'gcp', 'kubernetes'] as const).map((p) => ({
    provider: p,
    count: ALL_RESOURCES.filter((r) => r.provider === p).length,
  }))

  return (
    <div className="min-h-full bg-void">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-line">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 70% 55% at 50% -10%, color-mix(in oklab, var(--color-signal) 14%, transparent), transparent), radial-gradient(ellipse 50% 40% at 85% 20%, color-mix(in oklab, var(--color-power) 12%, transparent), transparent)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, var(--color-line) 1px, transparent 0)',
            backgroundSize: '28px 28px',
            maskImage: 'linear-gradient(to bottom, black, transparent 80%)',
          }}
        />

        <div className="relative mx-auto max-w-5xl px-5 py-20 sm:py-28">
          <div className="flex items-center gap-2.5">
            <Logo size={32} />
            <span className="text-[17px] font-semibold tracking-tight text-ink">Cloudwright</span>
          </div>

          <h1 className="mt-8 max-w-3xl text-balance text-[38px] font-semibold leading-[1.08] tracking-tight text-ink sm:text-[54px]">
            Build the cloud.
            <br />
            <span className="text-ink-dim">Break it. Defend it.</span>
          </h1>

          <p className="mt-5 max-w-xl text-balance text-[15px] leading-relaxed text-ink-dim sm:text-[16px]">
            A free-form canvas where you assemble real cloud architectures, watch traffic move through them,
            and find out what breaks — before it breaks somewhere that matters.
          </p>

          <div className="mt-8 flex flex-wrap gap-2.5">
            <Link
              to="/build"
              className="focusable rounded-xl bg-signal px-5 py-2.5 text-[13.5px] font-semibold text-void transition hover:brightness-110"
            >
              Open the canvas
            </Link>
            <Link
              to="/missions"
              className="focusable rounded-xl border border-line bg-surface/60 px-5 py-2.5 text-[13.5px] font-medium text-ink transition hover:border-line-bright"
            >
              Start the campaign
            </Link>
            <Link
              to="/codex"
              className="focusable rounded-xl px-5 py-2.5 text-[13.5px] font-medium text-ink-dim transition hover:text-ink"
            >
              Browse the codex
            </Link>
          </div>

          <dl className="mt-12 flex flex-wrap gap-x-9 gap-y-4">
            <Figure value={String(ALL_RESOURCES.length)} label="cloud services" />
            <Figure value={String(CODEX_ENTRY_COUNT)} label="codex entries" />
            <Figure value={String(MISSIONS.length)} label="missions" />
            <Figure value="4" label="providers" />
            <Figure value="$0" label="to play, forever" />
          </dl>
        </div>
      </div>

      {/* Providers */}
      <div className="border-b border-line bg-abyss/40">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-3 px-5 py-5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Covering</span>
          {providerCounts.map(({ provider, count }) => (
            <span key={provider} className="flex items-baseline gap-1.5 text-[12.5px]">
              <span className="font-medium" style={{ color: PROVIDER_META[provider].color }}>
                {PROVIDER_META[provider].label}
              </span>
              <span className="text-ink-faint">{count} services</span>
            </span>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="mx-auto max-w-5xl px-5 py-16">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-xl border border-line bg-surface/50 p-5">
              <span className="grid size-9 place-items-center rounded-lg bg-signal/10 text-signal">
                <ResourceIcon icon={f.icon} size={18} />
              </span>
              <h3 className="mt-3.5 text-[14px] font-semibold text-ink">{f.title}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-faint">{f.body}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* Closing */}
      <div className="border-t border-line">
        <div className="mx-auto max-w-5xl px-5 py-16">
          <h2 className="max-w-xl text-balance text-[22px] font-semibold leading-snug tracking-tight text-ink">
            Cloud infrastructure is mostly a set of trade-offs nobody writes down.
          </h2>
          <p className="mt-3 max-w-xl text-balance text-[14px] leading-relaxed text-ink-dim">
            Redundancy against cost. Consistency against latency. Control against operational load. You can read about
            them, or you can move a slider and watch the error rate climb. This is the second one.
          </p>
          <Link
            to="/build"
            className="focusable mt-6 inline-block rounded-xl bg-signal px-5 py-2.5 text-[13.5px] font-semibold text-void transition hover:brightness-110"
          >
            Start building
          </Link>
          <p className="mt-10 text-[11px] leading-relaxed text-ink-faint">
            Everything runs in your browser. Nothing is uploaded, and diagrams are stored locally or encoded into a
            shareable link. Prices and capacities are simplified teaching figures, not quotes — always check the
            provider&rsquo;s own calculator. Not affiliated with Amazon, Microsoft, Google, or the CNCF.
          </p>
        </div>
      </div>
    </div>
  )
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="font-mono text-[24px] font-bold leading-none tabular-nums text-ink">{value}</dt>
      <dd className="mt-1 text-[11px] uppercase tracking-wider text-ink-faint">{label}</dd>
    </div>
  )
}
