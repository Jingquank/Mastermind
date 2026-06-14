import { useEffect, useState, type RefObject } from 'react'
import { useT } from '../i18n'
import { CheckIcon, CrossIcon } from '../icons'
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
  const t = useT()
  const [state, setState] = useState<HoverState | null>(null)

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null
    const markAt = (el: HTMLElement | null): HTMLElement | null =>
      (el?.closest?.('.critic-ins, .critic-del, .critic-sub') as HTMLElement | null) ?? null
    const show = (el: HTMLElement): void => {
      if (hideTimer) clearTimeout(hideTimer)
      const idx = Number(el.dataset.spanIndex)
      if (!Number.isFinite(idx)) return
      const rect = el.getBoundingClientRect()
      setState({ spanIndex: idx, top: rect.top, left: rect.left })
    }
    const scheduleHide = (): void => {
      if (hideTimer) clearTimeout(hideTimer)
      hideTimer = setTimeout(() => setState(null), 200)
    }
    const onOver = (e: MouseEvent): void => {
      const target = e.target as HTMLElement
      if (target.closest('.hover-actions')) {
        if (hideTimer) clearTimeout(hideTimer)
        return
      }
      const el = markAt(target)
      if (el && articleRef.current?.contains(el)) show(el)
      else scheduleHide()
    }
    // Keyboard / screen-reader users reach the marks by Tab (they're role=button
    // tabbable); surface the same chip on focus, and dismiss it when focus leaves.
    const onFocusIn = (e: FocusEvent): void => {
      const el = markAt(e.target as HTMLElement)
      if (el && articleRef.current?.contains(el)) show(el)
    }
    const onFocusOut = (): void => scheduleHide()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setState(null)
    }
    const onScroll = (): void => setState(null)
    document.addEventListener('mouseover', onOver)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll)
      if (hideTimer) clearTimeout(hideTimer)
    }
  }, [articleRef])

  // Resolve the focused suggestion mark from the keyboard: Enter accepts,
  // Delete / Backspace rejects. Re-binds with fresh source/spans so the splice
  // always lands on the current buffer.
  useEffect(() => {
    const onResolve = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter' && e.key !== 'Delete' && e.key !== 'Backspace') return
      const el = (e.target as HTMLElement | null)?.closest?.(
        '.critic-ins, .critic-del, .critic-sub',
      ) as HTMLElement | null
      if (!el || !articleRef.current?.contains(el)) return
      const span = spans[Number(el.dataset.spanIndex)]
      if (!span || (span.kind !== 'ins' && span.kind !== 'del' && span.kind !== 'sub')) return
      e.preventDefault()
      onEdit([e.key === 'Enter' ? acceptEdit(source, span) : rejectEdit(source, span)])
      setState(null)
    }
    document.addEventListener('keydown', onResolve)
    return () => document.removeEventListener('keydown', onResolve)
  }, [articleRef, spans, source, onEdit])

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
        <CheckIcon width={12} height={12} />
        {t('accept')}
      </button>
      <button type="button" className="reject" onClick={() => act('reject')}>
        <CrossIcon width={12} height={12} />
        {t('reject')}
      </button>
    </div>
  )
}
