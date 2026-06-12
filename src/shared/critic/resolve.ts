import { applyTextEdits } from '../edits'
import type { TextEdit } from '../types'
import type { CriticKind, CriticSpan } from './types'

/**
 * Accept a suggestion: insertions keep their content, deletions disappear,
 * substitutions take the new arm. For annotations, accept resolves them:
 * highlights unwrap to their content, comments are removed.
 */
export function acceptEdit(text: string, span: CriticSpan): TextEdit {
  switch (span.kind) {
    case 'ins':
      return { from: span.start, to: span.end, insert: text.slice(span.innerStart, span.innerEnd) }
    case 'del':
      return { from: span.start, to: span.end, insert: '' }
    case 'sub':
      return { from: span.start, to: span.end, insert: text.slice(span.newStart!, span.newEnd!) }
    case 'highlight':
      return { from: span.start, to: span.end, insert: text.slice(span.innerStart, span.innerEnd) }
    case 'comment':
      return { from: span.start, to: span.end, insert: '' }
  }
}

/**
 * Reject a suggestion: insertions disappear, deletions keep their content,
 * substitutions keep the old arm. Annotations resolve the same way as accept.
 */
export function rejectEdit(text: string, span: CriticSpan): TextEdit {
  switch (span.kind) {
    case 'ins':
      return { from: span.start, to: span.end, insert: '' }
    case 'del':
      return { from: span.start, to: span.end, insert: text.slice(span.innerStart, span.innerEnd) }
    case 'sub':
      return { from: span.start, to: span.end, insert: text.slice(span.oldStart!, span.oldEnd!) }
    case 'highlight':
      return { from: span.start, to: span.end, insert: text.slice(span.innerStart, span.innerEnd) }
    case 'comment':
      return { from: span.start, to: span.end, insert: '' }
  }
}

const SUGGESTION_KINDS: ReadonlySet<CriticKind> = new Set(['ins', 'del', 'sub'])

/**
 * Resolve every span of the given kinds in one pass (defaults to suggestions
 * only — annotations are resolved per-card, not by Accept all).
 */
export function resolveAll(
  text: string,
  spans: readonly CriticSpan[],
  mode: 'accept' | 'reject',
  kinds: ReadonlySet<CriticKind> = SUGGESTION_KINDS,
): string {
  const edits = spans
    .filter((s) => kinds.has(s.kind))
    .map((s) => (mode === 'accept' ? acceptEdit(text, s) : rejectEdit(text, s)))
  return applyTextEdits(text, edits)
}
