import { describe, expect, it } from 'vitest'
import { maskSource, pickSentinels } from '../src/shared/critic/mask'
import { scan } from '../src/shared/critic/scanner'

describe('maskSource', () => {
  it('preserves length exactly', () => {
    const text = 'a {++ins++} b {~~old~>new~~} c {>>note 中文 𐍈<<} d'
    const { masked } = maskSource(text, scan(text))
    expect(masked.length).toBe(text.length)
  })

  it('replaces ins delimiters with sentinel runs, keeps content', () => {
    const text = 'x {++keep **bold**++} y'
    const { masked, sentinels } = maskSource(text, scan(text))
    expect(masked).toContain('keep **bold**')
    expect(masked).toContain(sentinels.open.ins.repeat(3))
    expect(masked).toContain(sentinels.close.ins.repeat(3))
    expect(masked).not.toContain('{++')
    expect(masked).not.toContain('++}')
  })

  it('neutralizes sub/comment spans wholesale', () => {
    const text = 'a {~~`tick`~>**bold**~~} b'
    const { masked } = maskSource(text, scan(text))
    expect(masked).not.toContain('`tick`')
    expect(masked).not.toContain('**bold**')
    expect(masked.startsWith('a ')).toBe(true)
    expect(masked.endsWith(' b')).toBe(true)
  })

  it('keeps newlines and blockquote prefixes inside neutralized spans', () => {
    const text = '> quoted {>>note across\n> more lines<<} end'
    const { masked } = maskSource(text, scan(text))
    const lines = masked.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]!.startsWith('> ')).toBe(true)
    expect(masked).not.toContain('note across')
  })

  it('does not split surrogate pairs', () => {
    const text = '{>>emoji 😀 inside<<}'
    const { masked } = maskSource(text, scan(text))
    expect(masked.length).toBe(text.length)
    // well-formed check: no lone surrogates
    expect(() => encodeURIComponent(masked)).not.toThrow()
  })

  it('falls back to an alternate sentinel pool on collision', () => {
    const dirty = `uses ${String.fromCharCode(0xe000)}${String.fromCharCode(0xe001)} already {++mark++}`
    const { sentinels } = maskSource(dirty, scan(dirty))
    expect(sentinels.neutral.charCodeAt(0)).toBeGreaterThanOrEqual(0xe010)
  })

  it('pickSentinels throws only when every pool is exhausted', () => {
    let everything = ''
    for (const base of [0xe000, 0xe010, 0xe020, 0xe030, 0xe040]) {
      for (let off = 0; off < 7; off++) everything += String.fromCharCode(base + off)
    }
    expect(() => pickSentinels(everything)).toThrow()
  })
})
