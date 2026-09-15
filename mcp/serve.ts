#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { handleMcpRequest } from './http'

/**
 * A single process that serves the built application and the MCP endpoint.
 *
 * This is what the Docker image runs: open the app in a browser at `/`, point a
 * model at `/mcp`, and the screenshot and video tools drive the very app being
 * served — no second server, no version skew between them.
 */

const PORT = Number(process.env.PORT ?? 8080)
const HOST = process.env.HOST ?? '0.0.0.0'
const DIST = resolve(process.env.CLOUDWRIGHT_DIST ?? join(process.cwd(), 'dist'))
const PUBLIC_URL = process.env.CLOUDWRIGHT_APP_URL ?? `http://localhost:${PORT}`

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
}

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const url = (req.url ?? '/').split('?')[0]
  // Resolve inside DIST only: a request for ../../etc/passwd must not escape.
  const candidate = resolve(DIST, `.${normalize(url)}`)
  const inside = candidate === DIST || candidate.startsWith(`${DIST}/`)
  const file = inside && existsSync(candidate) && extname(candidate) ? candidate : join(DIST, 'index.html')

  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('Not built. Run "npm run build" first.')
    return
  }

  const ext = extname(file)
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    // Hashed assets are immutable; the shell must never be cached.
    'cache-control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
  })
  res.end(readFileSync(file))
}

const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0]

  if (path === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, app: PUBLIC_URL, mcp: `${PUBLIC_URL}/mcp` }))
    return
  }

  if (path === '/mcp' || path.startsWith('/mcp/')) {
    handleMcpRequest(req, res, PUBLIC_URL).catch((error: unknown) => {
      process.stderr.write(`[mcp] ${String(error)}\n`)
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: String(error) }))
    })
    return
  }

  serveStatic(req, res)
})

server.listen(PORT, HOST, () => {
  process.stdout.write(`cloudwright  app ${PUBLIC_URL}\n`)
  process.stdout.write(`cloudwright  mcp ${PUBLIC_URL}/mcp  (streamable http)\n`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
