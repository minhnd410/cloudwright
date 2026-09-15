import { describe, expect, it } from 'vitest'
import { createCloudwrightServer } from '../mcp/server'

/**
 * The MCP server is mostly a thin shell over code the other suites cover, but a
 * malformed tool schema only fails at connect time — which is too late.
 */
describe('mcp server', () => {
  it('constructs with every tool and resource registered', () => {
    const server = createCloudwrightServer({ appUrl: 'http://localhost:5173' })
    // The SDK keeps registrations on the underlying server; reaching for them
    // here is deliberate: it is the only way to assert they exist without a
    // transport.
    const registered = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools
    const names = Object.keys(registered)

    for (const expected of [
      'list_resources', 'describe_resource', 'suggest_ports', 'create_diagram',
      'simulate', 'review_diagram', 'compare_diagrams', 'share_url',
      'screenshot_diagram', 'record_video',
    ]) {
      expect(names, `missing tool ${expected}`).toContain(expected)
    }
  })

  it('omits the visual tools when they are disabled', () => {
    const server = createCloudwrightServer({ visualsEnabled: false })
    const names = Object.keys((server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools)
    expect(names).not.toContain('screenshot_diagram')
    expect(names).not.toContain('record_video')
    expect(names).toContain('simulate')
  })
})
