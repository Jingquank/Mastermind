import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pickTarget, previewTargetLang } from '../src/shared/translate-direction'
import { planPretranslate } from '../src/server/translate/pretranslate'

const EN = 'English'
const ZH = 'Simplified Chinese'
const latin = 'Hello world, this is an English document.'
const cjk = '你好世界，这是一段中文文档。'

describe('pickTarget direction (all four branches)', () => {
  it('latin doc, a non-CJK → target b', () => {
    expect(pickTarget(latin, { a: EN, b: ZH })).toEqual({ sourceLang: EN, targetLang: ZH })
  })
  it('latin doc, a is CJK → target a', () => {
    expect(pickTarget(latin, { a: ZH, b: EN })).toEqual({ sourceLang: EN, targetLang: ZH })
  })
  it('CJK doc, a is CJK → target b', () => {
    expect(pickTarget(cjk, { a: ZH, b: EN })).toEqual({ sourceLang: ZH, targetLang: EN })
  })
  it('CJK doc, a non-CJK → target a', () => {
    expect(pickTarget(cjk, { a: EN, b: ZH })).toEqual({ sourceLang: ZH, targetLang: EN })
  })
})

describe('CLI/browser target parity (the cache-hit invariant)', () => {
  it('planPretranslate.targetLang === previewTargetLang for the same doc + pair', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-dir-'))
    try {
      const file = path.join(dir, 'd.md')
      const src = cjk + '\n'
      fs.writeFileSync(file, src)
      const plan = await planPretranslate(file, src, { a: EN, b: ZH })
      expect(plan.targetLang).toBe(previewTargetLang(src, { a: EN, b: ZH }))
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
