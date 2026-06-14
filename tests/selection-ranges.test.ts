// @vitest-environment jsdom
/// <reference lib="dom" />
import { describe, expect, it } from 'vitest'
import { rangeToSourceRanges } from '../src/ui/modes/reading/selection'

// Mirrors the renderer's output: each block carries data-ps/data-pe and wraps its
// text in a span with matching data-ps/data-pe, so pointToOffset's length-equality
// fast path applies.
const SOURCE = 'First paragraph.\n\nSecond paragraph.'

function build(): { root: HTMLElement; t0: Text; t1: Text } {
  document.body.innerHTML = `
    <div class="md-root">
      <p data-ps="0" data-pe="16"><span data-ps="0" data-pe="16">First paragraph.</span></p>
      <p data-ps="18" data-pe="35"><span data-ps="18" data-pe="35">Second paragraph.</span></p>
    </div>`
  const root = document.querySelector('.md-root') as HTMLElement
  const [s0, s1] = Array.from(root.querySelectorAll('span'))
  return { root, t0: s0!.firstChild as Text, t1: s1!.firstChild as Text }
}

function rangeOf(startNode: Node, startOff: number, endNode: Node, endOff: number): Range {
  const r = document.createRange()
  r.setStart(startNode, startOff)
  r.setEnd(endNode, endOff)
  return r
}

describe('rangeToSourceRanges', () => {
  it('single-block selection yields one range', () => {
    const { t0 } = build()
    const res = rangeToSourceRanges(rangeOf(t0, 6, t0, 15), SOURCE, [])
    expect('ranges' in res && res.ranges).toEqual([{ from: 6, to: 15, text: 'paragraph' }])
  })

  it('cross-block selection yields one range per block (start→end, start→end point)', () => {
    const { t0, t1 } = build()
    // from "paragraph." in block 0 through "Second paragraph" in block 1
    const res = rangeToSourceRanges(rangeOf(t0, 6, t1, 16), SOURCE, [])
    if (!('ranges' in res)) throw new Error(`expected ranges, got ${res.error}`)
    expect(res.ranges).toEqual([
      { from: 6, to: 16, text: 'paragraph.' },
      { from: 18, to: 34, text: 'Second paragraph' },
    ])
    // the slices are exactly what the source says — never a guess
    for (const r of res.ranges) expect(SOURCE.slice(r.from, r.to)).toBe(r.text)
  })

  it('marks around an existing mark instead of refusing the whole selection', () => {
    const { t0, t1 } = build()
    // a mark covering "paragraph" (25..34) in block 1 — the slice splits around it
    const res = rangeToSourceRanges(rangeOf(t0, 6, t1, 16), SOURCE, [
      { kind: 'highlight', start: 25, end: 34, innerStart: 27, innerEnd: 33 },
    ])
    if (!('ranges' in res)) throw new Error(`expected ranges, got ${res.error}`)
    expect(res.ranges).toEqual([
      { from: 6, to: 16, text: 'paragraph.' },
      { from: 18, to: 25, text: 'Second ' },
    ])
  })

  it('hides (errors) only when nothing in the selection is markable', () => {
    const { t0 } = build()
    // a single-block selection sitting entirely inside an existing mark
    const res = rangeToSourceRanges(rangeOf(t0, 6, t0, 15), SOURCE, [
      { kind: 'highlight', start: 4, end: 16, innerStart: 6, innerEnd: 15 },
    ])
    expect(res).toEqual({ error: 'unmapped' })
  })

  it('empty / collapsed selection is rejected', () => {
    const { t0 } = build()
    expect(rangeToSourceRanges(rangeOf(t0, 6, t0, 6), SOURCE, [])).toEqual({ error: 'empty' })
  })
})
