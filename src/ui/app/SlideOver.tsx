import { useEffect, useRef, type ReactNode } from 'react'
import { useT } from '../i18n'
import { CrossIcon } from '../icons'

interface Props {
  title: string
  onClose: () => void
  /** Selector of the invoking control, so its own click doesn't immediately re-close the panel. */
  ignoreSelector?: string
  children: ReactNode
}

/**
 * The one transient-panel shell: a right-anchored slide-over with a titled
 * header, Escape-to-close, click-outside-to-dismiss (ignoring the invoking
 * control), and focus return on close. Settings / Rounds / Find adopt this so
 * every panel lives in the same place and behaves identically (Phase D).
 */
export function SlideOver({ title, onClose, ignoreSelector, children }: Props) {
  const t = useT()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation() // don't also trigger the document walker's Escape
        onClose()
      }
    }
    const onPointerDown = (e: MouseEvent): void => {
      const target = e.target as HTMLElement
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        !(ignoreSelector && target.closest(ignoreSelector))
      ) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointerDown)
      returnFocus.current?.focus?.()
    }
  }, [onClose, ignoreSelector])

  return (
    <div className="slide-over" role="dialog" aria-label={title} ref={panelRef}>
      <div className="slide-over-head">
        <span className="slide-over-title">{title}</span>
        <button type="button" className="btn-ghost slide-over-close" onClick={onClose} aria-label={t('close')}>
          <CrossIcon />
        </button>
      </div>
      <div className="slide-over-body">{children}</div>
    </div>
  )
}
