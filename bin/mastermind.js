#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const entry = path.join(here, '..', 'dist', 'cli', 'index.js')

if (!existsSync(entry)) {
  console.error(
    'mastermind: build output missing.\n' +
      'Run `npm install && npm run build` in the mastermind repo, then try again.',
  )
  process.exit(1)
}

await import(entry)
