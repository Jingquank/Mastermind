import type { Parent } from 'mdast'
import type { Node } from 'unist'
import { describe, expect, it } from 'vitest'
import { analyzeMarkdown } from '../src/shared/markdown/analyze'
import type { CriticCommentNode, CriticSubNode, CriticWrapNode } from '../src/shared/markdown/critic-mdast'

function collect(tree: Node, type: string): Node[] {
  const out: Node[] = []
  const walk = (n: Node): void => {
    if (n.type === type) out.push(n)
    const children = (n as Parent).children
    if (children) for (const c of children) walk(c as Node)
  }
  walk(tree)
  return out
}

function textOf(node: Node): string {
  let s = ''
  const walk = (n: Node): void => {
    if (n.type === 'text') s += (n as unknown as { value: string }).value
    const children = (n as Parent).children
    if (children) for (const c of children) walk(c as Node)
  }
  walk(node)
  return s
}

describe('criticTransform via analyzeMarkdown', () => {
  it('wraps the five kinds into typed nodes', () => {
    const { tree } = analyzeMarkdown('A {++ins++} B {--del--} C {~~old~>new~~} D {==hl==} E {>>note<<} F')
    expect(collect(tree, 'criticInsert')).toHaveLength(1)
    expect(collect(tree, 'criticDelete')).toHaveLength(1)
    expect(collect(tree, 'criticHighlight')).toHaveLength(1)
    const subs = collect(tree, 'criticSub') as CriticSubNode[]
    expect(subs).toHaveLength(1)
    expect(subs[0]!.data.old).toBe('old')
    expect(subs[0]!.data.new).toBe('new')
    const comments = collect(tree, 'criticComment') as CriticCommentNode[]
    expect(comments).toHaveLength(1)
    expect(comments[0]!.data.content).toBe('note')
    // no sentinel garbage left anywhere
    expect([...JSON.stringify(tree)].some((ch) => { const c = ch.charCodeAt(0); return c >= 0xe000 && c <= 0xe0ff })).toBe(false)
  })

  it('keeps inline markdown alive inside insertions', () => {
    const { tree } = analyzeMarkdown('x {++has **bold** and `code`++} y')
    const ins = collect(tree, 'criticInsert')[0] as CriticWrapNode
    expect(collect(ins, 'strong')).toHaveLength(1)
    expect(collect(ins, 'inlineCode')).toHaveLength(1)
  })

  it('substitution survives next to real strikethrough', () => {
    const { tree } = analyzeMarkdown('keep ~~struck~~ and {~~a~>b~~} both')
    expect(collect(tree, 'delete')).toHaveLength(1)
    expect(collect(tree, 'criticSub')).toHaveLength(1)
  })

  it('marks work inside list items and blockquotes', () => {
    const md = '- item {++added++}\n\n> quote {--removed--} tail'
    const { tree } = analyzeMarkdown(md)
    expect(collect(tree, 'criticInsert')).toHaveLength(1)
    expect(collect(tree, 'criticDelete')).toHaveLength(1)
  })

  it('adjacent atoms (thread) become two comment nodes in order', () => {
    const { tree, items } = analyzeMarkdown('{==span==}{>>@ke: a<<}{>>@agent: b<<}')
    const comments = collect(tree, 'criticComment') as CriticCommentNode[]
    expect(comments).toHaveLength(2)
    expect(comments[0]!.data.content).toBe('@ke: a')
    expect(comments[1]!.data.content).toBe('@agent: b')
    expect(items).toHaveLength(1)
    expect(items[0]!.type).toBe('thread')
  })

  it('multi-word multi-line marks wrap whole phrases', () => {
    const md = 'start {++one two\nthree++} end'
    const { tree } = analyzeMarkdown(md)
    const ins = collect(tree, 'criticInsert')[0] as CriticWrapNode
    expect(textOf(ins as Node)).toBe('one two\nthree')
  })

  it('decoys in code stay literal', () => {
    const md = 'real {++one++}\n\n```\n{--decoy--}\n```\n\nand `x {==nah==}` inline'
    const { tree } = analyzeMarkdown(md)
    expect(collect(tree, 'criticInsert')).toHaveLength(1)
    expect(collect(tree, 'criticDelete')).toHaveLength(0)
    expect(collect(tree, 'criticHighlight')).toHaveLength(0)
    const code = collect(tree, 'code')[0] as unknown as { value: string }
    expect(code.value).toBe('{--decoy--}')
  })

  it('escaped openers render literally', () => {
    const { tree } = analyzeMarkdown('\\{++literal++}')
    expect(collect(tree, 'criticInsert')).toHaveLength(0)
  })

  it('comment spanning lines in a blockquote keeps the quote intact', () => {
    const md = '> before {>>note line one\n> note line two<<} after'
    const { tree } = analyzeMarkdown(md)
    expect(collect(tree, 'blockquote')).toHaveLength(1)
    const comments = collect(tree, 'criticComment') as CriticCommentNode[]
    expect(comments).toHaveLength(1)
    // container prefixes are stripped from atom content (serializers re-add them)
    expect(comments[0]!.data.content).toBe('note line one\nnote line two')
    const quoteText = textOf(collect(tree, 'blockquote')[0]!)
    expect(quoteText).toContain('before')
    expect(quoteText).toContain('after')
  })

  it('CJK content round-trips through the transform', () => {
    const { tree } = analyzeMarkdown('前言 {++插入的文字++} 后记')
    const ins = collect(tree, 'criticInsert')[0] as CriticWrapNode
    expect(textOf(ins as Node)).toBe('插入的文字')
  })

  it('plain documents pass through untouched', () => {
    const { tree, spans, items } = analyzeMarkdown('# Hi\n\nplain paragraph')
    expect(spans).toHaveLength(0)
    expect(items).toHaveLength(0)
    expect(collect(tree, 'heading')).toHaveLength(1)
  })
})
