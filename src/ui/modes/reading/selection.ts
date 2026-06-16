import type { CriticSpan } from '../../../shared/critic/types'
import type { TextEdit } from '../../../shared/types'

export interface SelRange {
  from: number
  to: number
  text: string
}

export type SelError = 'empty' | 'cross-block' | 'unmapped' | 'overlaps-mark'
export type SelResult = SelRange | { error: SelError }
/** Multi-block result: one SelRange per spanned block, in document order. */
export type MultiSelResult = { ranges: SelRange[] } | { error: SelError }

const BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,pre'

function closestBlock(node: Node): HTMLElement | null {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
  return el?.closest(BLOCK_SELECTOR) ?? null
}

/** Descend an element boundary point to the text leaf it borders. */
function normalizePoint(node: Node, offset: number): { node: Node; offset: number } {
  let current = node
  let off = offset
  while (current.nodeType === Node.ELEMENT_NODE) {
    const el = current as HTMLElement
    if (off < el.childNodes.length) {
      current = el.childNodes[off]!
      off = 0
    } else if (el.childNodes.length > 0) {
      current = el.childNodes[el.childNodes.length - 1]!
      off = current.nodeType === Node.TEXT_NODE ? (current.textContent?.length ?? 0) : current.childNodes.length
    } else {
      break
    }
  }
  return { node: current, offset: off }
}

/**
 * Map one selection endpoint to a source offset via the renderer's
 * data-ps/data-pe spans. Returns null when the span's rendered text length
 * differs from its source length (escapes/entities) — caller falls back.
 */
function pointToOffset(rawNode: Node, rawOffset: number): number | null {
  const { node, offset } = normalizePoint(rawNode, rawOffset)
  if (node.nodeType !== Node.TEXT_NODE) return null
  const el = node.parentElement
  if (!el) return null
  const span = el.closest('[data-ps]') as HTMLElement | null
  if (!span) return null
  const ps = Number(span.dataset.ps)
  const pe = Number(span.dataset.pe)
  if (!Number.isFinite(ps) || !Number.isFinite(pe)) return null
  const value = span.textContent ?? ''
  if (pe - ps !== value.length) return null // source has escapes/entities here
  // walk text siblings inside the span (it normally holds a single text node)
  let prefix = 0
  let walker: Node | null = span.firstChild
  while (walker && walker !== node) {
    prefix += walker.textContent?.length ?? 0
    walker = walker.nextSibling
  }
  if (!walker) return null
  return ps + prefix + offset
}

/**
 * One block-bounded DOM range → source offsets. Fast path through data-ps with a
 * slice-equality invariant; fallback to an unambiguous substring search within
 * the containing block; refusal otherwise. Never guesses on a mismatch. Assumes
 * the range stays inside `block` (callers split cross-block selections first).
 */
function mapWithinBlock(range: Range, block: HTMLElement, source: string): SelResult {
  const selectedText = range.toString()
  if (selectedText.length === 0) return { error: 'empty' }

  let from = pointToOffset(range.startContainer, range.startOffset)
  let to = pointToOffset(range.endContainer, range.endOffset)

  const valid = from !== null && to !== null && to > from && source.slice(from, to) === selectedText
  if (!valid) {
    // block-bounded substring search, only when unambiguous
    const bps = Number(block.dataset.ps)
    const bpe = Number(block.dataset.pe)
    if (!Number.isFinite(bps) || !Number.isFinite(bpe)) return { error: 'unmapped' }
    const blockSource = source.slice(bps, bpe)
    const first = blockSource.indexOf(selectedText)
    if (first === -1 || blockSource.indexOf(selectedText, first + 1) !== -1) return { error: 'unmapped' }
    from = bps + first
    to = from + selectedText.length
  }

  return { from: from!, to: to!, text: selectedText }
}

function overlapsMark(r: SelRange, spans: readonly CriticSpan[]): boolean {
  return spans.some((s) => r.from < s.end && r.to > s.start)
}

/**
 * DOM Range → single source range. Single-block only; cross-block returns an
 * error. Kept for callers that act on one contiguous span; the toolbar uses
 * {@link rangeToSourceRanges} so big selections can span blocks.
 */
export function rangeToSource(range: Range, source: string, spans: readonly CriticSpan[]): SelResult {
  if (range.collapsed) return { error: 'empty' }
  if (range.toString().length === 0) return { error: 'empty' }

  const startBlock = closestBlock(range.startContainer)
  const endBlock = closestBlock(range.endContainer)
  if (!startBlock || startBlock !== endBlock) return { error: 'cross-block' }

  const r = mapWithinBlock(range, startBlock, source)
  if ('error' in r) return r
  if (overlapsMark(r, spans)) return { error: 'overlaps-mark' }
  return r
}

/**
 * The innermost blocks the range touches, in document order. A mark can't span a
 * block boundary in CriticMarkup, so a multi-block selection becomes one mark per
 * block; this enumerates those blocks. "Innermost" drops any ancestor block that
 * merely wraps another selected block (e.g. a blockquote around its paragraphs).
 */
function blocksBetween(range: Range, startBlock: HTMLElement, endBlock: HTMLElement): HTMLElement[] {
  const ca = range.commonAncestorContainer
  const root = (ca.nodeType === Node.ELEMENT_NODE ? ca : ca.parentElement) as HTMLElement | null
  if (!root) return []
  const all = Array.from(root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR))
  const si = all.indexOf(startBlock)
  const ei = all.indexOf(endBlock)
  if (si === -1 || ei === -1) return []
  const slice = all.slice(Math.min(si, ei), Math.max(si, ei) + 1)
  return slice.filter((b) => !slice.some((o) => o !== b && b.contains(o)))
}

