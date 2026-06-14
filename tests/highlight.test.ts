import { describe, it, expect } from 'vitest'
import { highlight, type HlToken } from '../src/shared/highlight'

/** Concatenating token text must reproduce the input exactly — the renderer relies on this. */
function roundtrips(code: string, lang?: string): boolean {
  return highlight(code, lang).map((t) => t.value).join('') === code
}
/** Find the token type covering the first occurrence of `needle`. */
function typeOf(code: string, needle: string, lang?: string): string | undefined {
  let pos = 0
  for (const t of highlight(code, lang) as HlToken[]) {
    if (code.startsWith(needle, pos) && t.value.includes(needle)) return t.type
    pos += t.value.length
  }
  // fall back: scan tokens for one whose value contains the needle
  return highlight(code, lang).find((t) => t.value.includes(needle))?.type
}

describe('highlight tokenizer', () => {
  it('round-trips arbitrary input for every language', () => {
    const samples: Array<[string, string | undefined]> = [
      ['const x = 1 // hi\n"str"', 'ts'],
      ['def f():\n    return None  # done', 'python'],
      ['git clone https://x.git && cd x # comment', 'sh'],
      ['{ "a": 1, "b": [true, null] }', 'json'],
      ['no lang here ()[]{}<>', undefined],
      ['', 'js'],
    ]
    for (const [code, lang] of samples) expect(roundtrips(code, lang)).toBe(true)
  })

  it('classifies JS keywords, strings, numbers, comments', () => {
    const code = 'const n = 42 // note\nconst s = "hi"'
    expect(typeOf(code, 'const')).toBe('keyword')
    expect(typeOf(code, '42')).toBe('number')
    expect(typeOf(code, '// note')).toBe('comment')
    expect(typeOf(code, '"hi"')).toBe('string')
  })

  it('marks call targets as functions and members as properties', () => {
    const toks = highlight('foo(bar.baz)', 'js')
    expect(toks.find((t) => t.value === 'foo')?.type).toBe('function')
    expect(toks.find((t) => t.value === 'baz')?.type).toBe('property')
  })

  it('treats true/false/null as constants', () => {
    expect(highlight('let ok = true', 'js').find((t) => t.value === 'true')?.type).toBe('constant')
  })

  it('shell: first word is the command, $vars and -flags are distinct', () => {
    const toks = highlight('npm run build --silent $HOME', 'sh')
    expect(toks.find((t) => t.value === 'npm')?.type).toBe('function')
    expect(toks.find((t) => t.value === '--silent')?.type).toBe('property')
    expect(toks.find((t) => t.value === '$HOME')?.type).toBe('constant')
    // `run` and `build` are arguments, not commands — only `npm` is a function
    expect(toks.filter((t) => t.type === 'function').map((t) => t.value)).toEqual(['npm'])
  })

  it('shell: a new command starts after a pipe or newline', () => {
    const toks = highlight('cat f | grep x', 'sh')
    expect(toks.find((t) => t.value === 'cat')?.type).toBe('function')
    expect(toks.find((t) => t.value === 'grep')?.type).toBe('function')
  })

  it('shell: # is a comment, not in JS', () => {
    expect(highlight('echo hi # comment', 'sh').some((t) => t.type === 'comment' && t.value.includes('# comment'))).toBe(true)
    expect(highlight('a # b', 'js').some((t) => t.type === 'comment')).toBe(false)
  })

  it('json: object keys color as properties, scalars by type', () => {
    const toks = highlight('{ "name": "v", "n": 3, "ok": true }', 'json')
    expect(toks.find((t) => t.value === '"name"')?.type).toBe('property')
    expect(toks.find((t) => t.value === '"v"')?.type).toBe('string')
    expect(toks.find((t) => t.value === '3')?.type).toBe('number')
    expect(toks.find((t) => t.value === 'true')?.type).toBe('constant')
  })

  it('python: triple-quoted strings and # comments', () => {
    const toks = highlight('x = """multi\nline""" # tail', 'python')
    expect(toks.some((t) => t.type === 'string' && t.value.includes('multi\nline'))).toBe(true)
    expect(toks.some((t) => t.type === 'comment' && t.value.includes('# tail'))).toBe(true)
  })

  it('unknown language still colors strings and comments via the clike fallback', () => {
    const toks = highlight('return "x"; /* c */', 'rust')
    expect(toks.some((t) => t.type === 'string')).toBe(true)
    expect(toks.some((t) => t.type === 'comment')).toBe(true)
    expect(toks.find((t) => t.value === 'return')?.type).toBe('keyword')
  })
})
