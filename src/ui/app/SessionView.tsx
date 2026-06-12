import { useEffect, useMemo } from 'react'
import { parseMarkdown } from '../../shared/markdown/processor'
import { MarkdownView } from '../modes/reading/Renderer'
import { openEvents } from './api'
import { useDoc } from './store'
import { TopBar } from './TopBar'

export function SessionView({ sessionId }: { sessionId: string }) {
  const status = useDoc((s) => s.status)
  const error = useDoc((s) => s.error)
  const source = useDoc((s) => s.source)
  const conflict = useDoc((s) => s.conflict)
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
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save])

  const tree = useMemo(() => (status === 'ready' ? parseMarkdown(source) : null), [status, source])

  if (status === 'error') {
    return (
      <div className="center-note">
        <h1>MASTERMIND</h1>
        <p>{error}</p>
      </div>
    )
  }
  if (!tree) return null

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
        <article className="doc-column md-root">
          <MarkdownView tree={tree} ctx={{ source, onEdit: (edit) => applyEdits([edit]) }} />
        </article>
      </div>
    </>
  )
}
