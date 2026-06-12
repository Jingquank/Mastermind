import type { CommentEntry, CriticKind, CriticSpan, Range, ReviewCountsDetail, ReviewItem } from './types'

const OPENERS: ReadonlyArray<readonly [string, CriticKind]> = [
  ['{++', 'ins'],
  ['{--', 'del'],
  ['{~~', 'sub'],
  ['{==', 'highlight'],
  ['{>>', 'comment'],
]

const CLOSERS: Record<CriticKind, string> = {
  ins: '++}',
  del: '--}',
  sub: '~~}',
  highlight: '==}',
  comment: '<<}',
}

/** Start offsets of blank-line breaks (a span may not cross one). */
function blankBreaks(text: string): number[] {
  const out: number[] = []
  const re = /\r?\n[ \t]*\r?\n/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push(m.index)
    re.lastIndex = m.index + 1 // overlapping blank runs all count
  }
  return out
}

function makeExcludeLookup(exclude: readonly Range[]): (pos: number) => Range | null {
  const sorted = [...exclude].sort((a, b) => a.start - b.start)
  return (pos: number) => {
    let lo = 0
    let hi = sorted.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const r = sorted[mid]!
      if (pos < r.start) hi = mid - 1
      else if (pos >= r.end) lo = mid + 1
      else return r
    }
    return null
  }
}

function escapedAt(text: string, bracePos: number): boolean {
  let backslashes = 0
  while (bracePos - 1 - backslashes >= 0 && text[bracePos - 1 - backslashes] === '\\') backslashes++
  return backslashes % 2 === 1
}

/**
 * Scan raw text for CriticMarkup spans.
 *
 * Rules: delimiters must not sit inside `exclude` ranges (code, html); span
 * content may contain newlines but never a blank line; `\{` defeats an
 * opener; marks do not nest — the first valid closer wins.
 */
export function scan(text: string, exclude: readonly Range[] = []): CriticSpan[] {
  const spans: CriticSpan[] = []
  const breaks = blankBreaks(text)
  const excludeAt = makeExcludeLookup(exclude)
  let breakIdx = 0

  const findToken = (token: string, from: number, limit: number): number => {
    let k = from
    while (k < limit) {
      const j = text.indexOf(token, k)
      if (j === -1 || j >= limit) return -1
      const ex = excludeAt(j)
      if (ex) {
        k = ex.end
        continue
      }
      return j
    }
    return -1
  }

  let i = 0
  while (i < text.length) {
    const brace = text.indexOf('{', i)
    if (brace === -1) break
    i = brace

    const ex = excludeAt(i)
    if (ex) {
      i = ex.end
      continue
    }
    if (escapedAt(text, i)) {
      i += 1
      continue
    }

    const opener = OPENERS.find(([tok]) => text.startsWith(tok, i))
    if (!opener) {
      i += 1
      continue
    }
    const kind = opener[1]
    const innerStart = i + 3

    while (breakIdx < breaks.length && breaks[breakIdx]! < innerStart) breakIdx++
    const limit = breakIdx < breaks.length ? breaks[breakIdx]! : text.length

    if (kind === 'sub') {
      const firstCloser = findToken(CLOSERS.sub, innerStart, limit)
      const sep = findToken('~>', innerStart, limit)
      if (firstCloser === -1 || sep === -1 || sep >= firstCloser) {
        i += 1
        continue
      }
      spans.push({
        kind,
        start: i,
        end: firstCloser + 3,
        innerStart,
        innerEnd: firstCloser,
        oldStart: innerStart,
        oldEnd: sep,
        newStart: sep + 2,
        newEnd: firstCloser,
      })
      i = firstCloser + 3
      continue
    }

    const closer = findToken(CLOSERS[kind], innerStart, limit)
    if (closer === -1) {
      i += 1
      continue
    }
    spans.push({ kind, start: i, end: closer + 3, innerStart, innerEnd: closer })
    i = closer + 3
  }
  return spans
}

const AUTHOR_RE = /^\s*@([^\s:@]{1,64}):\s?/

/**
 * Drop container prefixes (`> `, continuation indent) from a raw multi-line
 * span slice — they're markdown plumbing, not content.
 */
export function stripLinePrefixes(s: string): string {
  return s.replace(/\n[ \t]*(?:>[ \t]?)*/g, '\n')
}

export function parseAuthor(content: string): { author: string | null; body: string } {
  const m = AUTHOR_RE.exec(content)
  if (!m) return { author: null, body: content }
  return { author: m[1]!, body: content.slice(m[0].length) }
}

function toEntry(span: CriticSpan, text: string): CommentEntry {
  const { author, body } = parseAuthor(stripLinePrefixes(text.slice(span.innerStart, span.innerEnd)))
  return { span, author, body }
}

/**
 * Group scanned spans into review items: ins/del/sub → suggestions;
 * `{==x==}{>>c<<}` → anchored thread; consecutive comments → one thread;
 * highlights without a trailing comment → standalone highlights.
 * Adjacency means zero characters between marks.
 */
export function group(spans: readonly CriticSpan[], text: string): ReviewItem[] {
  const items: ReviewItem[] = []
  let i = 0
  while (i < spans.length) {
    const s = spans[i]!
    if (s.kind === 'ins' || s.kind === 'del' || s.kind === 'sub') {
      items.push({ type: 'suggestion', span: s })
      i++
      continue
    }
    if (s.kind === 'highlight') {
      const next = spans[i + 1]
      if (!(next && next.kind === 'comment' && next.start === s.end)) {
        items.push({ type: 'highlight', span: s })
        i++
        continue
      }
      const comments: CommentEntry[] = []
      let j = i + 1
      let expectedStart = s.end
      while (spans[j] && spans[j]!.kind === 'comment' && spans[j]!.start === expectedStart) {
        comments.push(toEntry(spans[j]!, text))
        expectedStart = spans[j]!.end
        j++
      }
      items.push({ type: 'thread', anchor: s, comments, start: s.start, end: expectedStart })
      i = j
      continue
    }
    // orphan comment / thread start
    const comments: CommentEntry[] = [toEntry(s, text)]
    let j = i + 1
    let expectedStart = s.end
    while (spans[j] && spans[j]!.kind === 'comment' && spans[j]!.start === expectedStart) {
      comments.push(toEntry(spans[j]!, text))
      expectedStart = spans[j]!.end
      j++
    }
    items.push({ type: 'thread', anchor: null, comments, start: s.start, end: expectedStart })
    i = j
  }
  return items
}

/**
 * Counts for the review summary. Comments count every comment mark; edits
 * count ins+del+sub; highlights count only standalone highlights (an anchored
 * comment's highlight is the comment's anchor, not a separate annotation).
 */
export function reviewCounts(items: readonly ReviewItem[]): ReviewCountsDetail {
  let comments = 0
  let edits = 0
  let highlights = 0
  for (const item of items) {
    if (item.type === 'suggestion') edits++
    else if (item.type === 'highlight') highlights++
    else comments += item.comments.length
  }
  return { comments, edits, highlights }
}
