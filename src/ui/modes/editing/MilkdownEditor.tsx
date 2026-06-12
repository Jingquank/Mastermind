import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  remarkStringifyOptionsCtx,
  rootCtx,
  serializerCtx,
} from '@milkdown/kit/core'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { history } from '@milkdown/kit/plugin/history'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import type { Node as PMNode } from '@milkdown/kit/prose/model'
import { useEffect, useRef } from 'react'
import { useDoc } from '../../app/store'
import { critic } from './critic'

/**
 * House serialization style for documents edited in WYSIWYG mode. The no-edit
 * path never serializes (byte-exact passthrough at the store level); these
 * options only shape REAL edits. Documented in KNOWN_LIMITATIONS.md.
 */
const STRINGIFY_OPTIONS = {
  bullet: '-' as const,
  emphasis: '*' as const,
  strong: '*' as const,
  fence: '`' as const,
  fences: true,
  listItemIndent: 'one' as const,
  rule: '-' as const,
}

export function MilkdownEditor() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let editor: Editor | null = null
    let entryDoc: PMNode | null = null
    let destroyed = false

    const flush = (): void => {
      if (!editor) return
      try {
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx)
          if (entryDoc && view.state.doc.eq(entryDoc)) return // byte-exact passthrough
          const serialize = ctx.get(serializerCtx)
          const md = serialize(view.state.doc)
          useDoc.getState().setSourceFromEditor(md)
          entryDoc = view.state.doc
        })
      } catch {
        /* editor mid-teardown */
      }
    }

    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, useDoc.getState().source)
        ctx.set(remarkStringifyOptionsCtx, STRINGIFY_OPTIONS)
        ctx.get(listenerCtx).updated((_ctx, doc) => {
          if (entryDoc) useDoc.getState().setEditorDirty(!doc.eq(entryDoc))
        })
      })
      // critic FIRST: its marks must outrank preset marks so a single
      // insertion wraps bold/code content instead of splitting around it
      .use(critic)
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener)
      .create()
      .then((ed) => {
        if (destroyed) {
          void ed.destroy()
          return
        }
        editor = ed
        ed.action((ctx) => {
          entryDoc = ctx.get(editorViewCtx).state.doc
        })
        useDoc.getState().registerFlusher(flush)
      })
      .catch((err: unknown) => {
        console.error('milkdown init failed', err)
      })

    return () => {
      destroyed = true
      flush()
      useDoc.getState().registerFlusher(null)
      useDoc.getState().setEditorDirty(false)
      void editor?.destroy()
      editor = null
    }
  }, [])

  return <div ref={rootRef} className="md-root milkdown-host" />
}
