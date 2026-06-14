import { describe, expect, it } from 'vitest'
import { markEdits, type SelRange } from '../src/ui/modes/reading/selection'
import { applyTextEdits } from '../src/shared/edits'
import { scan, group } from '../src/shared/critic/scanner'

// Pure (no DOM) coverage of the cross-block apply path: given the per-block
// SelRanges the DOM mapping produces, the marks built by markEdits + applyTextEdits
// must be valid CriticMarkup that the scanner parses back to the intended marks.
// This guards the round-trip invariant the resolve/scanner tests protect.

// "First paragraph.\n\nSecond paragraph."  — two blocks, blank line between.
const SOURCE = 'First paragraph.\n\nSecond paragraph.'
// A realistic cross-block selection: from "paragraph." in block 0 through
// "Second paragraph" in block 1 (block 0: start→end, block 1: start→end point).
const CROSS: SelRange[] = [
  { from: 6, to: 16, text: 'paragraph.' },
  { from: 18, to: 34, text: 'Second paragraph' },
]

describe('markEdits — cross-block marks round-trip', () => {
  it('highlights each block independently', () => {
    const out = applyTextEdits(SOURCE, markEdits(CROSS, (s) => `{==${s}==}`))
    expect(out).toBe('First {==paragraph.==}\n\n{==Second paragraph==}.')
    const highlights = scan(out).filter((s) => s.kind === 'highlight')
    expect(highlights).toHaveLength(2)
    expect(highlights.map((h) => out.slice(h.innerStart, h.innerEnd))).toEqual(['paragraph.', 'Second paragraph'])
  })

  it('suggests deletion on each block', () => {
    const out = applyTextEdits(SOURCE, markEdits(CROSS, (s) => `{--${s}--}`))
    expect(out).toBe('First {--paragraph.--}\n\n{--Second paragraph--}.')
    expect(scan(out).filter((s) => s.kind === 'del')).toHaveLength(2)
  })

  it('attaches a comment to the first block only; later blocks stay bare highlights', () => {
    const out = applyTextEdits(
      SOURCE,
      markEdits(CROSS, (s, i) => (i === 0 ? `{==${s}==}{>>@kd: needs detail<<}` : `{==${s}==}`)),
    )
    const items = group(scan(out), out)
    const threads = items.filter((it) => it.type === 'thread')
    const bareHighlights = items.filter((it) => it.type === 'highlight')
    expect(threads).toHaveLength(1)
    expect(bareHighlights).toHaveLength(1)
    expect(threads[0]).toMatchObject({ type: 'thread' })
    if (threads[0]?.type === 'thread') {
      expect(threads[0].comments[0]?.body).toContain('needs detail')
      expect(threads[0].comments[0]?.author).toBe('kd')
    }
  })

  it('produces non-overlapping edits (applyTextEdits never throws)', () => {
    expect(() => applyTextEdits(SOURCE, markEdits(CROSS, (s) => `{==${s}==}`))).not.toThrow()
  })

  it('single range behaves exactly like the old single-block path', () => {
    const one: SelRange[] = [{ from: 6, to: 15, text: 'paragraph' }]
    expect(applyTextEdits(SOURCE, markEdits(one, (s) => `{==${s}==}`))).toBe('First {==paragraph==}.\n\nSecond paragraph.')
  })
})
