import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadCache } from '../src/server/translate/cache'
import { planPretranslate, writePretranslations } from '../src/server/translate/pretranslate'
import { segmentBlocks } from '../src/shared/blocks'

const PAIR = { a: 'English', b: 'Simplified Chinese' }
const dirs: string[] = []

function tmpMd(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-pretrans-'))
  dirs.push(dir)
  const file = path.join(dir, 'doc.md')
  fs.writeFileSync(file, content)
  return file
}

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

describe('pretranslate', () => {
  it('plans translatable blocks, excluding code', async () => {
    const src = '# Title\n\nA paragraph.\n\n```ts\ncode();\n```\n\nAnother paragraph.\n'
    const file = tmpMd(src)
    const plan = await planPretranslate(file, src, PAIR)
    expect(plan.targetLang).toBe('Simplified Chinese')
    expect(plan.blocks.length).toBe(3) // heading + 2 paragraphs; the code fence is excluded
    expect(plan.blocks.some((b) => b.text.includes('```'))).toBe(false)
  })

  it('writes valid translations to a cache that loadCache reads by matching hash (parity)', async () => {
    const src = '# Title\n\nHello world.\n'
    const file = tmpMd(src)
    const plan = await planPretranslate(file, src, PAIR)
    const entries = plan.blocks.map((b) => ({ hash: b.hash, text: `[zh] ${b.text}` }))
    const res = await writePretranslations(file, src, PAIR, entries)
    expect(res.written).toBe(entries.length)
    expect(res.skipped).toBe(0)
    const cache = await loadCache(file, 'Simplified Chinese')
    for (const e of entries) expect(cache[e.hash]).toBe(e.text)
    // the cache keys are exactly the hashes the browser's segmentBlocks will request
    for (const b of (await segmentBlocks(src)).filter((x) => x.translatable)) {
      expect(cache[b.hash]).toBeDefined()
    }
  })

  it('re-plans nothing after a full write (incremental cache)', async () => {
    const src = '# Title\n\nHello world.\n'
    const file = tmpMd(src)
    const first = await planPretranslate(file, src, PAIR)
    await writePretranslations(
      file,
      src,
      PAIR,
      first.blocks.map((b) => ({ hash: b.hash, text: 'x' })),
    )
    const second = await planPretranslate(file, src, PAIR)
    expect(second.blocks.length).toBe(0)
  })

  it('rejects translations that break CriticMarkup structure', async () => {
    const src = 'A {++inserted++} word.\n'
    const file = tmpMd(src)
    const plan = await planPretranslate(file, src, PAIR)
    const bad = plan.blocks.map((b) => ({ hash: b.hash, text: 'plain text, mark dropped' }))
    const res = await writePretranslations(file, src, PAIR, bad)
    expect(res.written).toBe(0)
    expect(res.skipped).toBe(bad.length)
  })
})
