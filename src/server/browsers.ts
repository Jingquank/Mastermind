/**
 * Installed-browser detection for the "Open in browser" preference.
 *
 * Server/CLI-only (uses `node:fs`/`node:os`) — never import from `src/shared`.
 * macOS-only for now (matches the macOS-only launcher in `cli/index.ts`); other
 * platforms get an empty list and fall back to the system default browser.
 *
 * `id` is the `.app` bundle name, which is exactly the argument `open -a <id>` wants.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { BrowserInfo } from '../shared/types'

// Known browsers by their .app name (= the `open -a <name>` argument).
const KNOWN_BROWSERS = [
  'Safari',
  'Google Chrome',
  'Arc',
  'Firefox',
  'Brave Browser',
  'Microsoft Edge',
  'Vivaldi',
  'Opera',
  'Chromium',
  'Zen',
]

function appExists(name: string): boolean {
  return [
    `/Applications/${name}.app`,
    `/System/Applications/${name}.app`,
    path.join(os.homedir(), 'Applications', `${name}.app`),
  ].some((p) => fs.existsSync(p))
}

/** Installed, launchable browsers on this Mac (empty on non-darwin). */
export function detectBrowsers(): BrowserInfo[] {
  if (process.platform !== 'darwin') return []
  return KNOWN_BROWSERS.filter(appExists).map((name) => ({ id: name, name }))
}
