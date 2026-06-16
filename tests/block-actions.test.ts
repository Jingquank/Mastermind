// @vitest-environment jsdom
/// <reference lib="dom" />
import { describe, expect, it } from 'vitest'
import { blockContentRanges } from '../src/ui/modes/reading/selection'
import { commentEdits, deletionWrap, sanitizeComment } from '../src/ui/modes/reading/marks'

// Mirrors the renderer: a block carries data-ps/data-pe for its whole node, and
// its inline text is wrapped in spans whose data-ps/data-pe start AFTER the markdown
// prefix (`## `, `- `) and span across inline markup (`**bold**`). BlockActions maps
// a whole block to source via blockContentRanges (min data-ps / max data-pe), so the
// mark excludes the prefix, includes inline markup, and splits around existing marks.
function build(html: string): HTMLElement {
  document.body.innerHTML = `<div class="md-root">${html}</div>`
  return document.querySelector('.md-root') as HTMLElement
}

describe('blockContentRanges (the BlockActions whole-block path)', () => {
  it('maps a plain paragraph to its whole content', () => {
    const src = 'A plain paragraph.'
    const root = build('<p data-ps="0" data-pe="18"><span data-ps="0" data-pe="18">A plain paragraph.</span></p>')
    expect(blockContentRanges(root.querySelector('p')!, src, [])).toEqual([{ from: 0, to: 18, text: 'A plain paragraph.' }])
  })

  it('excludes the `## ` heading prefix', () => {
    const src = '## Heading'
    const root = build('<h2 data-ps="0" data-pe="10"><span data-ps="3" data-pe="10">Heading</span></h2>')
    expect(blockContentRanges(root.querySelector('h2')!, src, [])).toEqual([{ from: 3, to: 10, text: 'Heading' }])
  })

  it('excludes the `- ` list marker', () => {
    const src = '- Item one'
    const root = build('<li data-ps="0" data-pe="10"><span data-ps="2" data-pe="10">Item one</span></li>')
    expect(blockContentRanges(root.querySelector('li')!, src, [])).toEqual([{ from: 2, to: 10, text: 'Item one' }])
  })

  // The regression: with inline formatting the rendered text ("Para with bold inside.")
  // differs from the source slice ("Para with **bold** inside."), which broke the old
  // selectNodeContents→rangeToSourceRanges path (it returned unmapped → silent no-op).
  it('spans inline markup like **bold** (the silent-no-op bug)', () => {
    const src = 'Para with **bold** inside.'
    const root = build(
      '<p data-ps="0" data-pe="26">' +
        '<span data-ps="0" data-pe="10">Para with </span>' +
        '<strong data-ps="10" data-pe="18"><span data-ps="12" data-pe="16">bold</span></strong>' +
        '<span data-ps="18" data-pe="26"> inside.</span>' +
        '</p>',
    )
    expect(blockContentRanges(root.querySelector('p')!, src, [])).toEqual([
      { from: 0, to: 26, text: 'Para with **bold** inside.' },
    ])
  })

  it('splits around an existing mark inside the block', () => {
    const src = 'A {==hi==} B'
    const root = build(
      '<p data-ps="0" data-pe="12">' +
        '<span data-ps="0" data-pe="2">A </span>' +
        '<mark class="critic critic-hl" data-span-index="0"><span data-ps="5" data-pe="7">hi</span></mark>' +
        '<span data-ps="10" data-pe="12"> B</span>' +
        '</p>',
    )
    const spans = [{ kind: 'highlight' as const, start: 2, end: 10, innerStart: 5, innerEnd: 7 }]
    expect(blockContentRanges(root.querySelector('p')!, src, spans)).toEqual([
      { from: 0, to: 2, text: 'A ' },
      { from: 10, to: 12, text: ' B' },
    ])
  })

  it('does not reach into a nested sub-list under a list item', () => {
    const src = '- outer\n  - inner'
    // tight list: parent text is a direct child of the outer <li>, the sub-list is nested
    const root = build(
      '<li data-ps="2" data-pe="17">' +
        '<span data-ps="2" data-pe="7">outer</span>' +
        '<ul data-ps="10" data-pe="17"><li data-ps="10" data-pe="17"><span data-ps="12" data-pe="17">inner</span></li></ul>' +
        '</li>',
    )
    // only the parent's own text — never the nested item (which would cross a block boundary)
    expect(blockContentRanges(root.querySelector('li')!, src, [])).toEqual([{ from: 2, to: 7, text: 'outer' }])
  })

  it('maps a loose list item via its paragraph, not the wrapping <li>', () => {
    const src = '- First\n\n  Second'
    // loose list: each item's text is wrapped in a <p>; hovering text resolves to that <p>
    const root = build(
      '<li data-ps="2" data-pe="17">' +
        '<p data-ps="2" data-pe="7"><span data-ps="2" data-pe="7">First</span></p>' +
        '<p data-ps="11" data-pe="17"><span data-ps="11" data-pe="17">Second</span></p>' +
        '</li>',
    )
    // the <p> the pointer is over maps to just that paragraph
    expect(blockContentRanges(root.querySelector('p')!, src, [])).toEqual([{ from: 2, to: 7, text: 'First' }])
    // the wrapping <li> contains only nested blocks → nothing directly markable
    expect(blockContentRanges(root.querySelector('li')!, src, [])).toEqual([])
  })

  it('returns [] when the block has no inline content to mark', () => {
    const src = '## Heading'
    const root = build('<h2 data-ps="0" data-pe="10"><span data-ps="3" data-pe="10">Heading</span></h2>')
    // a mark covering the whole content leaves no markable gap
    expect(blockContentRanges(root.querySelector('h2')!, src, [{ kind: 'highlight', start: 1, end: 10, innerStart: 3, innerEnd: 10 }])).toEqual([])
  })
})

describe('mark builders', () => {
  it('deletionWrap wraps a slice as `{--…--}`', () => {
    expect(deletionWrap('Heading')).toBe('{--Heading--}')
  })

  it('commentEdits anchors the comment on the first range only', () => {
    const ranges = [
      { from: 3, to: 10, text: 'Heading' },
      { from: 14, to: 22, text: 'Item one' },
    ]
    expect(commentEdits(ranges, 'ke', 'a note')).toEqual([
      { from: 3, to: 10, insert: '{==Heading==}{>>@ke: a note<<}' },
    ])
  })

  it('sanitizeComment collapses blank lines and defuses closers', () => {
    expect(sanitizeComment('one\n\n\ntwo')).toBe('one\ntwo')
    expect(sanitizeComment('ends a thread <<}')).toBe('ends a thread << }')
  })
})
