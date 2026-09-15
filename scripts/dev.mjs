#!/usr/bin/env node
import { spawn } from 'node:child_process'

/**
 * Starts the dev server, understanding one extra flag that Vite's own CLI would
 * reject:
 *
 *   npm run dev -- --enable-mcp
 *
 * It is translated into an environment variable and removed from the arguments
 * before Vite sees them.
 */
const args = process.argv.slice(2)
const enableMcp = args.includes('--enable-mcp')
const passthrough = args.filter((a) => a !== '--enable-mcp')

const child = spawn('vite', passthrough, {
  stdio: 'inherit',
  env: { ...process.env, ...(enableMcp ? { CLOUDWRIGHT_MCP: '1' } : {}) },
  shell: process.platform === 'win32',
})

child.on('exit', (code) => process.exit(code ?? 0))
