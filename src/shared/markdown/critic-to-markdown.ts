import type { Handle, Options } from 'mdast-util-to-markdown'
import type { CriticCommentNode, CriticSubNode, CriticWrapNode } from './critic-mdast'

/**
 * Serialization handlers shared by everything that stringifies our custom
 * mdast nodes (Milkdown's serializer in particular). Delimiters are emitted
 * verbatim — handler return values bypass escaping; only child phrasing goes
 * through state.containerPhrasing (which escapes normally).
 */

/** mdast-util-to-markdown supports a `peek` on handlers; its types don't expose it. */
type PeekableHandle = Handle & { peek?: () => string }

function wrapHandle(open: string, close: string): PeekableHandle {
  const handle: PeekableHandle = (node, _parent, state, info) => {
    const wrap = node as CriticWrapNode
    const exit = state.enter(wrap.type as never)
    const value = state.containerPhrasing(wrap as never, {
      ...info,
      before: open.slice(-1),
      after: close[0]!,
    })
    exit()
    return `${open}${value}${close}`
  }
  handle.peek = () => '{'
  return handle
}

const criticSub: PeekableHandle = (node) => {
  const d = (node as CriticSubNode).data
  return `{~~${d.old}~>${d.new}~~}`
}
criticSub.peek = () => '{'

const criticComment: PeekableHandle = (node) => {
  const d = (node as CriticCommentNode).data
  return `{>>${d.content}<<}`
}
criticComment.peek = () => '{'

export const criticToMarkdown: Options = {
  handlers: {
    criticInsert: wrapHandle('{++', '++}'),
    criticDelete: wrapHandle('{--', '--}'),
    criticHighlight: wrapHandle('{==', '==}'),
    criticSub,
    criticComment,
  } as unknown as Options['handlers'],
  unsafe: [
    // Literal critic-looking syntax typed as plain text must round-trip as
    // text: escape `{` when followed by a delimiter char so `\{++` survives.
    { character: '{', after: '[+\\-~=>]', inConstruct: 'phrasing' },
  ],
}