/**
 * Split a block's selected slice [from, to) into the runs that are free of any
 * existing mark — a new mark can't overlap one already there, so a slice that
 * straddles a highlight/comment becomes the gaps on either side. Whitespace-only
 * gaps are dropped so we never emit an empty `{== ==}`.
 */
function markFreeGaps(from: number, to: number, source: string, spans: readonly CriticSpan[]): SelRange[] {
  const blocking = spans
    .filter((s) => s.start < to && s.end > from)
    .sort((a, b) => a.start - b.start)
  const out: SelRange[] = []
  const push = (a: number, b: number): void => {
    const text = source.slice(a, b)
    if (b > a && text.trim().length > 0) out.push({ from: a, to: b, text })
  }
  let cursor = from
  for (const m of blocking) {
    if (m.start > cursor) push(cursor, Math.min(m.start, to))
    cursor = Math.max(cursor, m.end)
    if (cursor >= to) break
  }
  if (cursor < to) push(cursor, to)
  return out
}

/** Block/list containers: an element whose nearest one of these is the target
 *  block belongs to that block directly (not to a nested list/paragraph). */
const NESTED_CONTAINER = `${BLOCK_SELECTOR},ul,ol`

/**
 * A whole leaf block's content source ranges — the markdown structural prefix
 * (`## `, `- `) excluded, inline markdown (`**`, links) included — split around
 * any existing marks. Unlike a DOM Range mapped through {@link rangeToSourceRanges}
 * (whose text must equal the source slice, which breaks on inline formatting), this
 * spans from the block's first inline `[data-ps]` offset to its last `[data-pe]`,
 * so it's robust for any block. Descendants that live inside a *nested* block or
 * list (a sub-list under a list item, a loose item's paragraph) are excluded, so
 * the range never crosses a block boundary or a blank line. Empty array if nothing
 * directly in the block can be marked.
 */
export function blockContentRanges(
  block: HTMLElement,
  source: string,
  spans: readonly CriticSpan[],
): SelRange[] {
  let from = Infinity
  let to = -Infinity
  for (const el of block.querySelectorAll<HTMLElement>('[data-ps]')) {
    // only inline content owned directly by `block` — skip nested blocks/lists
    // (and their descendants), whose nearest container is something else.
    if (el.closest(NESTED_CONTAINER) !== block) continue
    const ps = Number(el.dataset.ps)
    const pe = Number(el.dataset.pe)
    if (Number.isFinite(ps)) from = Math.min(from, ps)
    if (Number.isFinite(pe)) to = Math.max(to, pe)
  }
  if (from === Infinity || to <= from) return []
  return markFreeGaps(from, to, source, spans)
}

/**
 * DOM Range → the source ranges to wrap, one or more per spanned block. A mark
 * can't cross a block boundary or overlap an existing mark, so a big selection is
 * split at both: each spanned block contributes its selected slice, minus any
 * region already covered by a mark. Blocks whose slice can't be unambiguously
 * mapped (escapes/entities, code) are skipped, not fatal — the toolbar still acts
 * on everything that *can* be marked. Returns an error only when nothing in the
 * selection is markable (so the toolbar hides), never because one block was.
 */
export function rangeToSourceRanges(range: Range, source: string, spans: readonly CriticSpan[]): MultiSelResult {
  if (range.collapsed) return { error: 'empty' }
  if (range.toString().length === 0) return { error: 'empty' }

  const startBlock = closestBlock(range.startContainer)
  const endBlock = closestBlock(range.endContainer)
  if (!startBlock || !endBlock) return { error: 'unmapped' }

  const blocks = startBlock === endBlock ? [startBlock] : blocksBetween(range, startBlock, endBlock)
  if (blocks.length === 0) return { error: 'unmapped' }

  const ranges: SelRange[] = []
  for (const block of blocks) {
    // The single-block case uses the selection as-is; spanning blocks each get a
    // fresh range clamped to the selection where it enters/leaves, block edges
    // otherwise.
    let sub = range
    if (blocks.length > 1) {
      sub = (block.ownerDocument ?? document).createRange()
      sub.selectNodeContents(block)
      if (block === startBlock) sub.setStart(range.startContainer, range.startOffset)
      if (block === endBlock) sub.setEnd(range.endContainer, range.endOffset)
    }
    if (sub.collapsed || sub.toString().trim().length === 0) continue // partial/whitespace-only edge
    const r = mapWithinBlock(sub, block, source)
    if ('error' in r) continue // unmappable block — skip it, keep the rest
    ranges.push(...markFreeGaps(r.from, r.to, source, spans))
  }

  if (ranges.length === 0) return { error: 'unmapped' }
  ranges.sort((a, b) => a.from - b.from)
  return { ranges }
}

/**
 * Build the splice edits that wrap each block's slice in CriticMarkup. `wrap`
 * receives the slice text, its index, and whether it's the last range, so a
 * comment can be attached to just one block while the rest stay bare highlights.
 */
export function markEdits(
  ranges: readonly SelRange[],
  wrap: (text: string, index: number, isLast: boolean) => string,
): TextEdit[] {
  return ranges.map((r, i) => ({ from: r.from, to: r.to, insert: wrap(r.text, i, i === ranges.length - 1) }))
}
