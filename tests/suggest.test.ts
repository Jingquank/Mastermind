import { describe, expect, it } from 'vitest'
import { acceptedCount, commitDecisions, validateSuggestion, type Decision } from '../src/shared/critic/suggest'

describe('validateSuggestion (the one-direction gate)', () => {
  it('accepts markup that only adds ins/del/sub and rejects back to the original', () => {
    const original = 'The quick brown fox.'
    const markup = 'The {~~quick~>swift~~} brown {--brown --}fox.'
    // rejected form must equal original — construct one that does:
    const good = 'The {~~quick~>swift~~} {--very --}brown fox.'
    expect(validateSuggestion(good, 'The quick very brown fox.').ok).toBe(true)
    void original
    void markup
  })

  it('rejects markup containing comments or highlights', () => {
    const r = validateSuggestion('Body {>>@agent: note<<} end', 'Body  end')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('wrong-kind')
  })

  it('rejects markup whose rejected form rewrites untouched text (the back-door)', () => {
    // agent silently changed "brown" → "red" outside any mark
    const r = validateSuggestion('The {++swift ++}red fox.', 'The brown fox.')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('rewrites-original')
  })

  it('rejects markup with no marks at all', () => {
    expect(validateSuggestion('no marks here', 'no marks here').reason).toBe('no-marks')
  })

  it('accepts a pure insertion', () => {
    expect(validateSuggestion('Hello {++there ++}world', 'Hello world').ok).toBe(true)
  })
})

describe('commitDecisions (staging-gate apply)', () => {
  const markup = 'The {~~quick~>swift~~} {--very --}brown fox.'
  const { spans } = validateSuggestion(markup, 'The quick very brown fox.')

  it('undecided spans default to reject — nothing changes', () => {
    expect(commitDecisions(markup, spans, new Map())).toBe('The quick very brown fox.')
  })

  it('accepting all yields the fully-applied text', () => {
    const d = new Map<number, Decision>([
      [0, 'accept'],
      [1, 'accept'],
    ])
    expect(commitDecisions(markup, spans, d)).toBe('The swift brown fox.')
  })

  it('mixed: accept the sub, reject the deletion', () => {
    const d = new Map<number, Decision>([
      [0, 'accept'],
      [1, 'reject'],
    ])
    expect(commitDecisions(markup, spans, d)).toBe('The swift very brown fox.')
  })

  it('edited decision uses the user wording, not the agent text', () => {
    const d = new Map<number, Decision>([[0, { edit: 'nimble' }]])
    expect(commitDecisions(markup, spans, d)).toBe('The nimble very brown fox.')
  })

  it('acceptedCount counts accept + edit, not reject/undecided', () => {
    const d = new Map<number, Decision>([
      [0, 'accept'],
      [1, 'reject'],
    ])
    expect(acceptedCount(spans, d)).toBe(1)
    expect(acceptedCount(spans, new Map([[0, { edit: 'x' }]]))).toBe(1)
    expect(acceptedCount(spans, new Map())).toBe(0)
  })
})
