import { useEffect, useRef, useState, type RefObject } from 'react'
import type { CriticSpan } from '../../../shared/critic/types'
import type { TextEdit } from '../../../shared/types'
import { useT } from '../../i18n'
import { ChatIcon, StrikethroughIcon } from '../../icons'
import { usePresence } from '../../util/presence'
import { rangeToSourceRanges, markEdits, type SelRange } from './selection'
import { commentEdits, deletionWrap } from './marks'

/** matches --dur-fast; the toolbar's pop-out duration */
const EXIT_MS = 120

interface Props {
  containerRef: RefObject<HTMLElement | null>
  source: string
  spans: readonly CriticSpan[]
  authorTag: string
  onEdit: (edits: TextEdit[]) => void
}

interface Active {
  /** one source range per block the selection spans (≥1, in document order) */
  ranges: SelRange[]
  rect: { top: number; left: number; width: number }
}

export function SelectionToolbar({ containerRef, source, spans, authorTag, onEdit }: Props) {
  const t = useT()
  const [active, setActive] = useState<Active | null>(null)
  const [composing, setComposing] = useState(false)
  const [comment, setComment] = useState('')
  const composingRef = useRef(false)
  composingRef.current = composing
  const lastActive = useRef<Active | null>(null)

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
        const res = rangeToSourceRanges(range, source, spans)
        if ('error' in res) {
          setActive(null)
          return
        }
        const rect = range.getBoundingClientRect()
        setActive({ ranges: res.ranges, rect: { top: rect.top, left: rect.left, width: rect.width } })
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
        // overlays (settings, dialogs) consume Escape first
        if (document.querySelector('.settings-panel, .modal-backdrop')) return
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

  // keep the toolbar mounted through its leave animation; render against the
  // last live selection so position/contents hold steady while it fades out.
  const present = usePresence(!!active, EXIT_MS)
  if (active) lastActive.current = active
  const view = active ?? lastActive.current
  if (!present.mounted || !view) return null

  const finish = (edits: TextEdit[]): void => {
    onEdit(edits)
    window.getSelection()?.removeAllRanges()
    setActive(null)
    setComposing(false)
    setComment('')
  }
  // a deletion can't cross a block boundary, so a multi-block selection becomes
  // one `{--…--}` per block.
  const applyDeletion = (): void => finish(markEdits(view.ranges, deletionWrap))
  const applyComment = (): void => finish(commentEdits(view.ranges, authorTag, comment))

  const top = Math.max(8, view.rect.top - (composing ? 150 : 44))
  const left = Math.min(Math.max(8, view.rect.left + view.rect.width / 2 - 130), window.innerWidth - 280)

  return (
    <div
      className={`sel-toolbar${present.exiting ? ' closing' : ''}`}
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
            <ChatIcon width={13} height={13} />
            {t('comment')}
          </button>
          <button type="button" onClick={applyDeletion}>
            <StrikethroughIcon width={13} height={13} />
            {t('suggestDeletion')}
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
                applyComment()
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
            <button type="button" className="primary" disabled={!comment.trim()} onClick={applyComment}>
              {t('comment')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
