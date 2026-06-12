import { diffWords } from 'diff'
import { useEffect, useMemo, useState } from 'react'
import { useT } from '../i18n'
import { stripSummary } from '../../shared/summary'
import { getLatestSnapshot } from '../app/api'
import { useDoc } from '../app/store'

interface Loaded {
  snapshotId: string
  oldText: string
}

/**
 * Read-only word-level diff between the latest hand-back snapshot and the
 * current buffer — "what did the agent change since my last review?".
 * The summary block is stripped from both sides (its timestamp is pure noise);
 * CriticMarkup stays visible — how the agent handled marks IS the content.
 */
export function DiffView({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const source = useDoc((s) => s.source)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const t = useT()

  useEffect(() => {
    let cancelled = false
    getLatestSnapshot(sessionId)
      .then((snap) => {
        if (!cancelled) setLoaded({ snapshotId: snap.id, oldText: stripSummary(snap.content) })
      })
      .catch(() => {
        if (!cancelled) setError('No hand-back snapshot found for this file.')
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const parts = useMemo(() => {
    if (!loaded) return null
    return diffWords(loaded.oldText, stripSummary(source))
  }, [loaded, source])

  const changeCount = useMemo(() => parts?.filter((p) => p.added || p.removed).length ?? 0, [parts])

  return (
    <div className="diff-view">
      <div className="diff-head">
        <span className="diff-title">
          {t('changesSince')}
          {loaded && <span className="diff-meta"> · {t('snapshot')} {loaded.snapshotId}</span>}
          {parts && <span className="diff-meta"> · {changeCount === 0 ? t('noChanges') : `${changeCount} ${t('changedRegions')}`}</span>}
        </span>
        <button type="button" className="btn-ghost" onClick={onClose}>
          {t('backToDocument')}
        </button>
      </div>
      {error && <p className="diff-error">{error}</p>}
      {parts && (
        <pre className="diff-body">
          {parts.map((p, i) =>
            p.added ? (
              <ins key={i} className="diff-ins">
                {p.value}
              </ins>
            ) : p.removed ? (
              <del key={i} className="diff-del">
                {p.value}
              </del>
            ) : (
              <span key={i}>{p.value}</span>
            ),
          )}
        </pre>
      )}
    </div>
  )
}
