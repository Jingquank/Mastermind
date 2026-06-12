import { describe, expect, it } from 'vitest'
import { detectDocScript, hashBlock, segmentBlocks, validateTranslatedBlock } from '../src/shared/blocks'

const DOC = [
  '# Title',
  '',
  'First paragraph with {++an insertion++}.',
  '',
  '- item one',
  '- item two {>>@ke: note<<}',
  '',
  '```js',
  'code()',
  '```',
  '',
  '> a quote',
].join('\n')

describe('segmentBlocks', () => {
  it('splits headings, paragraphs, list items, code, quotes', async () => {
    const blocks = await segmentBlocks(DOC)
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'listItem', 'listItem', 'code', 'blockquote'])
    expect(blocks[2]!.text).toBe('- item one')
    expect(blocks.find((b) => b.kind === 'code')!.translatable).toBe(false)
  })

  it('hashes are stable and content-keyed', async () => {
    const a = await hashBlock('paragraph', 'same text')
    const b = await hashBlock('paragraph', 'same text')
    const c = await hashBlock('paragraph', 'different text')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('editing one paragraph changes only that block hash', async () => {
    const v1 = await segmentBlocks(DOC)
    const v2 = await segmentBlocks(DOC.replace('First paragraph', 'Edited paragraph'))
    expect(v2[1]!.hash).not.toBe(v1[1]!.hash)
    expect(v2[0]!.hash).toBe(v1[0]!.hash)
    expect(v2[2]!.hash).toBe(v1[2]!.hash)
  })
})

describe('validateTranslatedBlock', () => {
  it('accepts structure-preserving translations', () => {
    const original = 'Body {++added words++} and {>>@ke: why?<<} end.'
    const translated = '正文{++添加的文字++}以及{>>@ke: 为什么？<<}结束。'
    expect(validateTranslatedBlock(original, translated)).toBe(true)
  })

  it('rejects dropped or reordered marks', () => {
    const original = 'Body {++added++} and {--gone--}.'
    expect(validateTranslatedBlock(original, '正文 added 和 {--gone--}。')).toBe(false)
    expect(validateTranslatedBlock(original, '正文 {--gone--} 和 {++added++}。')).toBe(false)
  })

  it('plain blocks validate trivially', () => {
    expect(validateTranslatedBlock('plain text', '纯文本')).toBe(true)
  })
})

describe('detectDocScript', () => {
  it('classifies latin and cjk documents', () => {
    expect(detectDocScript('# Plan\n\nThis is an English document about software.')).toBe('latin')
    expect(detectDocScript('# 计划\n\n这是一份关于软件的中文文档，内容很长。')).toBe('cjk')
  })
})
