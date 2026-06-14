/**
 * Pure helpers for `mastermind config set/get` — extracted so they can be unit-tested
 * without spawning the CLI (the entrypoint runs `program.parseAsync()` at import).
 *
 * The server merges config patches SHALLOWLY at the top level (`{ ...readConfig(), ...patch }`),
 * so a dotted edit like `langPair.a=…` must be applied onto a copy of the *current* config and
 * the WHOLE top-level key sent back — otherwise `langPair.b` (or a `grain.<theme>` sibling) is
 * silently dropped. These helpers also validate input so a malformed value can never persist
 * `NaN`/`null` or pollute the config with unknown keys.
 */

import type { MastermindConfig } from '../shared/types'

/** Writable top-level config keys (everything in MastermindConfig except the fixed `version`). */
const CONFIG_KEYS: ReadonlySet<string> = new Set([
  'theme',
  'fontSize',
  'lineHeight',
  'contentWidth',
  'authorTag',
  'typeSet',
  'monoFont',
  'codeTheme',
  'uiLang',
  'langPair',
  'browser',
  'grain',
])

const NUMERIC_KEYS: ReadonlySet<string> = new Set(['fontSize', 'lineHeight', 'contentWidth'])

export interface Assignment {
  key: string
  value: string
}

/** Split `key=value` on the first `=`. Throws on a missing/leading `=`. */
export function parseAssignment(arg: string): Assignment {
  const eq = arg.indexOf('=')
  if (eq < 1) throw new Error(`expected key=value, got: ${arg}`)
  return { key: arg.slice(0, eq), value: arg.slice(eq + 1) }
}

/** Coerce a string value for a key: numeric keys → a finite number (throws on NaN), else the string. */
export function coerceConfigValue(key: string, value: string): unknown {
  if (!NUMERIC_KEYS.has(key.split('.')[0]!)) return value
  const n = Number(value)
  if (value.trim() === '' || !Number.isFinite(n) || n <= 0) {
    throw new Error(`${key} must be a positive number, got: ${value === '' ? '(empty)' : value}`)
  }
  return n
}

function setDotted(obj: Record<string, unknown>, dotted: string, value: unknown): void {
  const parts = dotted.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]!
    const existing = cur[k]
    if (existing === undefined || existing === null) cur[k] = {}
    else if (typeof existing !== 'object') {
      throw new Error(`cannot set ${dotted}: ${parts.slice(0, i + 1).join('.')} is not a nested object`)
    }
    cur = cur[k] as Record<string, unknown>
  }
  cur[parts[parts.length - 1]!] = value
}

export function getDotted(obj: Record<string, unknown>, dotted: string): unknown {
  return dotted
    .split('.')
    .reduce<unknown>((acc, k) => (acc == null ? undefined : (acc as Record<string, unknown>)[k]), obj)
}

/**
 * Apply `key=value` assignments onto a COPY of `current`, validating each, and return the
 * patch of touched TOP-LEVEL keys (full values, so the shallow server merge preserves siblings).
 * Throws on an unknown key, a non-finite numeric, or dotting into a scalar field.
 */
export function applyAssignments(current: MastermindConfig, assignments: Assignment[]): { patch: Record<string, unknown> } {
  const next = structuredClone(current) as unknown as Record<string, unknown>
  for (const { key, value } of assignments) {
    const top = key.split('.')[0]!
    if (!CONFIG_KEYS.has(top)) throw new Error(`unknown config key: ${top}`)
    setDotted(next, key, coerceConfigValue(key, value))
  }
  const patch: Record<string, unknown> = {}
  for (const top of new Set(assignments.map((a) => a.key.split('.')[0]!))) patch[top] = next[top]
  return { patch }
}
