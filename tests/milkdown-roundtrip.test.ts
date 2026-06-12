// @vitest-environment jsdom
/// <reference lib="dom" />
import {
  defaultValueCtx,
  Editor,
  parserCtx,
  remarkStringifyOptionsCtx,
  rootCtx,
  serializerCtx,
} from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import type { Node as PMNode } from '@milkdown/kit/prose/model'
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { critic } from '../src/ui/modes/editing/critic'

/* ProseMirror needs layout APIs jsdom doesn't implement. */
function shimJsdom(): void {
  const rect = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }
  if (!Range.prototype.getBoundingClientRect || process.env.VITEST) {
    Range.prototype.getBoundingClientRect = () => rect as DOMRect
    Range.prototype.getClientRects = () =>
      ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
  }
  if (!Element.prototype.getClientRects || process.env.VITEST) {
    Element.prototype.getClientRects = () =>
      ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof window !== 'undefined' && !window.visualViewport) {
    Object.defineProperty(window, 'visualViewport', {
      value: new EventTarget(),
      configurable: true,
    })
  }
}

let editor: Editor
let parse: (md: string) => PMNode
let serialize: (doc: PMNode) => string

beforeAll(async () => {
  shimJsdom()
  editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, document.createElement('div'))
      ctx.set(defaultValueCtx, '')
      ctx.set(remarkStringifyOptionsCtx, {
        bullet: '-',
        emphasis: '*',
        strong: '*',
        fence: '`',
        fences: true,
        listItemIndent: 'one',
        rule: '-',
      })
    })
    .use(critic) // before presets: critic marks must rank outermost
    .use(commonmark)
    .use(gfm)
    .create()
  parse = (md) => {
    const doc = editor.ctx.get(parserCtx)(md)
    if (!doc || typeof doc === 'string') throw new Error('parse failed')
    return doc as PMNode
  }
  serialize = (doc) => editor.ctx.get(serializerCtx)(doc)
})

afterAll(async () => {
  await editor.destroy()
})

/** serialize(parse(md)) with the canonical trailing newline trimmed. */
function rt(md: string): string {
  return serialize(parse(md)).replace(/\n$/, '')
}

/** Marks/atoms must survive a full parse→serialize→parse cycle losslessly. */
function semanticRoundTrip(md: string): void {
  const first = parse(md)
  const out = serialize(first)
  const second = parse(out)
  expect(second.eq(first)).toBe(true)
}

describe('exact serialization of mark syntax (house-style sources)', () => {
  const CASES: [string, string][] = [
    ['plain insertion', 'A {++an insertion++} B'],
    ['plain deletion', 'A {--a deletion--} B'],
    ['substitution', 'A {~~the old~>the new~~} B'],
    ['highlight', 'A {==a highlight==} B'],
    ['comment', 'A {>>@ke: a note<<} B'],
    ['anchored comment', 'A {==phrase==}{>>@ke: why?<<} B'],
    ['thread', 'A {==phrase==}{>>@ke: one<<}{>>@agent: two<<} B'],
    ['adjacent same kind stay separate', '{++a++}{++b++}'],
    ['sub next to real strikethrough', 'keep ~~struck~~ and {~~a~>b~~} both'],
    ['empty new arm', 'x {~~gone~>~~} y'],
    ['mark in list item', '- item with {++added words++}'],
    ['mark in blockquote', '> quote {--removed--} tail'],
    ['inline markdown inside insertion', 'x {++has **bold** and `code`++} y'],
    ['cjk', '前言{++插入的文字++}后记，{>>@ke: 中文评论<<}。'],
    ['multi-word multi-line', 'start {++one two\nthree++} end'],
  ]

  for (const [name, md] of CASES) {
    it(name, () => {
      expect(rt(md)).toBe(md)
    })
  }
})

describe('semantic round-trip over fixtures', () => {
  const fixtures = ['kitchen-sink.md', 'demo-reading.md']
  for (const f of fixtures) {
    it(f, () => {
      const md = fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8')
      semanticRoundTrip(md)
    })
  }

  it('serialize is idempotent on the kitchen sink', () => {
    const md = fs.readFileSync(path.join(__dirname, 'fixtures', 'kitchen-sink.md'), 'utf8')
    const once = serialize(parse(md))
    const twice = serialize(parse(once))
    expect(twice).toBe(once)
  })
})

describe('fidelity details', () => {
  it('substitution arms survive verbatim', () => {
    const out = rt('A {~~the old~>the new~~} B')
    expect(out).toContain('{~~the old~>the new~~}')
  })

  it('comments preserve author tags and unicode', () => {
    const out = rt('note{>>@ke: 中文 with spaces and: colons<<}')
    expect(out).toContain('{>>@ke: 中文 with spaces and: colons<<}')
  })

  it('literal critic syntax typed as text stays text (protective escape)', () => {
    const md = '\\{++literal braces++}'
    const out = serialize(parse(md))
    // must NOT come back as a live insertion on reparse
    const again = parse(out)
    let hasCritic = false
    again.descendants((node) => {
      if (node.marks.some((m) => m.type.name === 'criticInsert')) hasCritic = true
    })
    expect(hasCritic).toBe(false)
    expect(rt(md)).toBe(md)
  })

  it('decoys inside code fences stay literal', () => {
    const md = '```\n{--decoy--}\n```'
    expect(rt(md)).toBe(md)
    semanticRoundTrip(md)
  })

  it('marks carry distinct spanIndex attrs (no adjacent coalescing)', () => {
    const doc = parse('{++a++}{++b++}')
    const seen: number[] = []
    doc.descendants((node) => {
      for (const m of node.marks) {
        if (m.type.name === 'criticInsert') seen.push(m.attrs.spanIndex as number)
      }
    })
    expect(new Set(seen).size).toBe(2)
  })
})
