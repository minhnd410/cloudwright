import { defineConfig } from 'vitest/config'
import path from 'node:path'
const here = import.meta.dirname

export default defineConfig({
  resolve: { alias: { '@': path.resolve(here, 'src') } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
