import { useEffect, useState } from 'react'
import type { Decision } from '../../shared/critic/suggest'
import type { CriticSpan } from '../../shared/critic/types'
import type { TextEdit } from '../../shared/types'
import { useT } from '../i18n'
import { useProposals } from './proposalStore'

function spanText(markup: string, span: CriticSpan): { old: string; next: string } {
  if (span.kind === 'sub') {
    return { old: markup.slice(span.oldStart!, span.oldEnd!), next: markup.slice(span.newStart!, span.newEnd!) }
  }
  const inner = markup.slice(span.innerStart, span.innerEnd)
  return span.kind === 'del' ? { old: inner, next: '' } : { old: '', next: inner }
}

/**
 * The staging gate: agent-proposed edits live here, never in the buffer, until
 * the user accepts. Each row is one proposed ins/del/sub with accept/edit/dismiss;
 * Apply commits only the accepted ones as plain text via onEdit.
 */
export function ProposalCard({ onEdit }: { onEdit: (edits: TextEdit[]) => void }) {
  const t = useT()
  const status = useProposals((s) => s.status)
  const markup = useProposals((s) => s.markup)
  const spans = useProposals((s) => s.spans)
  const decisions = useProposals((s) => s.decisions)
  const setDecision = useProposals((s) => s.setDecision)
  const accepted = useProposals((s) => s.acceptedCount())
  const [editing, setEditing] = useState<number | null>(null)
  const [editText, setEditText] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useProposals.getState().dismiss()
    }
    if (status === 'pending' || status === 'staged' || status === 'failed') {
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }
  }, [status])

  if (status === 'idle') return null

  return (
    <div className="proposal-card" role="dialog" aria-label={t('suggestionsTitle')}>
      <div className="proposal-head">
        <span className="proposal-title">{t('suggestionsTitle')}</span>
        <button type="button" className="btn-ghost" onClick={() => useProposals.getState().dismiss()}>
          {t('dismiss')}
        </button>
      </div>

      {status === 'pending' && <p className="proposal-status">{t('suggestionsPending')}</p>}
      {status === 'failed' && <p className="proposal-status proposal-failed">{t('suggestionsFailed')}</p>}

      {status === 'staged' && (
        <>
          <ul className="proposal-list">
            {spans.map((span, i) => {
              const { old, next } = spanText(markup, span)
              const decision = decisions.get(i)
              return (
                <li key={i} className={`proposal-row${decision === 'reject' ? ' rejected' : ''}`}>
                  <div className="proposal-diff">
                    {old && <del className="critic critic-del">{old}</del>}
                    {span.kind === 'sub' && <span className="critic-sub-arrow" aria-hidden>→</span>}
                    {editing === i ? (
                      <input
                        autoFocus
                        className="settings-input proposal-edit"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setDecision(i, { edit: editText })
                            setEditing(null)
                          }
                          if (e.key === 'Escape') {
                            setEditing(null)
                            e.stopPropagation()
                          }
                        }}
                      />
                    ) : (
                      (next || decision === undefined) && <ins className="critic critic-ins">{decisionText(decision, next)}</ins>
                    )}
                  </div>
                  <div className="proposal-actions">
                    <button
                      type="button"
                      className={`proposal-btn accept${decision === 'accept' || (decision && typeof decision === 'object') ? ' on' : ''}`}
                      onClick={() => setDecision(i, 'accept')}
                      title={t('accept')}
                    >
                      {t('accept')}
                    </button>
                    {span.kind !== 'del' && (
                      <button
                        type="button"
                        className="proposal-btn"
                        onClick={() => {
                          setEditing(i)
                          setEditText(next)
                        }}
                        title={t('edit')}
                      >
                        {t('edit')}
                      </button>
                    )}
                    <button
                      type="button"
                      className={`proposal-btn reject${decision === 'reject' ? ' on' : ''}`}
                      onClick={() => setDecision(i, 'reject')}
                      title={t('dismiss')}
                    >
                      {t('dismiss')}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="proposal-foot">
            <button type="button" className="btn-ghost" onClick={() => useProposals.getState().dismiss()}>
              {t('dismissAll')}
            </button>
            <button
              type="button"
              className="btn-cta"
              disabled={accepted === 0}
              onClick={() => useProposals.getState().apply(onEdit)}
            >
              {t('applyN')} ({accepted})
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function decisionText(decision: Decision | undefined, fallback: string): string {
  if (decision && typeof decision === 'object') return decision.edit
  return fallback
}
