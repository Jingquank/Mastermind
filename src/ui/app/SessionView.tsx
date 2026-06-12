import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_AUTHOR_TAG } from '../../shared/constants'
import { analyzeMarkdown } from '../../shared/markdown/analyze'
import { MilkdownEditor } from '../modes/editing/MilkdownEditor'
import { MarkdownView } from '../modes/reading/Renderer'
import { SelectionToolbar } from '../modes/reading/SelectionToolbar'
import { SourceEditor } from '../modes/source/SourceEditor'
import { CommentRail } from '../review/CommentRail'
import { openEvents } from './api'
import { useDoc, type ViewMode } from './store'
import { TopBar } from './TopBar'

const MODE_CYCLE: Record<ViewMode, ViewMode> = { reading: 'editing', editing: 'source', source: 'reading' }

export function SessionView({ sessionId }: { sessionId: string }) {
  const status = useDoc((s) => s.status)
  const error = useDoc((s) => s.error)
  const source = useDoc((s) => s.source)
  const conflict = useDoc((s) => s.conflict)
  const mode = useDoc((s) => s.mode)
  const externalVersion = useDoc((s) => s.externalVersion)
  const load = useDoc((s) => s.load)
  const applyEdits = useDoc((s) => s.applyEdits)
  const save = useDoc((s) => s.save)

  const articleRef = useRef<HTMLElement | null>(null)
  const [activeSpan, setActiveSpan] = useState<number | null>(null)
  const [railOpen, setRailOpen] = useState(true)

  useEffect(() => {
    void load(sessionId)
  }, [sessionId, load])

  useEffect(() => {
    // role=ui SSE connection: its liveness keeps the session (and a blocked
    // `mastermind open --wait`) alive while this tab is open.
    const es = openEvents(sessionId)
    return () => es.close()
  }, [sessionId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        const s = useDoc.getState()
        s.setMode(MODE_CYCLE[s.mode])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save])

  const analysis = useMemo(
    () => (status === 'ready' && mode === 'reading' ? analyzeMarkdown(source) : null),
    [status, source, mode],
  )
  const anchoredHighlights = useMemo(() => {
    const set = new Set<number>()
    if (!analysis) return set
    for (const item of analysis.items) {
      if (item.type === 'thread' && item.anchor) {
        const idx = analysis.spans.indexOf(item.anchor)
        if (idx >= 0) set.add(idx)
      }
    }
    return set
  }, [analysis])

  // clicking an anchored highlight or comment marker activates its rail card
  const onArticleClick = useCallback((e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest('.critic-anchor, .critic-comment-marker')
    if (target) {
      const idx = Number((target as HTMLElement).dataset.spanIndex)
      if (Number.isFinite(idx)) {
        setActiveSpan((prev) => (prev === idx ? null : idx))
        return
      }
    }
  }, [])

  // map activeSpan (any span in a thread) to the thread's CARD span index and
  // wash the anchor element
  const activeCardSpan = useMemo(() => {
    if (activeSpan === null || !analysis) return null
    for (const item of analysis.items) {
      if (item.type !== 'thread') continue
      const memberIdxs = [
        ...(item.anchor ? [analysis.spans.indexOf(item.anchor)] : []),
        ...item.comments.map((c) => analysis.spans.indexOf(c.span)),
      ]
      if (memberIdxs.includes(activeSpan)) {
        return item.anchor ? analysis.spans.indexOf(item.anchor) : analysis.spans.indexOf(item.comments[0]!.span)
      }
    }
    return null
  }, [activeSpan, analysis])

  useEffect(() => {
    const doc = articleRef.current
    if (!doc) return
    doc.querySelectorAll('.critic-anchor.active').forEach((el) => el.classList.remove('active'))
    if (activeCardSpan !== null) {
      doc.querySelector(`.critic-anchor[data-span-index="${activeCardSpan}"]`)?.classList.add('active')
    }
  }, [activeCardSpan, analysis])

  if (status === 'error') {
    return (
      <div className="center-note">
        <h1>MASTERMIND</h1>
        <p>{error}</p>
      </div>
    )
  }
  if (status !== 'ready') return null

  const hasThreads = analysis?.items.some((i) => i.type === 'thread') ?? false
  const showRail = mode === 'reading' && railOpen && hasThreads

  return (
    <>
      <TopBar
        railOpen={railOpen}
        onToggleRail={mode === 'reading' && hasThreads ? () => setRailOpen((v) => !v) : undefined}
      />
      {conflict && (
        <div className="banner" role="alert">
          <span className="banner-text">
            The file changed on disk while you were editing — saving is paused. (Reload flow lands in M7.)
          </span>
        </div>
      )}
      <div className={`doc-shell${showRail ? ' with-rail' : ''}`}>
        <div className="doc-column">
          {mode === 'reading' && analysis && (
            <article className="md-root" ref={articleRef} onClick={onArticleClick}>
              <MarkdownView
                tree={analysis.tree}
                ctx={{ source, onEdit: (edit) => applyEdits([edit]), anchoredHighlights }}
              />
            </article>
          )}
          {mode === 'editing' && <MilkdownEditor key={`e${externalVersion}`} />}
          {mode === 'source' && <SourceEditor key={`s${externalVersion}`} />}
        </div>
        {showRail && analysis && (
          <CommentRail
            items={analysis.items}
            spans={analysis.spans}
            source={source}
            docRef={articleRef}
            authorTag={DEFAULT_AUTHOR_TAG}
            activeSpan={activeCardSpan}
            onActivate={setActiveSpan}
            onEdit={applyEdits}
          />
        )}
      </div>
      {mode === 'reading' && analysis && (
        <SelectionToolbar
          containerRef={articleRef}
          source={source}
          spans={analysis.spans}
          authorTag={DEFAULT_AUTHOR_TAG}
          onEdit={applyEdits}
        />
      )}
    </>
  )
}
