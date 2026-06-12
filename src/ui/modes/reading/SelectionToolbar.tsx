import { useEffect, useRef, useState, type RefObject } from 'react'
import type { CriticSpan } from '../../../shared/critic/types'
import type { TextEdit } from '../../../shared/types'
import { useT } from '../../i18n'
import { rangeToSource, type SelRange } from './selection'

interface Props {
  containerRef: RefObject<HTMLElement | null>
  source: string
  spans: readonly CriticSpan[]
  authorTag: string
  onEdit: (edits: TextEdit[]) => void
}

interface Active {
  sel: SelRange
  rect: { top: number; left: number; width: number }
}

/** Comment bodies must not contain a closer or a blank line. */
function sanitizeComment(text: string): string {
  return text.trim().replace(/\n[ \t]*\n+/g, '\n').replaceAll('<<}', '<< }')
}

export function SelectionToolbar({ containerRef, source, spans, authorTag, onEdit }: Props) {
  const t = useT()
  const [active, setActive] = useState<Active | null>(null)
  const [composing, setComposing] = useState(false)
  const [comment, setComment] = useState('')
  const composingRef = useRef(false)
  composingRef.current = composing

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const onSelectionChange = (): void => {
      if (composingRef.current) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
          setActive(null)
          return
        }
        const range = sel.getRangeAt(0)
        const container = containerRef.current
        if (!container || !container.contains(range.commonAncestorContainer)) {
          setActive(null)
          return
        }
        const res = rangeToSource(range, source, spans)
        if ('error' in res) {
          setActive(null)
          return
        }
        const rect = range.getBoundingClientRect()
        setActive({ sel: res, rect: { top: rect.top, left: rect.left, width: rect.width } })
      }, 120)
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange)
      if (timer) clearTimeout(timer)
    }
  }, [containerRef, source, spans])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setComposing(false)
        setComment('')
        setActive(null)
      }
    }
    // keep the floating toolbar anchored to its selection while scrolling
    let raf = 0
    const onScroll = (): void => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0) return
        const rect = sel.getRangeAt(0).getBoundingClientRect()
        setActive((prev) => (prev ? { ...prev, rect: { top: rect.top, left: rect.left, width: rect.width } } : prev))
      })
    }
    if (active) {
      window.addEventListener('keydown', onKey)
      window.addEventListener('scroll', onScroll, { passive: true })
    }
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [active])

  if (!active) return null

  const slice = source.slice(active.sel.from, active.sel.to)
  const apply = (insert: string): void => {
    onEdit([{ from: active.sel.from, to: active.sel.to, insert }])
    window.getSelection()?.removeAllRanges()
    setActive(null)
    setComposing(false)
    setComment('')
  }

  const top = Math.max(8, active.rect.top - (composing ? 150 : 44))
  const left = Math.min(Math.max(8, active.rect.left + active.rect.width / 2 - 130), window.innerWidth - 280)

  return (
    <div
      className="sel-toolbar"
      style={{ top, left }}
      onMouseDown={(e) => {
        // keep the document selection alive while clicking toolbar buttons,
        // but never steal the caret from the composer's own textarea
        if ((e.target as HTMLElement).tagName !== 'TEXTAREA') e.preventDefault()
      }}
    >
      {!composing ? (
        <>
          <button type="button" onClick={() => setComposing(true)}>
            {t('comment')}
          </button>
          <button type="button" onClick={() => apply(`{--${slice}--}`)}>
            {t('suggestDeletion')}
          </button>
          <button type="button" onClick={() => apply(`{==${slice}==}`)}>
            {t('highlight')}
          </button>
        </>
      ) : (
        <div className="sel-composer">
          <textarea
            autoFocus
            rows={3}
            placeholder={t('commentPlaceholder')}
            title={t('commentHint')}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && comment.trim()) {
                apply(`{==${slice}==}{>>@${authorTag}: ${sanitizeComment(comment)}<<}`)
              } else if (e.key === 'Escape') {
                // the textarea swallows keydowns (stopPropagation below), so
                // the window-level Escape handler never sees this one
                setComposing(false)
                setComment('')
                setActive(null)
              }
              e.stopPropagation()
            }}
          />
          <div className="sel-composer-actions">
            <button type="button" onClick={() => setComposing(false)}>
              {t('cancel')}
            </button>
            <button
              type="button"
              className="primary"
              disabled={!comment.trim()}
              onClick={() => apply(`{==${slice}==}{>>@${authorTag}: ${sanitizeComment(comment)}<<}`)}
            >
              {t('comment')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
