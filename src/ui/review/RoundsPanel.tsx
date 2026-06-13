import { formatCounts, useLang, useT } from '../i18n'
import { SlideOver } from '../app/SlideOver'
import type { RoundInfo } from '../app/api'
import { useDoc } from '../app/store'

function stampLabel(id: string): string {
  // 20260612T143005[-n] → 2026-06-12 14:30
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(id)
  if (!m) return id
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`
}

function totalMarks(r: RoundInfo): number {
  return r.counts.comments + r.counts.edits + r.counts.highlights
}

function deltaLabel(curr: RoundInfo, prev: RoundInfo | undefined): string | null {
  if (!prev) return null
  const d = totalMarks(curr) - totalMarks(prev)
  if (d === 0) return '±0'
  return d > 0 ? `+${d}` : `${d}`
}

/** The review-rounds timeline: each hand-back, newest first, with counts + a neutral delta. */
export function RoundsPanel({ onClose }: { onClose: () => void }) {
  const t = useT()
  const lang = useLang()
  const rounds = useDoc((s) => s.rounds)

  return (
    <SlideOver title={t('roundsTitle')} onClose={onClose} ignoreSelector=".topbar-more">
      {rounds.length === 0 ? (
        <p className="rounds-empty">{t('roundsEmpty')}</p>
      ) : (
        <ol className="rounds-list">
          {rounds.map((r, i) => {
            const delta = deltaLabel(r, rounds[i + 1]) // i+1 = the previous (older) round
            return (
              <li key={r.id}>
                <button type="button" className="rounds-row" onClick={() => useDoc.getState().openRoundDiff(r.id)}>
                  <span className="rounds-stamp">
                    {t('roundN')} {rounds.length - i}
                    <span className="rounds-date"> · {stampLabel(r.id)}</span>
                  </span>
                  <span className="rounds-counts">
                    {formatCounts(r.counts, lang)}
                    {delta && <span className="rounds-delta"> {delta}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </SlideOver>
  )
}
