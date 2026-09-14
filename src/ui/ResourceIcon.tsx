import type { Archetype } from '@/catalog/schema/types'
import type { JSX } from 'react'

/**
 * Hand-drawn geometric glyphs. Deliberately not the providers' official icon
 * sets — those are trademarked assets with their own usage terms, and a single
 * consistent visual language reads better on a dense canvas anyway.
 *
 * Every glyph is drawn in a 24×24 box with `currentColor`.
 */

const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const GLYPHS: Record<string, JSX.Element> = {
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" {...s} />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" {...s} />
      <path d="M16 6.4a3.2 3.2 0 0 1 0 6.2M17.5 14.9c1.9.6 3 2.4 3 4.6" {...s} opacity="0.55" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" {...s} />
      <path d="M3.5 12h17M12 3.5c2.2 2.3 3.4 5.3 3.4 8.5S14.2 18.2 12 20.5c-2.2-2.3-3.4-5.3-3.4-8.5S9.8 5.8 12 3.5Z" {...s} />
    </>
  ),
  skull: (
    <>
      <path d="M5 11a7 7 0 1 1 14 0v3.2l-1.6 1.2v2.8a1.5 1.5 0 0 1-1.5 1.5h-7.8a1.5 1.5 0 0 1-1.5-1.5v-2.8L5 14.2Z" {...s} />
      <circle cx="9.3" cy="11.2" r="1.7" fill="currentColor" />
      <circle cx="14.7" cy="11.2" r="1.7" fill="currentColor" />
      <path d="M11 15.5h2" {...s} />
    </>
  ),
  plug: (
    <>
      <path d="M9 3v5M15 3v5" {...s} />
      <path d="M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0Z" {...s} />
      <path d="M12 17v4" {...s} />
    </>
  ),
  server: (
    <>
      <rect x="3.5" y="4.5" width="17" height="6" rx="1.6" {...s} />
      <rect x="3.5" y="13.5" width="17" height="6" rx="1.6" {...s} />
      <circle cx="7.2" cy="7.5" r="1" fill="currentColor" />
      <circle cx="7.2" cy="16.5" r="1" fill="currentColor" />
      <path d="M11 7.5h6M11 16.5h6" {...s} opacity="0.5" />
    </>
  ),
  servers: (
    <>
      <rect x="2.5" y="5" width="8" height="6" rx="1.4" {...s} />
      <rect x="13.5" y="5" width="8" height="6" rx="1.4" {...s} />
      <rect x="2.5" y="14" width="8" height="6" rx="1.4" {...s} />
      <rect x="13.5" y="14" width="8" height="6" rx="1.4" {...s} />
    </>
  ),
  container: (
    <>
      <path d="M12 3 3.5 7.5v9L12 21l8.5-4.5v-9Z" {...s} />
      <path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9" {...s} opacity="0.6" />
    </>
  ),
  function: (
    <>
      <path d="M8 20c2.5 0 3-1.6 3.4-4.4l1.2-7.2C13 5.6 13.5 4 16 4" {...s} />
      <path d="M7.5 10.5h8" {...s} />
      <circle cx="18.5" cy="17.5" r="2.5" {...s} opacity="0.6" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6.5" rx="7.5" ry="3" {...s} />
      <path d="M4.5 6.5v11c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-11" {...s} />
      <path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" {...s} opacity="0.55" />
    </>
  ),
  table: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.8" {...s} />
      <path d="M3.5 9.5h17M9 9.5v10M3.5 14.5h17" {...s} opacity="0.7" />
    </>
  ),
  cache: (
    <>
      <path d="M13 3 5 13h6l-1 8 8-10h-6Z" {...s} />
    </>
  ),
  bucket: (
    <>
      <path d="M4 6.5h16l-1.6 12.2a1.6 1.6 0 0 1-1.6 1.3H7.2a1.6 1.6 0 0 1-1.6-1.3Z" {...s} />
      <ellipse cx="12" cy="6.5" rx="8" ry="2.6" {...s} />
    </>
  ),
  disk: (
    <>
      <circle cx="12" cy="12" r="8.5" {...s} />
      <circle cx="12" cy="12" r="2.4" {...s} />
      <path d="M17.6 6.4 13.7 10.3M12 3.5v3" {...s} opacity="0.55" />
    </>
  ),
  queue: (
    <>
      <rect x="2.5" y="8.5" width="5" height="7" rx="1.2" {...s} />
      <rect x="9.5" y="8.5" width="5" height="7" rx="1.2" {...s} opacity="0.75" />
      <rect x="16.5" y="8.5" width="5" height="7" rx="1.2" {...s} opacity="0.5" />
    </>
  ),
  stream: (
    <>
      <path d="M3 7.5c3.5 0 3.5 4 7 4s3.5-4 7-4 3.5 4 4 4" {...s} />
      <path d="M3 14.5c3.5 0 3.5 4 7 4s3.5-4 7-4 3.5 4 4 4" {...s} opacity="0.55" />
    </>
  ),
  balancer: (
    <>
      <circle cx="12" cy="4.6" r="2.1" {...s} />
      <path d="M12 6.7v4.1M12 10.8H5.2v3M12 10.8h6.8v3" {...s} />
      <rect x="2.5" y="14" width="5.4" height="5.4" rx="1.3" {...s} />
      <rect x="16.1" y="14" width="5.4" height="5.4" rx="1.3" {...s} />
    </>
  ),
  gateway: (
    <>
      <path d="M4 20V9.5L12 4l8 5.5V20" {...s} />
      <path d="M9.5 20v-6.5h5V20" {...s} />
    </>
  ),
  dns: (
    <>
      <circle cx="12" cy="12" r="8.5" {...s} />
      <path d="M12 3.5v17M3.5 12h17" {...s} opacity="0.45" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" opacity="0.75" />
    </>
  ),
  cdn: (
    <>
      <circle cx="12" cy="12" r="3.2" {...s} />
      <circle cx="4.5" cy="6.5" r="1.8" {...s} opacity="0.7" />
      <circle cx="19.5" cy="6.5" r="1.8" {...s} opacity="0.7" />
      <circle cx="4.5" cy="17.5" r="1.8" {...s} opacity="0.7" />
      <circle cx="19.5" cy="17.5" r="1.8" {...s} opacity="0.7" />
      <path d="m6 7.8 3.4 2.6M18 7.8l-3.4 2.6M6 16.2l3.4-2.6M18 16.2l-3.4-2.6" {...s} opacity="0.45" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 5.8v5.4c0 4.3 2.9 8.2 7 9.6 4.1-1.4 7-5.3 7-9.6V5.8Z" {...s} />
    </>
  ),
  'shield-check': (
    <>
      <path d="M12 3 5 5.8v5.4c0 4.3 2.9 8.2 7 9.6 4.1-1.4 7-5.3 7-9.6V5.8Z" {...s} />
      <path d="m8.8 11.8 2.3 2.3 4.1-4.5" {...s} />
    </>
  ),
  waf: (
    <>
      <path d="M12 3 5 5.8v5.4c0 4.3 2.9 8.2 7 9.6 4.1-1.4 7-5.3 7-9.6V5.8Z" {...s} />
      <path d="M8.2 9.5h7.6M8.2 12.5h7.6M9.8 15.3h4.4" {...s} opacity="0.6" />
    </>
  ),
  filter: (
    <>
      <path d="M3.5 5h17l-6.5 7.5v6l-4 2v-8Z" {...s} />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="12" r="4" {...s} />
      <path d="M12 12h8.5M17.5 12v3.4M20.5 12v2.4" {...s} />
    </>
  ),
  'key-square': (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" {...s} />
      <circle cx="9.6" cy="12" r="2.6" {...s} />
      <path d="M12.2 12h6M16 12v2.4" {...s} />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" {...s} />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" {...s} />
      <circle cx="12" cy="15.2" r="1.3" fill="currentColor" />
    </>
  ),
  certificate: (
    <>
      <rect x="3.5" y="4" width="17" height="11.5" rx="2" {...s} />
      <path d="M7.5 8h9M7.5 11.2h5" {...s} opacity="0.6" />
      <path d="M14 15.5v5l2.4-1.4 2.4 1.4v-5" {...s} />
    </>
  ),
  chart: (
    <>
      <path d="M3.5 20V4M3.5 20h17" {...s} />
      <path d="m7 15 3.5-4.5 3.4 2.6L20 6" {...s} />
    </>
  ),
  package: (
    <>
      <path d="M12 3 4 7v10l8 4 8-4V7Z" {...s} />
      <path d="m4 7 8 4 8-4M12 11v10" {...s} opacity="0.6" />
      <path d="m8 5 8 4" {...s} opacity="0.4" />
    </>
  ),
  pipeline: (
    <>
      <circle cx="5.5" cy="12" r="2.4" {...s} />
      <circle cx="12" cy="12" r="2.4" {...s} />
      <circle cx="18.5" cy="12" r="2.4" {...s} />
      <path d="M7.9 12h1.7M14.4 12h1.7" {...s} />
    </>
  ),
  scale: (
    <>
      <path d="M12 3.5v17" {...s} />
      <path d="M12 7 5 9.5M12 7l7 2.5" {...s} />
      <path d="M2.2 14a2.8 2.8 0 0 0 5.6 0L5 9.5Z" {...s} />
      <path d="M16.2 14a2.8 2.8 0 0 0 5.6 0L19 9.5Z" {...s} />
    </>
  ),
  vpc: (
    <>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.4" strokeDasharray="4 3" {...s} />
      <rect x="6" y="8" width="5" height="4.5" rx="1" {...s} opacity="0.7" />
      <rect x="13" y="11.5" width="5" height="4.5" rx="1" {...s} opacity="0.7" />
    </>
  ),
  subnet: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" strokeDasharray="3 2.5" {...s} />
      <path d="M7.5 12h9" {...s} opacity="0.6" />
      <circle cx="7.5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="16.5" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  nat: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="2.2" {...s} />
      <path d="M7 12h10M13.6 9.2 17 12l-3.4 2.8" {...s} />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 1 0-5.6l2.4-2.4a4 4 0 0 1 5.6 5.6L16.6 13" {...s} />
      <path d="M14 10a4 4 0 0 1 0 5.6l-2.4 2.4A4 4 0 0 1 6 12.4L7.4 11" {...s} />
    </>
  ),
  network: (
    <>
      <circle cx="12" cy="5" r="2.2" {...s} />
      <circle cx="5" cy="18" r="2.2" {...s} />
      <circle cx="19" cy="18" r="2.2" {...s} />
      <path d="M12 7.2v4.3M12 11.5 6.3 16.3M12 11.5l5.7 4.8" {...s} />
    </>
  ),
  k8s: (
    <>
      <path d="M12 2.8 20 7v10l-8 4.2L4 17V7Z" {...s} />
      <circle cx="12" cy="12" r="2.4" {...s} />
      <path d="M12 9.6V6.2M14.4 13.4l2.7 2M9.6 13.4l-2.7 2" {...s} opacity="0.6" />
    </>
  ),
  pods: (
    <>
      <circle cx="7.5" cy="8" r="3" {...s} />
      <circle cx="16.5" cy="8" r="3" {...s} opacity="0.75" />
      <circle cx="12" cy="16" r="3" {...s} opacity="0.55" />
    </>
  ),
  door: (
    <>
      <path d="M5 20V5.5a1.5 1.5 0 0 1 1.5-1.5h11A1.5 1.5 0 0 1 19 5.5V20" {...s} />
      <path d="M3.5 20h17" {...s} />
      <circle cx="15.2" cy="12.4" r="1.1" fill="currentColor" />
    </>
  ),
  file: (
    <>
      <path d="M6 3.5h7.5L19 9v11.5H6Z" {...s} />
      <path d="M13.5 3.5V9H19" {...s} />
      <path d="M9 13h6M9 16.2h4" {...s} opacity="0.55" />
    </>
  ),
}

