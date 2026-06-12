import { useEffect, useMemo } from 'react'
import { analyzeMarkdown } from '../../shared/markdown/analyze'
import { MilkdownEditor } from '../modes/editing/MilkdownEditor'
import { MarkdownView } from '../modes/reading/Renderer'
import { SourceEditor } from '../modes/source/SourceEditor'
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

  if (status === 'error') {
    return (
      <div className="center-note">
        <h1>MASTERMIND</h1>
        <p>{error}</p>
      </div>
    )
  }
  if (status !== 'ready') return null

  return (
    <>
      <TopBar />
      {conflict && (
        <div className="banner" role="alert">
          <span className="banner-text">
            The file changed on disk while you were editing — saving is paused. (Reload flow lands in M7.)
          </span>
        </div>
      )}
      <div className="doc-shell">
        <div className="doc-column">
          {mode === 'reading' && analysis && (
            <article className="md-root">
              <MarkdownView
                tree={analysis.tree}
                ctx={{ source, onEdit: (edit) => applyEdits([edit]), anchoredHighlights }}
              />
            </article>
          )}
          {mode === 'editing' && <MilkdownEditor key={`e${externalVersion}`} />}
          {mode === 'source' && <SourceEditor key={`s${externalVersion}`} />}
        </div>
      </div>
    </>
  )
}
