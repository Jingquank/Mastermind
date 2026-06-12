import type { CriticSpan } from '../../../shared/critic/types'

export interface SelRange {
  from: number
  to: number
  text: string
}

export type SelError = 'empty' | 'cross-block' | 'unmapped' | 'overlaps-mark'
export type SelResult = SelRange | { error: SelError }

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
 * DOM Range → source range. Fast path through data-ps offsets with a
 * slice-equality invariant; fallback to unambiguous substring search within
 * the containing block; refusal otherwise. Never splices on a mismatch.
 */
export function rangeToSource(range: Range, source: string, spans: readonly CriticSpan[]): SelResult {
  if (range.collapsed) return { error: 'empty' }
  const selectedText = range.toString()
  if (selectedText.length === 0) return { error: 'empty' }

  const startBlock = closestBlock(range.startContainer)
  const endBlock = closestBlock(range.endContainer)
  if (!startBlock || startBlock !== endBlock) return { error: 'cross-block' }

  let from = pointToOffset(range.startContainer, range.startOffset)
  let to = pointToOffset(range.endContainer, range.endOffset)

  const valid = from !== null && to !== null && to > from && source.slice(from, to) === selectedText
  if (!valid) {
    // block-bounded substring search, only when unambiguous
    const bps = Number(startBlock.dataset.ps)
    const bpe = Number(startBlock.dataset.pe)
    if (!Number.isFinite(bps) || !Number.isFinite(bpe)) return { error: 'unmapped' }
    const blockSource = source.slice(bps, bpe)
    const first = blockSource.indexOf(selectedText)
    if (first === -1 || blockSource.indexOf(selectedText, first + 1) !== -1) return { error: 'unmapped' }
    from = bps + first
    to = from + selectedText.length
  }

  if (spans.some((s) => from! < s.end && to! > s.start)) return { error: 'overlaps-mark' }
  return { from: from!, to: to!, text: selectedText }
}
