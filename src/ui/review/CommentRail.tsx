import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useT } from '../i18n'
import { acceptEdit } from '../../shared/critic/resolve'
import type { CriticSpan, ReviewItem } from '../../shared/critic/types'
import type { TextEdit } from '../../shared/types'

type ThreadItem = Extract<ReviewItem, { type: 'thread' }>

interface Props {
  items: readonly ReviewItem[]
  spans: readonly CriticSpan[]
  source: string
  /** The rendered article element (anchor measurements are relative to it). */
  docRef: RefObject<HTMLElement | null>
  authorTag: string
  activeSpan: number | null
  onActivate: (spanIndex: number | null) => void
  onEdit: (edits: TextEdit[]) => void
}

interface CardLayout {
  key: string
  spanIndex: number
  naturalTop: number
  top: number
  thread: ThreadItem
}

const CARD_GAP = 8

export function CommentRail({ items, spans, source, docRef, authorTag, activeSpan, onActivate, onEdit }: Props) {
  const t = useT()
  const railRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef(new Map<string, HTMLDivElement>())
  const [layouts, setLayouts] = useState<CardLayout[]>([])
  const [railHeight, setRailHeight] = useState(0)
  const [replyFor, setReplyFor] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')

  const threads = items.filter((i): i is ThreadItem => i.type === 'thread')

  useLayoutEffect(() => {
    const doc = docRef.current
    if (!doc) return

    const measure = (): void => {
      const docRect = doc.getBoundingClientRect()
      const next: CardLayout[] = []
      for (const thread of threads) {
        const anchorSpan = thread.anchor ?? thread.comments[0]?.span
        if (!anchorSpan) continue
        const spanIndex = spans.indexOf(anchorSpan)
        const el = doc.querySelector(`[data-span-index="${spanIndex}"]`)
        const naturalTop = el ? el.getBoundingClientRect().top - docRect.top : 0
        next.push({ key: `t${spanIndex}`, spanIndex, naturalTop, top: naturalTop, thread })
      }
      next.sort((a, b) => a.naturalTop - b.naturalTop)
      // push down to avoid overlap, using rendered card heights when known
      let cursor = 0
      for (const card of next) {
        card.top = Math.max(card.naturalTop, cursor)
        const el = cardRefs.current.get(card.key)
        cursor = card.top + (el?.offsetHeight ?? 96) + CARD_GAP
      }
      setLayouts(next)
      setRailHeight(Math.max(doc.scrollHeight, cursor))
    }

    measure()
    // second pass once cards have real heights
    const raf = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, items, spans, replyFor, activeSpan])

  const resolveThread = (thread: ThreadItem): void => {
    const edits: TextEdit[] = thread.comments.map((c) => ({ from: c.span.start, to: c.span.end, insert: '' }))
    if (thread.anchor) edits.push(acceptEdit(source, thread.anchor)) // unwrap the highlight
    onEdit(edits)
    onActivate(null)
  }

  const submitReply = (thread: ThreadItem): void => {
    const text = replyText.trim()
    if (!text) return
    const body = text.replace(/\n[ \t]*\n+/g, '\n').replaceAll('<<}', '<< }')
    onEdit([{ from: thread.end, to: thread.end, insert: `{>>@${authorTag}: ${body}<<}` }])
    setReplyFor(null)
    setReplyText('')
  }

  if (threads.length === 0) return null

  return (
    <div ref={railRef} className="rail" style={{ height: railHeight || undefined }}>
      {layouts.map((card) => {
        const isActive = activeSpan !== null && card.spanIndex === activeSpan
        return (
          <div
            key={card.key}
            ref={(el) => {
              if (el) cardRefs.current.set(card.key, el)
              else cardRefs.current.delete(card.key)
            }}
            className={`rail-card${isActive ? ' active' : ''}`}
            style={{ top: card.top }}
            onClick={() => onActivate(card.spanIndex)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                e.preventDefault()
                onActivate(card.spanIndex)
              }
            }}
          >
            {card.thread.anchor && (
              <div className="rail-card-anchor">
                “{source.slice(card.thread.anchor.innerStart, card.thread.anchor.innerEnd).slice(0, 80)}”
              </div>
            )}
            {card.thread.comments.map((c, i) => (
              <div key={i} className="rail-comment">
                {c.author && <span className="rail-author">@{c.author}</span>}
                <div className="rail-body">{c.body}</div>
              </div>
            ))}
            {replyFor === card.key ? (
              <div className="rail-reply">
                <textarea
                  autoFocus
                  rows={2}
                  value={replyText}
                  placeholder={t('replyPlaceholder')}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitReply(card.thread)
                    if (e.key === 'Escape') {
                      setReplyFor(null)
                      setReplyText('')
                      e.stopPropagation()
                    }
                  }}
                />
                <div className="rail-actions">
                  <button type="button" onClick={() => setReplyFor(null)}>
                    {t('cancel')}
                  </button>
                  <button type="button" className="primary" disabled={!replyText.trim()} onClick={() => submitReply(card.thread)}>
                    {t('reply')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rail-actions">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setReplyFor(card.key)
                    setReplyText('')
                  }}
                >
                  {t('reply')}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    resolveThread(card.thread)
                  }}
                >
                  {t('resolve')}
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
