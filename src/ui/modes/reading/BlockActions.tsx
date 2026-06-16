import { useEffect, useRef, useState, type RefObject } from 'react'
import type { CriticSpan } from '../../../shared/critic/types'
import type { TextEdit } from '../../../shared/types'
import { useT } from '../../i18n'
import { ChatIcon, MoreIcon, StrikethroughIcon } from '../../icons'
import { blockContentRanges, markEdits } from './selection'
import { commentEdits, deletionWrap } from './marks'

/** Only leaf text blocks get a hover affordance — never code fences, tables, or
 *  the blockquote wrapper (those map to many ranges or corrupt their structure). */
const BLOCK_SELECTOR = 'p,li,h1,h2,h3,h4,h5,h6'
const HIDE_MS = 220
/** the menu/composer flips above the trigger when this much space isn't free below */
const FLIP_THRESHOLD = 220

interface Props {
  containerRef: RefObject<HTMLElement | null>
  source: string
  spans: readonly CriticSpan[]
  authorTag: string
  onEdit: (edits: TextEdit[]) => void
}

type Mode = 'button' | 'menu' | 'compose'

interface Active {
  block: HTMLElement
  mode: Mode
}

/**
 * Hover a leaf block → a quiet ⋯ button at its right edge → a light dropdown to
 * Comment / Suggest deletion on the whole block. The block's content range is
 * derived from its inline `[data-ps]` offsets ({@link blockContentRanges}), so
 * markdown prefixes (`## `, `- `) stay out of the mark and inline formatting
 * (`**bold**`) doesn't break the mapping. This is a pointer affordance; keyboard
 * users reach the same actions through the text-selection toolbar.
 */
export function BlockActions({ containerRef, source, spans, authorTag, onEdit }: Props) {
  const t = useT()
  const [active, setActive] = useState<Active | null>(null)
  const [comment, setComment] = useState('')
  const [, setTick] = useState(0) // re-measure on scroll/resize without re-anchoring
  const activeRef = useRef<Active | null>(null)
  activeRef.current = active
  const menuRef = useRef<HTMLDivElement>(null)

  // hover tracking: surface the ⋯ on a block, and dismiss the button/menu shortly
  // after the pointer leaves — but keep it while the pointer is over the menu or the
  // block it belongs to, and never dismiss an open composer (a half-written comment
  // must not vanish on a stray move).
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null
    const clearHide = (): void => {
      if (hideTimer) clearTimeout(hideTimer)
      hideTimer = null
    }
    const scheduleHide = (): void => {
      clearHide()
      hideTimer = setTimeout(() => {
        if (activeRef.current && activeRef.current.mode !== 'compose') setActive(null)
      }, HIDE_MS)
    }
    const onOver = (e: MouseEvent): void => {
      const target = e.target as HTMLElement
      if (target.closest('.block-actions')) {
        clearHide()
        return
      }
      const cur = activeRef.current
      if (cur?.mode === 'compose') return // pinned while composing
      const block = target.closest(BLOCK_SELECTOR) as HTMLElement | null
      const inDoc = block && containerRef.current?.contains(block)
      if (cur?.mode === 'menu') {
        // keep an open menu while over its own block; dismiss when truly elsewhere
        if (inDoc && block === cur.block) clearHide()
        else scheduleHide()
        return
      }
      if (inDoc) {
        clearHide()
        if (block !== cur?.block) setActive({ block, mode: 'button' })
      } else {
        scheduleHide()
      }
    }
    document.addEventListener('mouseover', onOver)
    return () => {
      document.removeEventListener('mouseover', onOver)
      clearHide()
    }
  }, [containerRef])

  // keep the button/menu anchored to its block while the page scrolls
  useEffect(() => {
    let raf = 0
    const onScroll = (): void => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        setTick((n) => n + 1)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  // Escape closes an open menu/composer
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && activeRef.current && activeRef.current.mode !== 'button') {
        setActive(null)
        setComment('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // move focus into the dropdown when it opens, so it's operable once surfaced
  useEffect(() => {
    if (active?.mode === 'menu') menuRef.current?.querySelector('button')?.focus()
  }, [active?.mode])

  // the captured block can detach across a re-render (handback / disk reload swaps
  // the DOM); don't position against a stale node — the next hover re-anchors.
  if (!active || !active.block.isConnected) return null

  const close = (): void => {
    setActive(null)
    setComment('')
  }
  const applyDeletion = (): void => {
    const ranges = blockContentRanges(active.block, source, spans)
    if (ranges.length) onEdit(markEdits(ranges, deletionWrap))
    close()
  }
  const applyComment = (): void => {
    if (!comment.trim()) return
    const ranges = blockContentRanges(active.block, source, spans)
    if (ranges.length) onEdit(commentEdits(ranges, authorTag, comment))
    close()
  }

  const rect = active.block.getBoundingClientRect()
  const top = Math.max(8, Math.min(rect.top + 2, window.innerHeight - 40))
  // anchor the ⋯ in the right gutter; the menu/composer hang below it, right-aligned
  // (CSS) so they grow leftward over the text and never run off the right edge.
  const left = Math.max(8, Math.min(rect.right + 8, window.innerWidth - 32))
  // flip the dropdown above the trigger when there isn't room for it below
  const flipUp = rect.top > window.innerHeight - FLIP_THRESHOLD

  return (
    <div
      className={`block-actions${flipUp ? ' flip-up' : ''}`}
      style={{ top, left }}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).tagName !== 'TEXTAREA') e.preventDefault()
      }}
    >
      <button
        type="button"
        className="block-trigger"
        aria-label={t('blockActions')}
        aria-haspopup="true"
        aria-expanded={active.mode !== 'button'}
        title={t('blockActions')}
        onClick={() => setActive({ block: active.block, mode: active.mode === 'button' ? 'menu' : 'button' })}
      >
        <MoreIcon />
      </button>
      {active.mode === 'menu' && (
        <div className="block-menu" role="group" aria-label={t('blockActions')} ref={menuRef}>
          <button type="button" onClick={() => setActive({ block: active.block, mode: 'compose' })}>
            <ChatIcon width={13} height={13} />
            {t('comment')}
          </button>
          <button type="button" onClick={applyDeletion}>
            <StrikethroughIcon width={13} height={13} />
            {t('suggestDeletion')}
          </button>
        </div>
      )}
      {active.mode === 'compose' && (
        <div className="block-compose">
          <textarea
            autoFocus
            rows={3}
            placeholder={t('commentPlaceholder')}
            title={t('commentHint')}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && comment.trim()) applyComment()
              else if (e.key === 'Escape') close()
              e.stopPropagation()
            }}
          />
          <div className="block-compose-actions">
            <button type="button" onClick={close}>
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
