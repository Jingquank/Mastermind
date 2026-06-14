import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { useT } from '../i18n'
import { acceptEdit } from '../../shared/critic/resolve'
import { prefersReducedMotion } from '../util/presence'
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
  /** snapshotted at measure time so an exiting card survives source changes */
  anchorText: string
  thread: ThreadItem
}

const CARD_GAP = 8
/** matches --dur-base; how long a resolved card lingers to play its leave */
const EXIT_MS = 180

/**
 * Content-derived identity for a thread. Span indices shift on every edit, so a
 * positional key would remount (and re-animate) every card on each action — and
 * break exit-diffing. A content key is stable across unrelated edits, so a card
 * only enters when its thread is genuinely new and leaves when it's resolved.
 */
function threadKey(thread: ThreadItem, anchorText: string): string {
  return JSON.stringify([anchorText, thread.comments.map((c) => [c.author ?? '', c.body])])
}

export function CommentRail({ items, spans, source, docRef, authorTag, activeSpan, onActivate, onEdit }: Props) {
  const t = useT()
  const railRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef(new Map<string, HTMLDivElement>())
  const [layouts, setLayouts] = useState<CardLayout[]>([])
  const layoutsRef = useRef<CardLayout[]>([])
  const [exiting, setExiting] = useState<CardLayout[]>([])
  const exitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
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
      const seen = new Map<string, number>()
      for (const thread of threads) {
        const anchorSpan = thread.anchor ?? thread.comments[0]?.span
        if (!anchorSpan) continue
        const spanIndex = spans.indexOf(anchorSpan)
        const el = doc.querySelector(`[data-span-index="${spanIndex}"]`)
        const naturalTop = el ? el.getBoundingClientRect().top - docRect.top : 0
        const anchorText = thread.anchor ? source.slice(thread.anchor.innerStart, thread.anchor.innerEnd).slice(0, 80) : ''
        let key = threadKey(thread, anchorText)
        const dup = seen.get(key) ?? 0 // disambiguate identical threads so keys stay unique
        seen.set(key, dup + 1)
        if (dup) key = `${key}#${dup}`
        next.push({ key, spanIndex, naturalTop, top: naturalTop, anchorText, thread })
      }
      next.sort((a, b) => a.naturalTop - b.naturalTop)
      // push down to avoid overlap, using rendered card heights when known
      let cursor = 0
      for (const card of next) {
        card.top = Math.max(card.naturalTop, cursor)
        const el = cardRefs.current.get(card.key)
        cursor = card.top + (el?.offsetHeight ?? 96) + CARD_GAP
      }

      // a card whose key is gone leaves the page — keep it around (frozen at its
      // last position) just long enough to play its exit, unless a key reappears.
      const nextKeys = new Set(next.map((c) => c.key))
      const gone = layoutsRef.current.filter((p) => !nextKeys.has(p.key))
      layoutsRef.current = next
      if (!prefersReducedMotion()) {
        setExiting((cur) => {
          let result = cur.filter((x) => {
            if (!nextKeys.has(x.key)) return true
            const tm = exitTimers.current.get(x.key) // resurrected before its timer fired
            if (tm) { clearTimeout(tm); exitTimers.current.delete(x.key) }
            return false
          })
          const live = new Set(result.map((c) => c.key))
          const add = gone.filter((g) => !live.has(g.key))
          for (const g of add) {
            exitTimers.current.set(g.key, setTimeout(() => {
              exitTimers.current.delete(g.key)
              setExiting((c2) => c2.filter((x) => x.key !== g.key))
            }, EXIT_MS))
          }
          if (add.length) result = [...result, ...add]
          return result.length === cur.length && !add.length ? cur : result
        })
      }

      setLayouts(next)
      setRailHeight(Math.max(doc.scrollHeight, cursor))
    }

    measure()
    // second pass once cards have real heights
    const raf = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    // type-metric changes (font size / line height / width sliders) move
    // anchors without a source change — track the document's real size
    const ro = new ResizeObserver(() => measure())
    ro.observe(doc)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
      ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, items, spans, replyFor, activeSpan])

  // cancel any in-flight leave timers only when the rail itself unmounts
  useLayoutEffect(() => {
    const timers = exitTimers.current
    return () => timers.forEach(clearTimeout)
  }, [])

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
      {layouts.map((card, i) => {
        const isActive = activeSpan !== null && card.spanIndex === activeSpan
        return (
          <div
            key={card.key}
            ref={(el) => {
              if (el) cardRefs.current.set(card.key, el)
              else cardRefs.current.delete(card.key)
            }}
            className={`rail-card${isActive ? ' active' : ''}`}
            // stagger the entrance so a full rail cascades in (capped so a long list doesn't crawl)
            style={{ top: card.top, '--enter-delay': `${Math.min(i, 5) * 55}ms` } as CSSProperties}
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
            {card.thread.anchor && <div className="rail-card-anchor">“{card.anchorText}”</div>}
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
      {exiting.map((card) => (
        <div key={`x${card.key}`} className="rail-card leaving" style={{ top: card.top }} aria-hidden="true">
          {card.thread.anchor && <div className="rail-card-anchor">“{card.anchorText}”</div>}
          {card.thread.comments.map((c, i) => (
            <div key={i} className="rail-comment">
              {c.author && <span className="rail-author">@{c.author}</span>}
              <div className="rail-body">{c.body}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
