import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { EditorState, RangeSetBuilder } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, keymap, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { scan } from '../../../shared/critic/scanner'
import { codeRanges } from '../../../shared/markdown/exclusions'
import { useDoc } from '../../app/store'

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
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--color-accent-surface) !important',
  },
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
            if (u.docChanged) {
              useDoc.getState().setEditorDirty(u.state.doc.toString() !== useDoc.getState().source)
            }
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

    return () => {
      flush()
      useDoc.getState().registerFlusher(null)
      useDoc.getState().setEditorDirty(false)
      view.destroy()
    }
  }, [])

  return <div ref={hostRef} className="source-host" />
}
