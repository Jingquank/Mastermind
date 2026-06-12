import { describe, expect, it } from 'vitest'
import { processFeedbackLanguage } from '../src/server/feedback'
import { DEFAULT_CONFIG } from '../src/server/config'
import type { MastermindConfig } from '../src/shared/types'

const CONFIG: MastermindConfig = {
  ...DEFAULT_CONFIG,
  provider: { type: 'openai-compatible', baseUrl: 'http://localhost:9', model: 'mock' },
}

const fakeTranslate = async (_p: unknown, text: string): Promise<string> => `[EN] ${text}`

const EN_DOC = 'This is an English document about software design.\n\nBody {>>@ke: 这里需要更多细节<<} end.\n'

describe('feedback language rule', () => {
  it('translates a CJK comment in a latin doc, keeping the author tag', async () => {
    const out = await processFeedbackLanguage(EN_DOC, CONFIG, fakeTranslate as never)
    expect(out).toContain('{>>@ke: [EN] 这里需要更多细节<<}')
  })

  it('keeps the original alongside when configured', async () => {
    const out = await processFeedbackLanguage(
      EN_DOC,
      { ...CONFIG, keepOriginalFeedback: true },
      fakeTranslate as never,
    )
    expect(out).toContain('{>>@ke: [EN] 这里需要更多细节 (original: 这里需要更多细节)<<}')
  })

  it('leaves same-language comments untouched', async () => {
    const doc = 'English doc.\n\nBody {>>@ke: looks good to me<<} end.\n'
    expect(await processFeedbackLanguage(doc, CONFIG, fakeTranslate as never)).toBe(doc)
  })

  it('passes through when no provider is configured', async () => {
    expect(await processFeedbackLanguage(EN_DOC, DEFAULT_CONFIG, fakeTranslate as never)).toBe(EN_DOC)
  })

  it('keeps the comment as typed when the provider fails', async () => {
    const failing = async (): Promise<string> => {
      throw new Error('boom')
    }
    expect(await processFeedbackLanguage(EN_DOC, CONFIG, failing as never)).toBe(EN_DOC)
  })

  it('handles multiple comments and non-tagged comments', async () => {
    const doc = 'English doc body text here.\n\nA {>>第一条<<} B {>>@agent: second is english<<} C {>>第三条<<}\n'
    const out = await processFeedbackLanguage(doc, CONFIG, fakeTranslate as never)
    expect(out).toContain('{>>[EN] 第一条<<}')
    expect(out).toContain('{>>@agent: second is english<<}')
    expect(out).toContain('{>>[EN] 第三条<<}')
  })
})
