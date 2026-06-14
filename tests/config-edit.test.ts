import { describe, expect, it } from 'vitest'
import { applyAssignments, coerceConfigValue, getDotted, parseAssignment } from '../src/cli/config-edit'
import { DEFAULT_CONFIG } from '../src/server/config'

const asRec = (o: unknown) => o as Record<string, unknown>

describe('config-edit', () => {
  it('preserves siblings on a dotted set (the shallow-merge workaround)', () => {
    const { patch } = applyAssignments(DEFAULT_CONFIG, [{ key: 'langPair.a', value: 'Spanish' }])
    expect(patch.langPair).toEqual({ a: 'Spanish', b: 'Simplified Chinese' })
  })

  it('coerces numeric keys to finite positive numbers, rejecting junk/empty/zero', () => {
    expect(coerceConfigValue('fontSize', '18')).toBe(18)
    expect(coerceConfigValue('lineHeight', '1.6')).toBe(1.6)
    expect(() => coerceConfigValue('fontSize', 'abc')).toThrow()
    expect(() => coerceConfigValue('contentWidth', '736px')).toThrow()
    expect(() => coerceConfigValue('fontSize', '')).toThrow()
    expect(() => coerceConfigValue('fontSize', '0')).toThrow()
    expect(() => coerceConfigValue('fontSize', '-3')).toThrow()
  })

  it('leaves non-numeric keys as strings', () => {
    expect(coerceConfigValue('theme', 'nacht')).toBe('nacht')
    expect(coerceConfigValue('langPair.a', 'English')).toBe('English')
  })

  it('rejects unknown top-level keys (typo guard)', () => {
    expect(() => applyAssignments(DEFAULT_CONFIG, [{ key: 'them', value: 'grid' }])).toThrow(/unknown config key/)
  })

  it('rejects dotting into a scalar field (no string→object corruption)', () => {
    expect(() => applyAssignments(DEFAULT_CONFIG, [{ key: 'browser.foo', value: 'bar' }])).toThrow()
  })

  it('parseAssignment splits on the first =', () => {
    expect(parseAssignment('langPair.a=English')).toEqual({ key: 'langPair.a', value: 'English' })
    expect(parseAssignment('x=a=b')).toEqual({ key: 'x', value: 'a=b' })
    expect(() => parseAssignment('noequals')).toThrow()
  })

  it('builds a patch only for the touched top-level keys', () => {
    const { patch } = applyAssignments(DEFAULT_CONFIG, [
      { key: 'theme', value: 'nacht' },
      { key: 'browser', value: 'Safari' },
    ])
    expect(Object.keys(patch).sort()).toEqual(['browser', 'theme'])
    expect(patch.theme).toBe('nacht')
    expect(patch.browser).toBe('Safari')
  })

  it('getDotted resolves nested keys and misses safely', () => {
    expect(getDotted(asRec(DEFAULT_CONFIG), 'langPair.b')).toBe('Simplified Chinese')
    expect(getDotted(asRec(DEFAULT_CONFIG), 'nope.nope')).toBeUndefined()
  })
})
