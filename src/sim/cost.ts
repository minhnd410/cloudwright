import type { PropBag, ResourceDef } from '@/catalog/schema/types'

/**
 * USD per hour for one node at its current configuration and throughput.
 * Request- and storage-based charges are folded into an hourly figure so the
 * player sees one comparable number that moves as they change things.
 */
/**
 * Average response size used to turn a request rate into gigabytes. A rough
 * mixed-workload figure — enough to make egress visible as the large line item
 * it usually is, without pretending to be precise.
 */
const AVG_RESPONSE_BYTES = 8_000

export function nodeCostPerHour(
  def: ResourceDef,
  props: PropBag,
  servedRps: number,
  /**
   * Requests served directly to clients on the public internet. Traffic between
   * your own resources inside a region is not billed as egress, so charging it
   * would overstate almost every architecture by an order of magnitude.
   */
  externalRps = 0,
): number {
  const cost = def.cost
  if (!cost) return 0

  let total = 0
  if (cost.hourly) total += safe(() => cost.hourly!(props))

  if (cost.perMillionRequests) {
    const requestsPerHour = servedRps * 3600
    total += safe(() => cost.perMillionRequests!(props)) * (requestsPerHour / 1_000_000)
  }

  if (cost.perGbEgress && externalRps > 0) {
    const gbPerHour = (externalRps * 3600 * AVG_RESPONSE_BYTES) / 1e9
    total += safe(() => cost.perGbEgress!(props)) * gbPerHour
  }

  if (cost.perGbMonth) {
    const storedGb = Number(props.sizeGb ?? props.allocatedStorage ?? 100)
    total += (safe(() => cost.perGbMonth!(props)) * storedGb) / 730
  }

  return Number.isFinite(total) ? total : 0
}

function safe(fn: () => number): number {
  try {
    const v = fn()
    return Number.isFinite(v) ? v : 0
  } catch {
    return 0
  }
}

export function formatCurrency(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`
  if (value >= 10) return `$${value.toFixed(0)}`
  if (value >= 1) return `$${value.toFixed(2)}`
  if (value === 0) return '$0'
  return `$${value.toFixed(3)}`
}
