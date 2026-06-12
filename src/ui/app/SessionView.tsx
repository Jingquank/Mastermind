import { useEffect, useState } from 'react'
import type { SessionMeta } from '../../shared/types'
import { ApiError, getFile, getSession, openEvents } from './api'

interface LoadedDoc {
  meta: SessionMeta
  content: string
  mtimeMs: number
}

export function SessionView({ sessionId }: { sessionId: string }) {
  const [doc, setDoc] = useState<LoadedDoc | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([getSession(sessionId), getFile(sessionId)])
      .then(([meta, file]) => {
        if (cancelled) return
        setDoc({ meta, content: file.content, mtimeMs: file.mtimeMs })
        document.title = `${meta.displayName} — Mastermind`
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 404) {
          setError('Session not found — it may have expired. Run `mastermind open <file>` again.')
        } else {
          setError(err instanceof Error ? err.message : String(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    // role=ui SSE connection: its liveness is what keeps the session (and a
    // blocked `mastermind open --wait`) alive while this tab is open.
    const es = openEvents(sessionId)
    return () => es.close()
  }, [sessionId])

  if (error) {
    return (
      <main style={{ padding: '4rem', fontFamily: 'system-ui' }}>
        <h1>Mastermind</h1>
        <p>{error}</p>
      </main>
    )
  }
  if (!doc) return null

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem', fontFamily: 'system-ui' }}>
      <header style={{ borderBottom: '1px solid #ddd', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
        <strong style={{ fontFamily: 'ui-monospace, monospace', fontSize: 14 }}>{doc.meta.displayName}</strong>
      </header>
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.6 }}>
        {doc.content}
      </pre>
    </main>
  )
}
