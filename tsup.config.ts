import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'cli/index': 'src/cli/index.ts',
    'server/index': 'src/server/index.ts',
  },
  outDir: 'dist',
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  splitting: false,
  // vite build writes dist/ui first; don't wipe it
  clean: false,
  // node_modules ships with the local clone — keep deps external
  skipNodeModulesBundle: true,
})
