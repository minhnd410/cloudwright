import type { Flow, Port, PropDef, PropOption } from './types'

/** `inPort('web', 'HTTP in', ['http'])` — keeps resource files readable. */
export function inPort(id: string, label: string, flows: Flow[], extra: Partial<Port> = {}): Port {
  return { id, side: 'in', label, flows, position: 'left', ...extra }
}

export function outPort(id: string, label: string, flows: Flow[], extra: Partial<Port> = {}): Port {
  return { id, side: 'out', label, flows, position: 'right', ...extra }
}

/** Every resource that can emit telemetry gets this for free. */
export const TELEMETRY_OUT: Port = {
  id: 'telemetry', side: 'out', label: 'Telemetry', flows: ['telemetry'], position: 'bottom',
}

/** Every resource that can assume a role / read secrets gets these. */
export const IDENTITY_IN: Port = {
  id: 'identity', side: 'in', label: 'Identity & secrets', flows: ['identity', 'secret', 'key'], position: 'top',
}

/**
 * Anything a pipeline can deploy to. Separate from the request path so a deploy
 * edge is visibly a different kind of dependency from a user request.
 */
export const DEPLOY_IN: Port = {
  id: 'deploy', side: 'in', label: 'Deployments', flows: ['deploy', 'image'], position: 'top',
}

/** Bundled ports for a typical application compute resource. */
export function computePorts(opts: {
  accepts?: Flow[]
  calls?: Flow[]
} = {}): Port[] {
  const accepts = opts.accepts ?? ['http', 'grpc', 'tcp']
  const calls = opts.calls ?? ['http', 'grpc', 'sql', 'nosql', 'cache', 'queue', 'stream', 'object', 'search', 'file']
  return [
    inPort('in', 'Inbound requests', accepts),
    outPort('out', 'Outbound calls', calls),
    IDENTITY_IN,
    DEPLOY_IN,
    TELEMETRY_OUT,
  ]
}

// ── Reusable property definitions ───────────────────────────────────────────

export function sizeProp(options: PropOption[], opts: Partial<PropDef> = {}): PropDef {
  return {
    key: 'size',
    label: 'Instance size',
    type: 'select',
    default: options[Math.min(1, options.length - 1)].value,
    help: 'How much CPU and memory each instance gets. Cloud providers sell this as a named family and size rather than as raw numbers.',
    impact:
      'Larger sizes raise the requests per second one instance absorbs before its queue builds, and raise the bill in exactly the same proportion. Scaling up is the fast fix; scaling out is the resilient one.',
    affects: ['capacity', 'cost', 'latency'],
    options,
    ...opts,
  }
}

export function replicaProp(opts: Partial<PropDef> = {}): PropDef {
  return {
    key: 'replicas',
    label: 'Instances',
    type: 'number',
    default: 2,
    min: 1,
    max: 50,
    step: 1,
    help: 'How many identical copies run behind the load balancer.',
    impact:
      'Capacity scales linearly with count. Availability improves non-linearly: going from one to two removes the single point of failure, and everything after that is headroom for a bad deploy or a lost zone.',
    affects: ['capacity', 'availability', 'cost'],
    danger: (v) => (Number(v) === 1 ? 'A single instance means every restart, patch or hardware fault is a full outage.' : null),
    ...opts,
  }
}

export function multiAzProp(label = 'Multi-AZ', opts: Partial<PropDef> = {}): PropDef {
  return {
    key: 'multiAz',
    label,
    type: 'boolean',
    default: false,
    help: 'Runs a standby in a second availability zone — a physically separate datacentre on the same low-latency network.',
    impact:
      'Survives the loss of an entire zone with an automatic failover of roughly a minute, and roughly doubles the compute cost. Without it a zone outage is your outage.',
    affects: ['availability', 'cost'],
    ...opts,
  }
}

export function publicAccessProp(opts: Partial<PropDef> = {}): PropDef {
  return {
    key: 'publicAccess',
    label: 'Public endpoint',
    type: 'boolean',
    default: false,
    help: 'Whether the resource is reachable from the public internet as well as from inside your network.',
    impact:
      'Turning this on makes the resource addressable by anyone on the internet — including every automated scanner, which will find it within minutes. Keep it off and reach the resource privately.',
    affects: ['security'],
    danger: (v) => (v === true ? 'Publicly reachable. Scanners find new public endpoints in minutes, not days.' : null),
    ...opts,
  }
}

export function encryptionProp(opts: Partial<PropDef> = {}): PropDef {
  return {
    key: 'encryption',
    label: 'Encryption at rest',
    type: 'select',
    default: 'provider',
    help: 'Who holds the key that protects the stored bytes.',
    impact:
      'Provider-managed keys are free and invisible. Customer-managed keys let you audit every decrypt and revoke access instantly — which is the difference between a breach and a contained incident.',
    affects: ['security', 'cost'],
    options: [
      { value: 'none', label: 'None', note: 'Fails almost every compliance regime' },
      { value: 'provider', label: 'Provider-managed key', note: 'On by default, no extra cost' },
      { value: 'cmk', label: 'Customer-managed key', note: 'Auditable, revocable, small per-request cost' },
    ],
    danger: (v) => (v === 'none' ? 'Unencrypted at rest. A stolen disk image or snapshot is readable plaintext.' : null),
    ...opts,
  }
}

export function autoscaleProps(): PropDef[] {
  return [
    {
      key: 'autoscale',
      label: 'Autoscaling',
      type: 'boolean',
      default: false,
      help: 'Adds and removes instances automatically based on a target metric.',
      impact:
        'Absorbs traffic spikes without anyone being paged, but new instances take time to boot and warm up. If your spike is faster than that, autoscaling arrives after the outage.',
      affects: ['capacity', 'cost', 'availability'],
    },
    {
      key: 'maxReplicas',
      label: 'Maximum instances',
      type: 'number',
      default: 10,
      min: 1,
      max: 200,
      help: 'The ceiling autoscaling will not go past.',
      impact: 'Protects the bill during a traffic flood — and caps how much legitimate traffic you can serve during a real one.',
      affects: ['capacity', 'cost'],
      visibleWhen: (p) => p.autoscale === true,
    },
    {
      key: 'targetCpu',
      label: 'Target CPU',
      type: 'number',
      default: 65,
      min: 20,
      max: 95,
      unit: '%',
      help: 'The average utilisation autoscaling tries to hold.',
      impact:
        'A low target keeps spare capacity ready and costs more. A high target is efficient until a spike arrives and there is no headroom left to ride it out while new instances boot.',
      affects: ['capacity', 'cost', 'latency'],
      visibleWhen: (p) => p.autoscale === true,
    },
  ]
}

export function backupProps(): PropDef[] {
  return [
    {
      key: 'backupRetention',
      label: 'Backup retention',
      type: 'number',
      default: 7,
      min: 0,
      max: 35,
      unit: ' days',
      help: 'How far back you can restore the data to.',
      impact:
        'Sets your recovery window. Zero days means a bad migration or a ransomware event is unrecoverable. Ransomware in particular often dwells for weeks before triggering, so short retention can mean every backup you hold is already poisoned.',
      affects: ['durability', 'cost'],
      danger: (v) => (Number(v) === 0 ? 'No backups. There is no undo for a bad migration, a bad delete, or ransomware.' : null),
    },
  ]
}

export const TIER_NOTE = 'Prices are simplified teaching figures, not quotes. Always check the provider calculator.'
