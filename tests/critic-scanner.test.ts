import { describe, expect, it } from 'vitest'
import { group, parseAuthor, reviewCounts, scan } from '../src/shared/critic/scanner'
import type { CriticSpan } from '../src/shared/critic/types'
import { codeRanges } from '../src/shared/markdown/exclusions'

function scanWithCode(text: string): CriticSpan[] {
  return scan(text, codeRanges(text))
}

function sliceOf(text: string, span: CriticSpan): string {
  return text.slice(span.start, span.end)
}

describe('scanner: the five marks', () => {
  it('finds all five kinds with exact offsets', () => {
    const text = 'A {++ins++} B {--del--} C {~~old~>new~~} D {==hl==} E {>>note<<} F'
    const spans = scan(text)
    expect(spans.map((s) => s.kind)).toEqual(['ins', 'del', 'sub', 'highlight', 'comment'])
    expect(sliceOf(text, spans[0]!)).toBe('{++ins++}')
    expect(sliceOf(text, spans[1]!)).toBe('{--del--}')
    expect(sliceOf(text, spans[2]!)).toBe('{~~old~>new~~}')
    expect(sliceOf(text, spans[3]!)).toBe('{==hl==}')
    expect(sliceOf(text, spans[4]!)).toBe('{>>note<<}')
    expect(text.slice(spans[0]!.innerStart, spans[0]!.innerEnd)).toBe('ins')
  })

  it('extracts substitution arms', () => {
    const text = 'x {~~the old text~>the new text~~} y'
    const [sub] = scan(text)
    expect(text.slice(sub!.oldStart!, sub!.oldEnd!)).toBe('the old text')
    expect(text.slice(sub!.newStart!, sub!.newEnd!)).toBe('the new text')
  })

  it('handles empty arms and empty marks', () => {
    expect(scan('{++++}')).toHaveLength(1)
    const emptyNew = scan('{~~a~>~~}')[0]!
    expect(emptyNew.kind).toBe('sub')
    expect(emptyNew.newStart).toBe(emptyNew.newEnd)
    const emptyOld = scan('{~~~>b~~}')[0]!
    expect(emptyOld.oldStart).toBe(emptyOld.oldEnd)
  })

  it('multi-word and multi-line spans work; blank lines terminate', () => {
    const ok = 'a {++spans two\nlines++} b'
    expect(scan(ok)).toHaveLength(1)
    const bad = 'a {++crosses a\n\nblank line++} b'
    expect(scan(bad)).toHaveLength(0)
  })

  it('CJK content keeps correct offsets', () => {
    const text = '前言 {++插入的文字++} 后记 {>>@ke: 中文评论<<}'
    const spans = scan(text)
    expect(sliceOf(text, spans[0]!)).toBe('{++插入的文字++}')
    expect(text.slice(spans[1]!.innerStart, spans[1]!.innerEnd)).toBe('@ke: 中文评论')
  })

  it('adjacent same-kind marks stay separate', () => {
    const spans = scan('{++a++}{++b++}')
    expect(spans).toHaveLength(2)
    expect(spans[0]!.end).toBe(spans[1]!.start)
  })

  it('a sub does not get mangled next to real strikethrough', () => {
    const text = 'keep ~~struck~~ and {~~a~>b~~} both'
    const spans = scan(text)
    expect(spans).toHaveLength(1)
    expect(sliceOf(text, spans[0]!)).toBe('{~~a~>b~~}')
  })

  it('{~~a~~} without an arrow is not a substitution', () => {
    expect(scan('{~~a~~}')).toHaveLength(0)
  })

  it('a stray ~> later in the doc cannot stretch a substitution', () => {
    const text = '{~~a~~} then ~> and ~~}'
    expect(scan(text)).toHaveLength(0)
  })

  it('unclosed openers are literal, later marks still parse', () => {
    const text = '{++ unclosed but {--del--} works'
    const spans = scan(text)
    expect(spans).toHaveLength(1)
    expect(spans[0]!.kind).toBe('del')
  })
})

describe('scanner: escapes and code exclusion', () => {
  it('backslash defeats an opener; double backslash does not', () => {
    expect(scan('\\{++not a mark++}')).toHaveLength(0)
    expect(scan('\\\\{++real++}')).toHaveLength(1)
  })

  it('ignores decoys inside fenced code, inline code, and html', () => {
    const text = [
      'real {++one++}',
      '```',
      'decoy {--nope--}',
      '```',
      'inline `x {==nah==} y` end',
      '<!-- {>>hidden<<} -->',
    ].join('\n')
    const spans = scanWithCode(text)
    expect(spans).toHaveLength(1)
    expect(spans[0]!.kind).toBe('ins')
  })

  it('a closer inside inline code does not close the mark', () => {
    const text = 'a {++uses `x++}` and ends++} b'
    const spans = scanWithCode(text)
    expect(spans).toHaveLength(1)
    expect(sliceOf(text, spans[0]!)).toBe('{++uses `x++}` and ends++}')
  })

  it('marks inside list items and blockquotes parse', () => {
    const text = '- item {++added++}\n\n> quoted {--removed--}\n> {>>note across\n> lines<<}'
    const spans = scanWithCode(text)
    expect(spans.map((s) => s.kind)).toEqual(['ins', 'del', 'comment'])
  })
})

describe('grouping', () => {
  it('anchored comment + thread + orphan + standalone highlight', () => {
    const text = '{==span==}{>>@ke: first<<}{>>@agent: reply<<} mid {>>orphan<<} tail {==alone==}'
    const items = group(scan(text), text)
    expect(items.map((i) => i.type)).toEqual(['thread', 'thread', 'highlight'])
    const anchored = items[0]!
    if (anchored.type !== 'thread') throw new Error('expected thread')
    expect(anchored.anchor).not.toBeNull()
    expect(anchored.comments).toHaveLength(2)
    expect(anchored.comments[0]!.author).toBe('ke')
    expect(anchored.comments[1]!.author).toBe('agent')
    expect(anchored.comments[1]!.body).toBe('reply')
    const orphan = items[1]!
    if (orphan.type !== 'thread') throw new Error('expected thread')
    expect(orphan.anchor).toBeNull()
    expect(orphan.comments[0]!.author).toBeNull()
  })

  it('a gap breaks adjacency', () => {
    const text = '{==span==} {>>not anchored<<}'
    const items = group(scan(text), text)
    expect(items.map((i) => i.type)).toEqual(['highlight', 'thread'])
  })

  it('counts: anchored highlights are not standalone', () => {
    const text = '{++a++} {--b--} {~~c~>d~~} {==anchored==}{>>one<<}{>>two<<} {==alone==}'
    const items = group(scan(text), text)
    expect(reviewCounts(items)).toEqual({ comments: 2, edits: 3, highlights: 1 })
  })
})

describe('author parsing', () => {
  it('parses tags and tolerates none', () => {
    expect(parseAuthor('@ke: hello')).toEqual({ author: 'ke', body: 'hello' })
    expect(parseAuthor('  @agent-2: hi')).toEqual({ author: 'agent-2', body: 'hi' })
    expect(parseAuthor('no tag here')).toEqual({ author: null, body: 'no tag here' })
    expect(parseAuthor('email@example.com: not a tag').author).toBeNull()
  })
})
