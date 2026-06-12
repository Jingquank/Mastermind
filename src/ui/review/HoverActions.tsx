import { useEffect, useState, type RefObject } from 'react'
import { acceptEdit, rejectEdit } from '../../shared/critic/resolve'
import type { CriticSpan } from '../../shared/critic/types'
import type { TextEdit } from '../../shared/types'

interface Props {
  articleRef: RefObject<HTMLElement | null>
  spans: readonly CriticSpan[]
  source: string
  onEdit: (edits: TextEdit[]) => void
}

interface HoverState {
  spanIndex: number
  top: number
  left: number
}

/** Floating Accept/Reject chip over hovered ins/del/sub marks (Reading mode). */
export function HoverActions({ articleRef, spans, source, onEdit }: Props) {
  const [state, setState] = useState<HoverState | null>(null)

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null
    const onOver = (e: MouseEvent): void => {
      const target = e.target as HTMLElement
      if (target.closest('.hover-actions')) {
        if (hideTimer) clearTimeout(hideTimer)
        return
      }
      const article = articleRef.current
      const el = target.closest('.critic-ins, .critic-del, .critic-sub') as HTMLElement | null
      if (el && article?.contains(el)) {
        if (hideTimer) clearTimeout(hideTimer)
        const idx = Number(el.dataset.spanIndex)
        if (!Number.isFinite(idx)) return
        const rect = el.getBoundingClientRect()
        setState({ spanIndex: idx, top: rect.top, left: rect.left })
      } else {
        if (hideTimer) clearTimeout(hideTimer)
        hideTimer = setTimeout(() => setState(null), 200)
      }
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setState(null)
    }
    document.addEventListener('mouseover', onOver)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('keydown', onKey)
      if (hideTimer) clearTimeout(hideTimer)
    }
  }, [articleRef])

  if (!state) return null
  const span = spans[state.spanIndex]
  if (!span || (span.kind !== 'ins' && span.kind !== 'del' && span.kind !== 'sub')) return null

  const act = (mode: 'accept' | 'reject'): void => {
    onEdit([mode === 'accept' ? acceptEdit(source, span) : rejectEdit(source, span)])
    setState(null)
  }

  return (
    <div
      className="hover-actions"
      style={{ top: Math.max(4, state.top - 34), left: Math.max(4, state.left) }}
    >
      <button type="button" className="accept" onClick={() => act('accept')}>
        Accept
      </button>
      <button type="button" className="reject" onClick={() => act('reject')}>
        Reject
      </button>
    </div>
  )
}
