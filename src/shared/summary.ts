import type { ReviewCountsDetail } from './critic/types'

export const SUMMARY_OPEN = '<!-- mastermind:summary -->'
export const SUMMARY_CLOSE = '<!-- /mastermind:summary -->'

const SUMMARY_RE = /[ \t]*<!-- mastermind:summary -->[\s\S]*?<!-- \/mastermind:summary -->[ \t]*\n?/g

/** Remove every summary block (defensively — there must only ever be one). */
export function stripSummary(text: string): string {
  return text.replace(SUMMARY_RE, '')
}

export function hasSummary(text: string): boolean {
  return text.includes(SUMMARY_OPEN)
}

/** "3 comments, 2 suggested edits, 1 highlight" — non-zero categories only. */
export function countsPhrase(counts: ReviewCountsDetail): string {
  const parts: string[] = []
  if (counts.comments > 0) parts.push(`${counts.comments} comment${counts.comments === 1 ? '' : 's'}`)
  if (counts.edits > 0) parts.push(`${counts.edits} suggested edit${counts.edits === 1 ? '' : 's'}`)
  if (counts.highlights > 0) parts.push(`${counts.highlights} highlight${counts.highlights === 1 ? '' : 's'}`)
  return parts.join(', ')
}

/** The one-line machine-readable stdout summary for `mastermind open --wait`. */
export function summaryLine(counts: ReviewCountsDetail): string {
  const phrase = countsPhrase(counts)
  return `mastermind: review complete — ${phrase || 'no marks'}`
}

/**
 * Hand-formatted local timestamp (never toLocaleString — the daemon's
 * locale/ICU env differs from the user's shell, and drift pollutes diffs).
 */
export function formatStamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`
}

/**
 * Fold a free-form hand-back note into blockquote lines for the summary block.
 * Returns '' when there's nothing to add. Defangs the HTML-comment delimiters so
 * a pasted note can never break out of (or forge) the summary block, and folds
 * the note's own lines into the leading `> ` quote so the block stays one unit.
 */
function noteLines(note: string | undefined): string {
  const safe = (note ?? '').replace(/<!--|-->/g, '').trim()
  if (!safe) return ''
  const quoted = safe.split('\n').map((l) => `> ${l}`.trimEnd()).join('\n')
  return `>\n> **Note:** ${quoted.replace(/^> /, '')}\n`
}

export function buildSummaryBlock(counts: ReviewCountsDetail, date: Date, note?: string): string {
  const phrase = countsPhrase(counts)
  const detail = phrase
    ? `${phrase}. Open the CriticMarkup marks above for details.`
    : 'No inline marks — see the document itself for changes.'
  return `${SUMMARY_OPEN}\n> **Review summary** (${formatStamp(date)})\n> ${detail}\n${noteLines(note)}${SUMMARY_CLOSE}\n`
}

/**
 * Insert/replace the summary block: exactly one, replaced in place when one
 * already exists, appended at EOF otherwise.
 */
export function upsertSummary(text: string, counts: ReviewCountsDetail, date: Date, note?: string): string {
  const block = buildSummaryBlock(counts, date, note)
  const firstIdx = text.indexOf(SUMMARY_OPEN)
  if (firstIdx !== -1) {
    const before = stripSummary(text.slice(0, firstIdx))
    const after = stripSummary(text.slice(firstIdx))
    return before + block + after
  }
  let body = text
  if (body.length > 0 && !body.endsWith('\n')) body += '\n'
  if (body.length > 0 && !body.endsWith('\n\n')) body += '\n'
  return body + block
}
