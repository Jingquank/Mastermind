import type { MilkdownPlugin } from '@milkdown/kit/ctx'
import { $markSchema, $nodeSchema, $remark } from '@milkdown/kit/utils'
import type { CriticCommentData, CriticSubData, CriticWrapData } from '../../../../shared/markdown/critic-mdast'
import { remarkCritic } from '../../../../shared/markdown/remark-critic'

/**
 * The Milkdown CriticMarkup plugin.
 *
 * ins/del/highlight are ProseMirror MARKS (spannable, formatted content
 * inside); sub and comment are atomic inline NODES. Parsing reuses the exact
 * remark plugin Reading mode uses ($remark appends it to Milkdown's own
 * processor); serialization emits mark syntax verbatim via the
 * toMarkdownExtensions registered by that same plugin.
 *
 * `spanIndex` attrs differ per span, which keeps ProseMirror from coalescing
 * adjacent same-kind marks ({++a++}{++b++} must stay two marks).
 */

export const criticRemark = $remark('remarkCritic', () => remarkCritic as never)

const EXCLUDES = 'criticInsert criticDelete criticHighlight'

function wrapData(node: { data?: unknown }): CriticWrapData {
  return (node.data ?? { spanIndex: -1 }) as CriticWrapData
}

export const criticInsertSchema = $markSchema('criticInsert', () => ({
  attrs: { spanIndex: { default: -1 } },
  inclusive: false,
  excludes: EXCLUDES,
  parseDOM: [{ tag: 'ins.critic-ins' }],
  toDOM: (mark) => ['ins', { class: 'critic critic-ins', 'data-span-index': String(mark.attrs.spanIndex) }],
  parseMarkdown: {
    match: (node) => node.type === 'criticInsert',
    runner: (state, node, markType) => {
      state.openMark(markType, { spanIndex: wrapData(node).spanIndex })
      state.next(node.children)
      state.closeMark(markType)
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'criticInsert',
    runner: (state, mark) => {
      state.withMark(mark, 'criticInsert', undefined, { spanIndex: mark.attrs.spanIndex as number })
    },
  },
}))

export const criticDeleteSchema = $markSchema('criticDelete', () => ({
  attrs: { spanIndex: { default: -1 } },
  inclusive: false,
  excludes: EXCLUDES,
  parseDOM: [{ tag: 'del.critic-del' }],
  toDOM: (mark) => ['del', { class: 'critic critic-del', 'data-span-index': String(mark.attrs.spanIndex) }],
  parseMarkdown: {
    match: (node) => node.type === 'criticDelete',
    runner: (state, node, markType) => {
      state.openMark(markType, { spanIndex: wrapData(node).spanIndex })
      state.next(node.children)
      state.closeMark(markType)
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'criticDelete',
    runner: (state, mark) => {
      state.withMark(mark, 'criticDelete', undefined, { spanIndex: mark.attrs.spanIndex as number })
    },
  },
}))

export const criticHighlightSchema = $markSchema('criticHighlight', () => ({
  attrs: { spanIndex: { default: -1 } },
  inclusive: false,
  excludes: EXCLUDES,
  parseDOM: [{ tag: 'mark.critic-hl' }],
  toDOM: (mark) => ['mark', { class: 'critic critic-hl', 'data-span-index': String(mark.attrs.spanIndex) }],
  parseMarkdown: {
    match: (node) => node.type === 'criticHighlight',
    runner: (state, node, markType) => {
      state.openMark(markType, { spanIndex: wrapData(node).spanIndex })
      state.next(node.children)
      state.closeMark(markType)
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'criticHighlight',
    runner: (state, mark) => {
      state.withMark(mark, 'criticHighlight', undefined, { spanIndex: mark.attrs.spanIndex as number })
    },
  },
}))

export const criticSubSchema = $nodeSchema('criticSub', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  marks: '',
  attrs: {
    old: { default: '' },
    new: { default: '' },
    spanIndex: { default: -1 },
  },
  parseDOM: [
    {
      tag: 'span.critic-sub',
      getAttrs: (dom) => {
        const el = dom as HTMLElement
        return {
          old: el.getAttribute('data-old') ?? '',
          new: el.getAttribute('data-new') ?? '',
          spanIndex: Number(el.getAttribute('data-span-index') ?? -1),
        }
      },
    },
  ],
  toDOM: (node) => [
    'span',
    {
      class: 'critic critic-sub',
      'data-old': String(node.attrs.old),
      'data-new': String(node.attrs.new),
      'data-span-index': String(node.attrs.spanIndex),
      contenteditable: 'false',
    },
    ['del', String(node.attrs.old)],
    ['span', { class: 'critic-sub-arrow', 'aria-hidden': 'true' }, '→'],
    ['ins', String(node.attrs.new)],
  ],
  parseMarkdown: {
    match: (node) => node.type === 'criticSub',
    runner: (state, node, type) => {
      const d = (node.data ?? {}) as Partial<CriticSubData>
      state.addNode(type, {
        old: d.old ?? '',
        new: d.new ?? '',
        spanIndex: d.spanIndex ?? -1,
      })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'criticSub',
    runner: (state, node) => {
      state.addNode('criticSub', undefined, undefined, {
        data: { old: String(node.attrs.old), new: String(node.attrs.new) },
      })
    },
  },
}))

export const criticCommentSchema = $nodeSchema('criticComment', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  marks: '',
  attrs: {
    content: { default: '' },
    spanIndex: { default: -1 },
  },
  parseDOM: [
    {
      tag: 'span.critic-comment-marker',
      getAttrs: (dom) => {
        const el = dom as HTMLElement
        return {
          content: el.getAttribute('title') ?? '',
          spanIndex: Number(el.getAttribute('data-span-index') ?? -1),
        }
      },
    },
  ],
  toDOM: (node) => [
    'span',
    {
      class: 'critic critic-comment-marker',
      title: String(node.attrs.content),
      'data-span-index': String(node.attrs.spanIndex),
      contenteditable: 'false',
    },
    '◆',
  ],
  parseMarkdown: {
    match: (node) => node.type === 'criticComment',
    runner: (state, node, type) => {
      const d = (node.data ?? {}) as Partial<CriticCommentData>
      state.addNode(type, {
        content: d.content ?? '',
        spanIndex: d.spanIndex ?? -1,
      })
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'criticComment',
    runner: (state, node) => {
      state.addNode('criticComment', undefined, undefined, {
        data: { content: String(node.attrs.content) },
      })
    },
  },
}))

export const critic: MilkdownPlugin[] = [
  criticRemark,
  criticInsertSchema,
  criticDeleteSchema,
  criticHighlightSchema,
  criticSubSchema,
  criticCommentSchema,
].flat()
