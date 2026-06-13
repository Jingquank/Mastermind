import { useEffect, useState } from 'react'
import { acceptEdit, rejectEdit } from '../../../shared/critic/resolve'
import { scan } from '../../../shared/critic/scanner'
import type { CriticKind } from '../../../shared/critic/types'
import { codeRanges } from '../../../shared/markdown/exclusions'
import { useDoc } from '../../app/store'
import { useT } from '../../i18n'

interface HoverState {
  spanIndex: number
  kind: CriticKind
  top: number
  left: number
}

const KIND_FOR_CLASS: { sel: string; kind: CriticKind }[] = [
  { sel: 'critic-sub', kind: 'sub' },
  { sel: 'critic-ins', kind: 'ins' },
  { sel: 'critic-del', kind: 'del' },
]

/**
 * Accept/reject chip over hovered ins/del/sub marks in WYSIWYG mode — the
 * Editing-mode twin of review/HoverActions. Routes by dirtiness: a clean editor
 * splices the byte-exact source and remounts (applyEdits); a dirty editor (the
 * user has typed) mutates the live ProseMirror doc so the typing survives.
 */
export function EditingHoverActions() {
  const t = useT()
  const [state, setState] = useState<HoverState | null>(null)

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null
    const onOver = (e: MouseEvent): void => {
      const target = e.target as HTMLElement
      if (target.closest('.hover-actions')) {
        if (hideTimer) clearTimeout(hideTimer)
        return
      }
      const host = target.closest('.milkdown-host')
      const el = target.closest('.critic-ins, .critic-del, .critic-sub') as HTMLElement | null
      if (el && host?.contains(el)) {
        if (hideTimer) clearTimeout(hideTimer)
        const idx = Number(el.dataset.spanIndex)
        if (!Number.isFinite(idx)) return
        const kind = KIND_FOR_CLASS.find((k) => el.classList.contains(k.sel))?.kind
        if (!kind) return
        const rect = el.getBoundingClientRect()
        setState({ spanIndex: idx, kind, top: rect.top, left: rect.left })
      } else {
        if (hideTimer) clearTimeout(hideTimer)
        hideTimer = setTimeout(() => setState(null), 200)
      }
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setState(null)
    }
    const onScroll = (): void => setState(null)
    document.addEventListener('mouseover', onOver)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll)
      if (hideTimer) clearTimeout(hideTimer)
    }
  }, [])

  if (!state) return null

  const act = (mode: 'accept' | 'reject'): void => {
    const s = useDoc.getState()
    if (s.editorDirty) {
      // dirty: mutate the live doc so the user's unflushed typing is preserved
      s.editorResolve?.(state.spanIndex, state.kind, mode)
    } else {
      // clean: splice the byte-exact source; the editor remounts from it
      const src = s.source
      const span = scan(src, codeRanges(src))[state.spanIndex]
      if (span) s.applyEdits([mode === 'accept' ? acceptEdit(src, span) : rejectEdit(src, span)])
    }
    setState(null)
  }

  return (
    <div className="hover-actions" style={{ top: Math.max(4, state.top - 34), left: Math.max(4, state.left) }}>
      <button type="button" className="accept" onClick={() => act('accept')}>
        {t('accept')}
      </button>
      <button type="button" className="reject" onClick={() => act('reject')}>
        {t('reject')}
      </button>
    </div>
  )
}
