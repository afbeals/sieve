import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Main-process/shared tests (fileOps, db, settings, paths, tokenize) run against real Node
// APIs (fs, node:sqlite) in the default `node` environment. Renderer tests need a DOM instead -
// each renderer test file opts into that itself via a `// @vitest-environment jsdom` docblock
// at the top of the file, matching how the app itself is split into a Node-side main process
// and a browser-side renderer. `setupFiles` runs for every file regardless of environment, but
// setup.ts guards its DOM polyfills so it's a no-op under `node`.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['src/renderer/src/test/setup.ts'],
    include: ['src/**/__tests__/**/*.test.{ts,tsx}']
  }
})
