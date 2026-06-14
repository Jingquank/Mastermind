import { describe, it, expect } from 'vitest'
import { findLanguage, langLabel, isCjkLang, searchLanguages } from '../src/shared/languages'

describe('language resolution', () => {
  it('resolves the canonical English name', () => {
    expect(findLanguage('Simplified Chinese')?.code).toBe('zh-CN')
  })

  it('resolves legacy BCP-47 codes (back-compat with old configs)', () => {
    expect(findLanguage('en')?.name).toBe('English')
    expect(findLanguage('zh-CN')?.name).toBe('Simplified Chinese')
  })

  it('resolves endonyms and is case-insensitive', () => {
    expect(findLanguage('日本語')?.name).toBe('Japanese')
    expect(findLanguage('ENGLISH')?.name).toBe('English')
  })

  it('labels off-list values as custom, keeping the raw text', () => {
    expect(langLabel('Klingon')).toEqual({ name: 'Klingon', custom: true })
    expect(langLabel('English').custom).toBe(false)
  })
})

describe('isCjkLang (drives translation direction)', () => {
  it('flags curated CJK languages by name', () => {
    for (const v of ['Simplified Chinese', 'Traditional Chinese', 'Japanese', 'Korean']) {
      expect(isCjkLang(v)).toBe(true)
    }
  })

  it('does not flag latin-script languages', () => {
    for (const v of ['English', 'Spanish', 'German']) expect(isCjkLang(v)).toBe(false)
  })

  it('flags legacy codes and raw CJK text for custom values', () => {
    expect(isCjkLang('zh-CN')).toBe(true)
    expect(isCjkLang('ja')).toBe(true)
    expect(isCjkLang('中文')).toBe(true)
    expect(isCjkLang('한국어')).toBe(true)
  })
})

describe('searchLanguages', () => {
  it('returns the full list for an empty query', () => {
    expect(searchLanguages('').length).toBeGreaterThan(10)
  })

  it('matches name, endonym, and code', () => {
    expect(searchLanguages('chin').map((l) => l.code)).toEqual(['zh-CN', 'zh-TW'])
    expect(searchLanguages('日本').map((l) => l.code)).toEqual(['ja'])
    expect(searchLanguages('ko').map((l) => l.code)).toContain('ko')
  })

  it('returns nothing for an unmatched query (the custom fallback covers it)', () => {
    expect(searchLanguages('zzzz')).toEqual([])
  })
})
