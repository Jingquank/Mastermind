import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  FONT_FACES,
  TYPE_SETS,
  MONO_FONTS,
  typeSetById,
  monoById,
  DEFAULT_TYPE_SET,
  DEFAULT_MONO,
} from '../src/ui/theme/fonts'

/**
 * The font registry is the contract behind the Settings typeface picker: every
 * family a type set or mono option names must be declared as an @font-face, and
 * every declared face must have its woff2 vendored on disk (no runtime CDN).
 */
describe('font registry', () => {
  const families = new Set(FONT_FACES.map((f) => f.family))

  it('every type set references declared display + body families', () => {
    for (const s of TYPE_SETS) {
      expect(families.has(s.displayFamily), `${s.id} display "${s.displayFamily}"`).toBe(true)
      expect(families.has(s.bodyFamily), `${s.id} body "${s.bodyFamily}"`).toBe(true)
    }
  })

  it('every mono option references a declared family', () => {
    for (const m of MONO_FONTS) expect(families.has(m.family), `${m.id} "${m.family}"`).toBe(true)
  })

  it('every declared face has a vendored woff2 on disk', () => {
    for (const f of FONT_FACES) {
      const rel = f.url.replace(/^\/themes\//, '')
      const path = fileURLToPath(new URL(`../themes/${rel}`, import.meta.url))
      expect(existsSync(path), `${f.family} → ${f.url}`).toBe(true)
    }
  })

  it('defaults resolve, and unknown ids fall back to the first option', () => {
    expect(typeSetById(DEFAULT_TYPE_SET).id).toBe(DEFAULT_TYPE_SET)
    expect(monoById(DEFAULT_MONO).id).toBe(DEFAULT_MONO)
    expect(typeSetById('nope').id).toBe(TYPE_SETS[0]!.id)
    expect(monoById('nope').id).toBe(MONO_FONTS[0]!.id)
  })
})