/** Archetype → glyph, so a new resource always renders something sensible. */
const ARCHETYPE_GLYPH: Partial<Record<Archetype, string>> = {
  client: 'users', internet: 'globe', attacker: 'skull',
  'dns-zone': 'dns', cdn: 'cdn', waf: 'waf', 'ddos-shield': 'shield-check',
  'api-gateway': 'gateway', 'load-balancer-l7': 'balancer', 'load-balancer-l4': 'balancer',
  vm: 'server', 'vm-scale-set': 'servers', 'container-service': 'container',
  'serverless-function': 'function', 'static-hosting': 'file',
  'k8s-cluster': 'k8s', 'k8s-nodepool': 'servers', 'k8s-workload': 'pods',
  'k8s-service': 'network', 'k8s-ingress': 'door', 'k8s-config': 'file',
  'relational-db': 'database', 'nosql-db': 'table', cache: 'cache',
  queue: 'queue', stream: 'stream', search: 'table',
  'object-store': 'bucket', 'block-storage': 'disk', 'file-storage': 'file',
  'data-warehouse': 'database',
  vpc: 'vpc', subnet: 'subnet', 'availability-zone': 'subnet', firewall: 'shield',
  nat: 'nat', 'internet-gateway': 'gateway', vpn: 'link', 'private-link': 'link',
  peering: 'link', 'service-mesh': 'network',
  identity: 'key', secrets: 'lock', kms: 'key-square', certificate: 'certificate', bastion: 'door',
  monitoring: 'chart', logging: 'chart', tracing: 'chart', alerting: 'chart',
  'ci-cd': 'pipeline', registry: 'package', backup: 'disk', autoscaler: 'scale',
}

export function ResourceIcon({
  icon, archetype, size = 20, className,
}: {
  icon?: string
  archetype?: Archetype
  size?: number
  className?: string
}) {
  const key = (icon && GLYPHS[icon] ? icon : undefined) ?? (archetype ? ARCHETYPE_GLYPH[archetype] : undefined) ?? 'server'
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      className={className} aria-hidden="true" focusable="false"
    >
      {GLYPHS[key]}
    </svg>
  )
}

