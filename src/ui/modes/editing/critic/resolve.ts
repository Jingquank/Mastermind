import type { Node as PMNode } from '@milkdown/kit/prose/model'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { CriticKind } from '../../../../shared/critic/types'

const MARK_NAME: Partial<Record<CriticKind, string>> = {
  ins: 'criticInsert',
  del: 'criticDelete',
  highlight: 'criticHighlight',
}

/**
 * Accept/reject a CriticMarkup span directly in the live ProseMirror doc — the
 * dirty-editor route. (A clean editor splices the byte-exact source and remounts
 * instead; this path is for when the user has unflushed typing, where re-parsing
 * a stale source would clobber it.) Located by the span's unique `spanIndex`
 * attr, which survives editing. Returns true if a transaction was dispatched.
 *
 * Semantics mirror shared/critic/resolve.ts:
 *   ins  accept→keep, reject→delete   del  accept→delete, reject→keep
 *   sub  accept→new arm, reject→old arm   highlight→unwrap   comment→remove
 */
export function resolveCriticInEditor(
  view: EditorView,
  spanIndex: number,
  kind: CriticKind,
  mode: 'accept' | 'reject',
): boolean {
  const { state } = view
  const markName = MARK_NAME[kind]

  // ins / del / highlight are marks spanning a (possibly formatted) text range
  if (markName) {
    const markType = state.schema.marks[markName]
    if (!markType) return false
    let from = -1
    let to = -1
    state.doc.descendants((node, pos) => {
      if (!node.isText) return
      if (node.marks.some((m) => m.type === markType && m.attrs.spanIndex === spanIndex)) {
        if (from === -1) from = pos
        to = pos + node.nodeSize
      }
    })
    if (from === -1) return false
    const keepText =
      kind === 'highlight' || (kind === 'ins' && mode === 'accept') || (kind === 'del' && mode === 'reject')
    view.dispatch(keepText ? state.tr.removeMark(from, to, markType) : state.tr.delete(from, to))
    return true
  }

  // sub / comment are atomic inline nodes
  let found = -1
  let target: PMNode | null = null
  state.doc.descendants((node, pos) => {
    if ((node.type.name === 'criticSub' || node.type.name === 'criticComment') && node.attrs.spanIndex === spanIndex) {
      found = pos
      target = node
    }
  })
  if (found === -1 || target === null) return false
  const node: PMNode = target
  if (node.type.name === 'criticSub') {
    const text = mode === 'accept' ? String(node.attrs.new) : String(node.attrs.old)
    view.dispatch(state.tr.replaceWith(found, found + node.nodeSize, text ? state.schema.text(text) : []))
  } else {
    view.dispatch(state.tr.delete(found, found + node.nodeSize)) // comment: accept and reject both remove it
  }
  return true
}
