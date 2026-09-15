import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

const here = import.meta.dirname

/**
 * Mounts the MCP server on the dev server when started with `--enable-mcp`.
 * The module is loaded through Vite's own transform pipeline, so it runs the
 * TypeScript in `mcp/` directly and picks up edits without a rebuild.
 */
interface McpHttpModule {
  handleMcpRequest: (req: IncomingMessage, res: ServerResponse, appUrl: string) => Promise<void>
}

function mcpPlugin(): Plugin {
  const enabled = process.env.CLOUDWRIGHT_MCP === '1' || process.argv.includes('--enable-mcp')
  return {
    name: 'cloudwright-mcp',
    apply: 'serve',
    configureServer(server) {
      if (!enabled) return
      const port = server.config.server.port ?? 5173
      const appUrl = `http://localhost:${port}`

      server.middlewares.use('/mcp', (req, res, next) => {
        void server
          .ssrLoadModule('/mcp/http.ts')
          .then((mod) => (mod as McpHttpModule).handleMcpRequest(req, res, appUrl))
          .catch((error: unknown) => {
            server.config.logger.error(`[mcp] ${String(error)}`)
            if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: String(error) }))
            next()
          })
      })

      server.httpServer?.once('listening', () => {
        server.config.logger.info(`  ➜  MCP:     ${appUrl}/mcp  (streamable http)`)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), mcpPlugin()],
  resolve: {
    alias: { '@': path.resolve(here, 'src') },
  },
  // The MCP module is loaded through Vite's SSR pipeline; lz-string is
  // CommonJS and needs bundling for its named exports to resolve under Node.
  ssr: { noExternal: ['lz-string'] },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@xyflow')) return 'xyflow'
          if (id.includes('react-router')) return 'router'
          if (id.includes('/react/') || id.includes('/react-dom/')) return 'react'
        },
      },
    },
  },
})
