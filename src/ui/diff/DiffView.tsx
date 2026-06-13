import { diffWords } from 'diff'
import { useEffect, useMemo, useState } from 'react'
import { stripSummary } from '../../shared/summary'
import { useT } from '../i18n'
import { getLatestSnapshot, getSnapshot } from '../app/api'
import { useDoc } from '../app/store'

/** One side of the diff: a saved snapshot, or the live buffer. */
export type DiffSide = { kind: 'snapshot'; id: string } | { kind: 'latest' } | { kind: 'current' }

/** Pure word diff with the summary block stripped from both sides. */
export function computeWordDiff(oldText: string, newText: string) {
  return diffWords(stripSummary(oldText), stripSummary(newText))
}

interface Props {
  sessionId: string
  onClose: () => void
  left?: DiffSide
  right?: DiffSide
}

export function DiffView({ sessionId, onClose, left = { kind: 'latest' }, right = { kind: 'current' } }: Props) {
  const source = useDoc((s) => s.source)
  const [leftText, setLeftText] = useState<string | null>(null)
  const [rightText, setRightText] = useState<string | null>(null)
  const [leftId, setLeftId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const t = useT()

  useEffect(() => {
    let cancelled = false
    const resolveSide = async (side: DiffSide): Promise<{ text: string; id: string | null }> => {
      if (side.kind === 'current') return { text: source, id: null }
      const snap = side.kind === 'latest' ? await getLatestSnapshot(sessionId) : await getSnapshot(sessionId, side.id)
      return { text: snap.content, id: snap.id }
    }
    setError(null)
    setLeftText(null)
    setRightText(null)
    Promise.all([resolveSide(left), resolveSide(right)])
      .then(([l, r]) => {
        if (cancelled) return
        setLeftText(l.text)
        setLeftId(l.id)
        setRightText(r.text)
      })
      .catch(() => {
        if (!cancelled) setError(t('noSnapshot'))
      })
    return () => {
      cancelled = true
    }
    // re-resolve when the sides change; `source` only matters for the 'current' side and is read at resolve time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, left.kind, right.kind, left.kind === 'snapshot' ? left.id : '', right.kind === 'snapshot' ? right.id : ''])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // the 'current' side tracks live edits
  const effectiveRight = right.kind === 'current' ? source : rightText
  const parts = useMemo(() => {
    if (leftText === null || effectiveRight === null) return null
    return computeWordDiff(leftText, effectiveRight)
  }, [leftText, effectiveRight])

  const changeCount = useMemo(() => parts?.filter((p) => p.added || p.removed).length ?? 0, [parts])

  return (
    <div className="diff-view">
      <div className="diff-head">
        <span className="diff-title">
          {t('changesSince')}
          {parts && (
            <span className="diff-meta" title={leftId ? `snapshot ${leftId}` : undefined}>
              {' '}
              · {changeCount === 0 ? t('noChanges') : `${changeCount} ${t('editsCount')}`}
            </span>
          )}
        </span>
        <button type="button" className="btn-ghost" onClick={onClose}>
          {t('backToDocument')}
        </button>
      </div>
      {error && <p className="diff-error">{error}</p>}
      {!parts && !error && <p className="diff-error">{t('loadingSnapshot')}</p>}
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
