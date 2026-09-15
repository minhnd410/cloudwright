import type { IncomingMessage, ServerResponse } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createCloudwrightServer } from './server'

/**
 * The same server over HTTP, mounted on the dev server at `/mcp` when Vite is
 * started with `--enable-mcp`. Stateless: one server and transport per request,
 * which keeps it safe to run alongside hot reloading.
 */
export async function handleMcpRequest(req: IncomingMessage, res: ServerResponse, appUrl: string) {
  const server = createCloudwrightServer({ appUrl })
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

  res.on('close', () => {
    void transport.close()
    void server.close()
  })

  await server.connect(transport)
  await transport.handleRequest(req, res, await readBody(req))
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  if (req.method !== 'POST') return undefined
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return undefined
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return undefined
  }
}
