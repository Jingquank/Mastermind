import type { Parent, PhrasingContent, Root } from 'mdast'
import type { Node } from 'unist'
import type { Sentinels } from '../critic/mask'
// Container prefixes embedded in raw multi-line slices must NOT live in atom
// content: serializers re-add prefixes per line (double-prefix otherwise).
import { stripLinePrefixes } from '../critic/scanner'
import type { CriticSpan } from '../critic/types'

/* ---- custom mdast node shapes ------------------------------------------ */

export interface CriticWrapData {
  spanIndex: number
}
export interface CriticSubData extends CriticWrapData {
  old: string
  new: string
  raw: string
}
export interface CriticCommentData extends CriticWrapData {
  content: string
  raw: string
}

export interface CriticWrapNode extends Parent {
  type: 'criticInsert' | 'criticDelete' | 'criticHighlight'
  children: PhrasingContent[]
  data: CriticWrapData
}
export interface CriticSubNode extends Node {
  type: 'criticSub'
  data: CriticSubData
}
export interface CriticCommentNode extends Node {
  type: 'criticComment'
  data: CriticCommentData
}

export type CriticMdastNode = CriticWrapNode | CriticSubNode | CriticCommentNode

const WRAP_TYPE = { ins: 'criticInsert', del: 'criticDelete', highlight: 'criticHighlight' } as const
const OPEN_TEXT = { ins: '{++', del: '{--', highlight: '{==' } as const
const CLOSE_TEXT = { ins: '++}', del: '--}', highlight: '==}' } as const

type WrapKind = 'ins' | 'del' | 'highlight'

/* ---- value segmentation -------------------------------------------------- */

type Seg =
  | { t: 'plain'; value: string }
  | { t: 'open'; kind: WrapKind }
  | { t: 'close'; kind: WrapKind }
  | { t: 'atom' }

function buildSegmenter(s: Sentinels): { re: RegExp; classify: (m: string) => Seg } {
  const o = s.open
  const c = s.close
  const [n0, n1] = s.neutral
  const re = new RegExp(
    [
      `${o.ins}{3}`,
      `${o.del}{3}`,
      `${o.highlight}{3}`,
      `${c.ins}{3}`,
      `${c.del}{3}`,
      `${c.highlight}{3}`,
      `${n0}(?:[${n0}\\n\\r]*${n0})?`,
      `${n1}(?:[${n1}\\n\\r]*${n1})?`,
    ].join('|'),
    'g',
  )
  const byChar = new Map<string, Seg>([
    [o.ins, { t: 'open', kind: 'ins' }],
    [o.del, { t: 'open', kind: 'del' }],
    [o.highlight, { t: 'open', kind: 'highlight' }],
    [c.ins, { t: 'close', kind: 'ins' }],
    [c.del, { t: 'close', kind: 'del' }],
    [c.highlight, { t: 'close', kind: 'highlight' }],
    [n0, { t: 'atom' }],
    [n1, { t: 'atom' }],
  ])
  return { re, classify: (m) => byChar.get(m[0]!)! }
}

function segmentValue(value: string, seg: { re: RegExp; classify: (m: string) => Seg }): Seg[] | null {
  seg.re.lastIndex = 0
  if (!seg.re.test(value)) return null
  seg.re.lastIndex = 0
  const out: Seg[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = seg.re.exec(value)) !== null) {
    if (m.index > last) out.push({ t: 'plain', value: value.slice(last, m.index) })
    out.push(seg.classify(m[0]))
    last = m.index + m[0].length
  }
  if (last < value.length) out.push({ t: 'plain', value: value.slice(last) })
  return out
}

/* ---- the transform ------------------------------------------------------- */

interface Streams {
  byKind: Record<WrapKind, CriticSpan[]>
  atoms: CriticSpan[]
}

function synthPosition(span: CriticSpan) {
  return {
    start: { line: 0, column: 0, offset: span.start },
    end: { line: 0, column: 0, offset: span.end },
  }
}

function textNode(value: string): PhrasingContent {
  return { type: 'text', value } as PhrasingContent
}

function makeAtom(span: CriticSpan, original: string): PhrasingContent {
  if (span.kind === 'sub') {
    const node: CriticSubNode = {
      type: 'criticSub',
      data: {
        spanIndex: -1, // patched by caller
        old: stripLinePrefixes(original.slice(span.oldStart!, span.oldEnd!)),
        new: stripLinePrefixes(original.slice(span.newStart!, span.newEnd!)),
        raw: original.slice(span.start, span.end),
      },
      position: synthPosition(span),
    } as CriticSubNode
    return node as unknown as PhrasingContent
  }
  const node: CriticCommentNode = {
    type: 'criticComment',
    data: {
      spanIndex: -1,
      content: stripLinePrefixes(original.slice(span.innerStart, span.innerEnd)),
      raw: original.slice(span.start, span.end),
    },
    position: synthPosition(span),
  } as CriticCommentNode
  return node as unknown as PhrasingContent
}

/**
 * Milkdown's SerializerState closes marks after EVERY inline node and moves
 * boundary spaces outside mark nodes, so one `{++has **bold**++}` span leaves
 * the serializer as several criticInsert nodes separated by space-only text.
 * This pass (run on the serializer's mdast just before stringify) re-merges
 * adjacent wrap nodes that share a `spanIndex`, absorbing the exiled spaces.
 */
/**
 * Milkdown's bullet-list/list-item toMarkdown runners leak `spread` as the
 * STRING "false"/"true" (ordered list converts it; these don't). A truthy
 * "false" makes remark-stringify emit loose lists, flipping tight lists on
 * every round-trip. Normalize to booleans before stringify.
 */
