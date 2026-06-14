import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { EditorState, RangeSetBuilder } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, keymap, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { scan } from '../../../shared/critic/scanner'
import { codeRanges } from '../../../shared/markdown/exclusions'
import { useDoc } from '../../app/store'
import { scrollElementToTop } from '../../util/scroll'

const CRITIC_CLASS: Record<string, string> = {
  ins: 'cm-critic cm-critic-ins',
  del: 'cm-critic cm-critic-del',
  sub: 'cm-critic cm-critic-sub',
  highlight: 'cm-critic cm-critic-hl',
  comment: 'cm-critic cm-critic-comment',
}

function computeDecorations(view: EditorView): DecorationSet {
  const text = view.state.doc.toString()
  const builder = new RangeSetBuilder<Decoration>()
  try {
    for (const span of scan(text, codeRanges(text))) {
      builder.add(span.start, span.end, Decoration.mark({ class: CRITIC_CLASS[span.kind]! }))
    }
  } catch {
    /* never block typing on a scan hiccup */
  }
  return builder.finish()
}

const criticHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = computeDecorations(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged) this.decorations = computeDecorations(update.view)
    }
  },
  { decorations: (v) => v.decorations },
)

const sourceTheme = EditorView.theme({
  '&': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.875rem',
    backgroundColor: 'transparent',
  },
  '.cm-content': {
    fontFamily: 'var(--font-mono)',
    caretColor: 'var(--color-text)',
    lineHeight: '1.7',
    padding: '0',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-line': { padding: '0' },
  '.cm-cursor': { borderLeftColor: 'var(--color-text)' },
})

export function SourceEditor() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const entry = useDoc.getState().source

    const view = new EditorView({
      state: EditorState.create({
        doc: entry,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
          criticHighlighter,
          sourceTheme,
          EditorView.updateListener.of((u) => {
            // Push every edit straight into the canonical buffer — the store
            // debounces the disk write (autosave). No remount: setSourceFromEditor
            // leaves externalVersion untouched, so the cursor is preserved.
            if (u.docChanged) useDoc.getState().setSourceFromEditor(u.state.doc.toString())
          }),
        ],
      }),
      parent: host,
    })

    const flush = (): void => {
      const text = view.state.doc.toString()
      if (text !== useDoc.getState().source) useDoc.getState().setSourceFromEditor(text)
    }
    useDoc.getState().registerFlusher(flush)
    // Outline navigation: scroll to the heading's source line, landed near the
    // top of the page (the window is the scroll container — the CM scroller is
    // sized to its content).
    useDoc.getState().registerScroller((offset) => {
      const pos = Math.min(Math.max(offset, 0), view.state.doc.length)
      view.dispatch({ selection: { anchor: pos } })
      const node = view.domAtPos(pos).node
      const line = (node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest('.cm-line') ?? null
      scrollElementToTop(line)
    })

    return () => {
      // Deliberately NOT flushing on unmount: every edit was already pushed live,
      // so the store is current. A remount is triggered by an external buffer
      // swap (disk reload, handback adopting the new summary block) — flushing the
      // outgoing editor's now-stale text would overwrite that adopted content.
      useDoc.getState().registerFlusher(null)
      useDoc.getState().registerScroller(null)
      view.destroy()
    }
  }, [])

  return <div ref={hostRef} className="source-host" />
}
