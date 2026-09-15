#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createCloudwrightServer } from './server'
import { shutdownStaticServer } from './browser'

/**
 * Cloudwright as an MCP server over stdio — the transport every desktop MCP
 * client speaks. Nothing here writes to stdout except the protocol itself.
 */

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1]
  }
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`))
  return inline?.split('=').slice(1).join('=')
}

const server = createCloudwrightServer({
  appUrl: flag('app-url'),
  visualsEnabled: !process.argv.includes('--no-visuals'),
})

const transport = new StdioServerTransport()
await server.connect(transport)

process.stderr.write('cloudwright mcp: ready on stdio\n')

const close = () => {
  shutdownStaticServer()
  process.exit(0)
}
process.on('SIGINT', close)
process.on('SIGTERM', close)
