import { defineConfig } from 'vite'
import path from 'node:path'

const here = import.meta.dirname

/**
 * Builds the MCP server as a Node bundle. It imports the catalog, the
 * simulation engine and the codex straight from `src/`, so the server can never
 * drift from the application it describes.
 */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(here, 'src') } },
  // lz-string is CommonJS; bundling it avoids a named-export mismatch under Node ESM.
  ssr: { noExternal: ['lz-string'] },
  build: {
    ssr: true,
    target: 'node22',
    outDir: 'dist-mcp',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: {
        stdio: path.resolve(here, 'mcp/stdio.ts'),
        http: path.resolve(here, 'mcp/http.ts'),
      },
      output: { format: 'esm', entryFileNames: '[name].mjs' },
      external: ['puppeteer-core', '@modelcontextprotocol/sdk', /^@modelcontextprotocol\/sdk\//, 'zod', /^node:/],
    },
  },
})
