// @vitest-environment jsdom
/// <reference lib="dom" />
import { defaultValueCtx, Editor, parserCtx, remarkStringifyOptionsCtx, rootCtx, serializerCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import type { Node as PMNode } from '@milkdown/kit/prose/model'
import { EditorState, type Transaction } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { beforeAll, describe, expect, it } from 'vitest'
import { critic } from '../src/ui/modes/editing/critic'
import { resolveCriticInEditor } from '../src/ui/modes/editing/critic/resolve'
import type { CriticKind } from '../src/shared/critic/types'

let parse: (md: string) => PMNode
let serialize: (doc: PMNode) => string

beforeAll(async () => {
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, document.createElement('div'))
      ctx.set(defaultValueCtx, '')
      ctx.set(remarkStringifyOptionsCtx, { bullet: '-', emphasis: '*', strong: '*', fence: '`', fences: true, listItemIndent: 'one', rule: '-' })
    })
    .use(critic)
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

/** Resolve span 0 in `md` and return the serialized result, trimmed. */
function run(md: string, kind: CriticKind, mode: 'accept' | 'reject'): string {
  let st = EditorState.create({ doc: parse(md), schema: parse(md).type.schema })
  const view = {
    get state() {
      return st
    },
    dispatch: (tr: Transaction) => {
      st = st.apply(tr)
    },
  } as unknown as EditorView
  const ok = resolveCriticInEditor(view, 0, kind, mode)
  expect(ok, `span 0 (${kind}) should be found`).toBe(true)
  return serialize(st.doc).trim()
}

describe('resolveCriticInEditor — PM transactions for all five kinds', () => {
  it('insertion: accept keeps, reject deletes', () => {
    expect(run('x{++b++}y', 'ins', 'accept')).toBe('xby')
    expect(run('x{++b++}y', 'ins', 'reject')).toBe('xy')
  })

  it('deletion: accept deletes, reject keeps', () => {
    expect(run('x{--b--}y', 'del', 'accept')).toBe('xy')
    expect(run('x{--b--}y', 'del', 'reject')).toBe('xby')
  })

  it('substitution: accept takes new arm, reject takes old arm', () => {
    expect(run('x{~~old~>new~~}y', 'sub', 'accept')).toBe('xnewy')
    expect(run('x{~~old~>new~~}y', 'sub', 'reject')).toBe('xoldy')
  })

  it('highlight: both unwrap to the content', () => {
    expect(run('x{==h==}y', 'highlight', 'accept')).toBe('xhy')
    expect(run('x{==h==}y', 'highlight', 'reject')).toBe('xhy')
  })

  it('comment: both remove the marker', () => {
    expect(run('x{>>note<<}y', 'comment', 'accept')).toBe('xy')
    expect(run('x{>>note<<}y', 'comment', 'reject')).toBe('xy')
  })

  it('returns false for an unknown span index', () => {
    const st = EditorState.create({ doc: parse('x{++b++}y'), schema: parse('x').type.schema })
    const view = { state: st, dispatch: () => {} } as unknown as EditorView
    expect(resolveCriticInEditor(view, 99, 'ins', 'accept')).toBe(false)
  })
})