export function fixSerializedSpread(tree: Node): void {
  const walk = (node: Record<string, unknown>): void => {
    if (typeof node.spread === 'string') node.spread = node.spread === 'true'
    const children = node.children as Array<Record<string, unknown>> | undefined
    if (children) for (const child of children) walk(child)
  }
  walk(tree as unknown as Record<string, unknown>)
}

export function mergeCriticSiblings(tree: Node): void {
  const WRAP_TYPES = new Set<string>(['criticInsert', 'criticDelete', 'criticHighlight'])
  const walk = (parent: Parent): void => {
    for (const child of parent.children) {
      if ((child as Parent).children) walk(child as Parent)
    }
    const children = parent.children as unknown as Array<Record<string, unknown>>
    const out: Array<Record<string, unknown>> = []
    let i = 0
    while (i < children.length) {
      const node = children[i]!
      const type = node.type as string
      const span = node.spanIndex as number | undefined
      if (!WRAP_TYPES.has(type) || span === undefined || span < 0) {
        out.push(node)
        i++
        continue
      }
      const absorbed = [...((node.children as unknown[]) ?? [])]
      let j = i + 1
      while (j < children.length) {
        const next = children[j]!
        const after = children[j + 1]
        if (next.type === type && next.spanIndex === span) {
          absorbed.push(...((next.children as unknown[]) ?? []))
          j += 1
          continue
        }
        if (
          next.type === 'text' &&
          typeof next.value === 'string' &&
          /^ +$/.test(next.value) &&
          after !== undefined &&
          after.type === type &&
          after.spanIndex === span
        ) {
          absorbed.push(next)
          absorbed.push(...((after.children as unknown[]) ?? []))
          j += 2
          continue
        }
        break
      }
      out.push({ ...node, children: absorbed })
      i = j
    }
    parent.children = out as unknown as Parent['children']
  }
  walk(tree as Parent)
}

/**
 * Rewrites a tree parsed from MASKED text: sentinel runs in text-node values
 * become criticInsert/criticDelete/criticHighlight wrappers around the
 * content between them, and neutralized regions become criticSub /
 * criticComment atoms whose content is read from the ORIGINAL source.
 *
 * Span association is by document order per kind — the Nth open-run of a
 * kind pairs with the Nth span of that kind. Mismatched pairings (delimiters
 * at different tree depths) degrade to literal delimiter text.
 */
export function criticTransform(
  tree: Root,
  original: string,
  spans: readonly CriticSpan[],
  sentinels: Sentinels,
): void {
  const seg = buildSegmenter(sentinels)
  const streams: Streams = {
    byKind: {
      ins: spans.filter((s) => s.kind === 'ins'),
      del: spans.filter((s) => s.kind === 'del'),
      highlight: spans.filter((s) => s.kind === 'highlight'),
    },
    atoms: spans.filter((s) => s.kind === 'sub' || s.kind === 'comment'),
  }
  const cursors = { ins: 0, del: 0, highlight: 0, atoms: 0 }
  const spanIndexOf = new Map<CriticSpan, number>()
  spans.forEach((s, i) => spanIndexOf.set(s, i))

  const processParent = (parent: Parent): void => {
    // depth-first so atoms nested inside emphasis/links resolve before this level pairs
    for (const child of parent.children) {
      if ((child as Parent).children) processParent(child as Parent)
    }

    const hasSentinels = parent.children.some(
      (ch) => ch.type === 'text' && segmentValue((ch as { value: string }).value, seg) !== null,
    )
    if (!hasSentinels) return

    const out: PhrasingContent[] = []
    let frame: { kind: WrapKind; span: CriticSpan; acc: PhrasingContent[] } | null = null

    const emit = (node: PhrasingContent): void => {
      if (frame) frame.acc.push(node)
      else out.push(node)
    }

    const restoreFrame = (): void => {
      if (!frame) return
      const open = frame
      frame = null
      emit(textNode(OPEN_TEXT[open.kind]))
      for (const n of open.acc) emit(n)
    }

    for (const child of parent.children) {
      if (child.type !== 'text') {
        emit(child as PhrasingContent)
        continue
      }
      const segs = segmentValue((child as { value: string }).value, seg)
      if (!segs) {
        emit(child as PhrasingContent)
        continue
      }
      for (const s of segs) {
        switch (s.t) {
          case 'plain':
            emit(textNode(s.value))
            break
          case 'open': {
            if (frame) {
              // nesting impossible by construction — render literally
              emit(textNode(OPEN_TEXT[s.kind]))
              break
            }
            const span = streams.byKind[s.kind][cursors[s.kind]]
            if (!span) {
              emit(textNode(OPEN_TEXT[s.kind]))
              break
            }
            cursors[s.kind]++
            frame = { kind: s.kind, span, acc: [] }
            break
          }
          case 'close': {
            if (!frame || frame.kind !== s.kind) {
              emit(textNode(CLOSE_TEXT[s.kind]))
              break
            }
            const done = frame
            frame = null
            const wrapper: CriticWrapNode = {
              type: WRAP_TYPE[done.kind],
              children: done.acc,
              data: { spanIndex: spanIndexOf.get(done.span)! },
              position: synthPosition(done.span),
            } as CriticWrapNode
            emit(wrapper as unknown as PhrasingContent)
            break
          }
          case 'atom': {
            const span = streams.atoms[cursors.atoms]
            if (!span) break // desync — drop the masked chars
            cursors.atoms++
            const atom = makeAtom(span, original)
            ;(atom as unknown as CriticMdastNode).data.spanIndex = spanIndexOf.get(span)!
            emit(atom)
            break
          }
        }
      }
    }
    // unclosed opener (closer at a different depth) → literal
    restoreFrame()
    parent.children = out as Parent['children']
  }

  processParent(tree)
}
