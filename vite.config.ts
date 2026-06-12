import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Dev mode: the daemon runs on a fixed port (MASTERMIND_PORT=5199, see the dev
// script) and Vite proxies API/theme requests to it. In production the daemon
// serves dist/ui itself.
const DEV_DAEMON = 'http://127.0.0.1:5199'

export default defineConfig({
  root: 'src/ui',
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/ui'),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': { target: DEV_DAEMON },
      '/themes': { target: DEV_DAEMON },
    },
  },
})
