import { describe, expect, it } from 'vitest'
import { applyTextEdits } from '../src/shared/edits'
import { acceptEdit, rejectEdit, resolveAll } from '../src/shared/critic/resolve'
import { scan } from '../src/shared/critic/scanner'

function accept(text: string): string {
  const spans = scan(text)
  return applyTextEdits(
    text,
    spans.map((s) => acceptEdit(text, s)),
  )
}

function reject(text: string): string {
  const spans = scan(text)
  return applyTextEdits(
    text,
    spans.map((s) => rejectEdit(text, s)),
  )
}

describe('accept/reject per kind', () => {
  it('insertion', () => {
    expect(accept('a {++new ++}b')).toBe('a new b')
    expect(reject('a {++new ++}b')).toBe('a b')
  })
  it('deletion', () => {
    expect(accept('a {--old --}b')).toBe('a b')
    expect(reject('a {--old --}b')).toBe('a old b')
  })
  it('substitution', () => {
    expect(accept('a {~~old~>new~~} b')).toBe('a new b')
    expect(reject('a {~~old~>new~~} b')).toBe('a old b')
  })
  it('highlight unwraps either way', () => {
    expect(accept('a {==text==} b')).toBe('a text b')
    expect(reject('a {==text==} b')).toBe('a text b')
  })
  it('comment is removed either way', () => {
    expect(accept('a {>>note<<} b')).toBe('a  b')
    expect(reject('a {>>note<<} b')).toBe('a  b')
  })
  it('multi-line substitution keeps newlines in the kept arm', () => {
    const text = '{~~one\ntwo~>three\nfour~~}'
    expect(accept(text)).toBe('three\nfour')
    expect(reject(text)).toBe('one\ntwo')
  })
})

describe('resolveAll', () => {
  const doc = 'A {++ins++} B {--del--} C {~~x~>y~~} D {==hl==}{>>note<<} E'

  it('accept-all applies suggestions, leaves annotations', () => {
    expect(resolveAll(doc, scan(doc), 'accept')).toBe('A ins B  C y D {==hl==}{>>note<<} E')
  })

  it('reject-all reverts suggestions, leaves annotations', () => {
    expect(resolveAll(doc, scan(doc), 'reject')).toBe('A  B del C x D {==hl==}{>>note<<} E')
  })

  it('round-trips to clean markdown when all kinds resolved', () => {
    const all = new Set(['ins', 'del', 'sub', 'highlight', 'comment'] as const)
    expect(resolveAll(doc, scan(doc), 'accept', all)).toBe('A ins B  C y D hl E')
  })

  it('handles many adjacent marks right-to-left without offset drift', () => {
    const text = '{++a++}{--b--}{~~c~>d~~}{++e++}'
    expect(resolveAll(text, scan(text), 'accept')).toBe('ade')
    expect(resolveAll(text, scan(text), 'reject')).toBe('bc')
  })
})
