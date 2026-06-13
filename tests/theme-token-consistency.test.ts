import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * The theme contract: every theme's tokens.css must declare the IDENTICAL set of
 * semantic token NAMES (values differ per theme — that's the whole point). This
 * guards the invariant after v0.4 hoisted theme-invariant tokens into app.css
 * :root and (Phase L) split tokens.css into raw scales + semantic mapping.
 * Node-env, no React render — fits the existing test harness.
 */
const THEMES = ['grid', 'nacht', 'sepia'] as const

function tokenNames(theme: string): Set<string> {
  const path = fileURLToPath(new URL(`../themes/${theme}/tokens.css`, import.meta.url))
  const css = readFileSync(path, 'utf8')
  const names = new Set<string>()
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:/gi)) names.add(m[1]!)
  return names
}

describe('theme token contract', () => {
  const sets = Object.fromEntries(THEMES.map((t) => [t, tokenNames(t)])) as Record<string, Set<string>>

  it('every theme declares a non-empty token set', () => {
    for (const t of THEMES) expect(sets[t]!.size).toBeGreaterThan(0)
  })

  it('all themes declare the identical set of semantic token names', () => {
    const base = sets.grid!
    for (const t of THEMES) {
      if (t === 'grid') continue
      const missing = [...base].filter((n) => !sets[t]!.has(n)).sort()
      const extra = [...sets[t]!].filter((n) => !base.has(n)).sort()
      expect({ theme: t, missing, extra }).toEqual({ theme: t, missing: [], extra: [] })
    }
  })
})
