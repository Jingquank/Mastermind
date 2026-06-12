import { describe, expect, it } from 'vitest'
import { buildSummaryBlock, hasSummary, stripSummary, summaryLine, upsertSummary } from '../src/shared/summary'

const COUNTS = { comments: 3, edits: 2, highlights: 1 }
const DATE = new Date(2026, 5, 12, 14, 30) // 2026-06-12 14:30 local

describe('summary block', () => {
  it('builds the spec format', () => {
    expect(buildSummaryBlock(COUNTS, DATE)).toBe(
      '<!-- mastermind:summary -->\n' +
        '> **Review summary** (2026-06-12 14:30)\n' +
        '> 3 comments, 2 suggested edits, 1 highlight. Open the CriticMarkup marks above for details.\n' +
        '<!-- /mastermind:summary -->\n',
    )
  })

  it('appends with a separating blank line when absent', () => {
    const out = upsertSummary('# Doc\n\nbody\n', COUNTS, DATE)
    expect(out).toContain('body\n\n<!-- mastermind:summary -->')
    expect(out.endsWith('<!-- /mastermind:summary -->\n')).toBe(true)
  })

  it('replaces in place when present', () => {
    const v1 = upsertSummary('# Doc\n\nbody\n', { comments: 1, edits: 0, highlights: 0 }, DATE)
    const withTail = v1 + '\nAdded after the block.\n'
    const v2 = upsertSummary(withTail, COUNTS, DATE)
    // exactly one block
    expect(v2.match(/<!-- mastermind:summary -->/g)).toHaveLength(1)
    // stays at the old position — before the tail text
    expect(v2.indexOf('<!-- mastermind:summary -->')).toBeLessThan(v2.indexOf('Added after the block.'))
    expect(v2).toContain('3 comments')
    expect(v2).not.toContain('1 comment.')
  })

  it('collapses multiple stale blocks into one', () => {
    const doubled =
      'body\n\n' + buildSummaryBlock(COUNTS, DATE) + 'middle\n' + buildSummaryBlock(COUNTS, DATE) + 'tail\n'
    const out = upsertSummary(doubled, { comments: 1, edits: 0, highlights: 0 }, DATE)
    expect(out.match(/<!-- mastermind:summary -->/g)).toHaveLength(1)
    expect(out).toContain('middle')
    expect(out).toContain('tail')
  })

  it('strip removes block and is a no-op without one', () => {
    const v1 = upsertSummary('text\n', COUNTS, DATE)
    expect(stripSummary(v1)).toBe('text\n\n')
    expect(stripSummary('plain\n')).toBe('plain\n')
    expect(hasSummary(v1)).toBe(true)
  })

  it('zero counts produce a sane line and block', () => {
    expect(summaryLine({ comments: 0, edits: 0, highlights: 0 })).toBe('mastermind: review complete — no marks')
    expect(buildSummaryBlock({ comments: 0, edits: 0, highlights: 0 }, DATE)).toContain('No inline marks')
  })

  it('singulars read correctly', () => {
    expect(summaryLine({ comments: 1, edits: 1, highlights: 0 })).toBe(
      'mastermind: review complete — 1 comment, 1 suggested edit',
    )
  })
})
