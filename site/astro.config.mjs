import { defineConfig } from 'astro/config'
import preact from '@astrojs/preact'

// Static output (the default). Vercel auto-detects Astro and serves the static
// build from this subdirectory (set Root Directory = site in the Vercel project).
export default defineConfig({
  integrations: [preact()],
  devToolbar: { enabled: false },
})
