import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'scanner-worker': resolve(__dirname, 'src/main/scanner-worker.ts'),
          'word-frequency-worker': resolve(__dirname, 'src/main/word-frequency-worker.ts'),
          'thumbnail-worker': resolve(__dirname, 'src/main/thumbnail-worker.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()]
  }
})
