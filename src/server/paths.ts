import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

/**
 * Package root, resolved relative to this module. Works from both the bundled
 * output (dist/cli/*, dist/server/*) and tsx dev runs (src/server/*) — all sit
 * exactly two levels below the repo root.
 */
export const pkgRoot = fileURLToPath(new URL('../../', import.meta.url))

export const uiDir = path.join(pkgRoot, 'dist', 'ui')
export const themesDir = path.join(pkgRoot, 'themes')

export function configDir(): string {
  return process.env.MASTERMIND_CONFIG_DIR ?? path.join(os.homedir(), '.config', 'mastermind')
}

export function ensureConfigDir(): string {
  const dir = configDir()
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function stateFilePath(): string {
  return path.join(configDir(), 'server.json')
}

export function serverLogPath(): string {
  return path.join(configDir(), 'server.log')
}

export function configFilePath(): string {
  return path.join(configDir(), 'config.json')
}
