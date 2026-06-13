import { codeRanges } from '../markdown/exclusions'
import { applyTextEdits } from '../edits'
import { acceptEdit, rejectEdit } from './resolve'
import { scan } from './scanner'
import type { CriticSpan } from './types'

/** Per-proposed-mark decision (keyed by index into the proposal's span list). */
export type Decision = 'accept' | 'reject' | { edit: string }

export interface SuggestionValidation {
  ok: boolean
  spans: CriticSpan[]
  reason?: 'no-marks' | 'wrong-kind' | 'rewrites-original'
}

/**
 * A returned suggestion is acceptable only if it ONLY adds review edits
 * (ins/del/sub — no comments/highlights, those are the user's job) AND its
 * rejected form reproduces the original selection exactly. The second check is
 * the load-bearing gate: it proves the agent only proposed marks and did not
 * silently rewrite untouched text (the one-direction back-door).
 */
export function validateSuggestion(markup: string, original: string): SuggestionValidation {
  const spans = scan(markup, codeRanges(markup))
  if (spans.length === 0) return { ok: false, spans, reason: 'no-marks' }
  if (!spans.every((s) => s.kind === 'ins' || s.kind === 'del' || s.kind === 'sub')) {
    return { ok: false, spans, reason: 'wrong-kind' }
  }
  const rejected = applyTextEdits(
    markup,
    spans.map((s) => rejectEdit(markup, s)),
  )
  if (rejected !== original) return { ok: false, spans, reason: 'rewrites-original' }
  return { ok: true, spans }
}

/**
 * Turn the proposed markup + the user's per-span decisions into the final
 * selection text. Undecided spans default to reject — nothing is applied
 * unless the user explicitly accepted it (the staging-gate guarantee).
 */
export function commitDecisions(markup: string, spans: readonly CriticSpan[], decisions: Map<number, Decision>): string {
  const edits = spans.map((span, i) => {
    const d = decisions.get(i) ?? 'reject'
    if (d === 'accept') return acceptEdit(markup, span)
    if (typeof d === 'object') return { from: span.start, to: span.end, insert: d.edit }
    return rejectEdit(markup, span)
  })
  return applyTextEdits(markup, edits)
}

/** How many spans are accepted/edited (i.e. will change the original). */
export function acceptedCount(spans: readonly CriticSpan[], decisions: Map<number, Decision>): number {
  let n = 0
  for (let i = 0; i < spans.length; i++) {
    const d = decisions.get(i)
    if (d === 'accept' || (d && typeof d === 'object')) n++
  }
  return n
}
