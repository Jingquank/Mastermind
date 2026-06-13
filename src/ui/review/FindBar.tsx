import { useEffect, useMemo, useState, type RefObject } from 'react'
import type { Analysis } from '../../shared/markdown/analyze'
import { parseAuthor } from '../../shared/critic/scanner'
import { useT } from '../i18n'
import { scrollToSpan } from '../util/scroll'

type Filter = 'all' | 'comment' | 'suggestion' | 'highlight'

interface MarkEntry {
  spanIndex: number
  group: Filter
  text: string
}

interface Props {
  analysis: Analysis
  source: string
  docRef: RefObject<HTMLElement | null>
  onClose: () => void
}

/** Mark-aware find: filter + cycle through review marks (augments native find). */
export function FindBar({ analysis, source, docRef, onClose }: Props) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [idx, setIdx] = useState(0)

  const entries = useMemo<MarkEntry[]>(() => {
    const list: MarkEntry[] = []
    analysis.spans.forEach((span, i) => {
      let group: Filter
      let text: string
      if (span.kind === 'ins' || span.kind === 'del') {
        group = 'suggestion'
        text = source.slice(span.innerStart, span.innerEnd)
      } else if (span.kind === 'sub') {
        group = 'suggestion'
        text = `${source.slice(span.oldStart!, span.oldEnd!)} ${source.slice(span.newStart!, span.newEnd!)}`
      } else if (span.kind === 'highlight') {
        group = 'highlight'
        text = source.slice(span.innerStart, span.innerEnd)
      } else {
        group = 'comment'
        text = parseAuthor(source.slice(span.innerStart, span.innerEnd)).body
      }
      list.push({ spanIndex: i, group, text })
    })
    return list
  }, [analysis, source])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter((e) => (filter === 'all' || e.group === filter) && (q === '' || e.text.toLowerCase().includes(q)))
  }, [entries, filter, query])

  // keep idx in range and paint the current match
  useEffect(() => {
    if (matches.length === 0) return
    const clamped = ((idx % matches.length) + matches.length) % matches.length
    const doc = docRef.current
    doc?.querySelectorAll('.kbd-focus').forEach((el) => el.classList.remove('kbd-focus'))
    const el = scrollToSpan(docRef, matches[clamped]!.spanIndex)
    el?.classList.add('kbd-focus')
  }, [idx, matches, docRef])

  useEffect(() => {
    return () => docRef.current?.querySelectorAll('.kbd-focus').forEach((el) => el.classList.remove('kbd-focus'))
  }, [docRef])

  const step = (delta: number): void => setIdx((i) => i + delta)
  const current = matches.length ? (((idx % matches.length) + matches.length) % matches.length) + 1 : 0

  const FILTERS: Filter[] = ['all', 'comment', 'suggestion', 'highlight']

  return (
    <div className="find-bar" role="search">
      <input
        autoFocus
        className="settings-input find-input"
        placeholder={t('findPlaceholder')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setIdx(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            step(e.shiftKey ? -1 : 1)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
          e.stopPropagation()
        }}
      />
      <div className="find-filters">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`find-filter${filter === f ? ' active' : ''}`}
            onClick={() => {
              setFilter(f)
              setIdx(0)
            }}
          >
            {t(`find_${f}` as never)}
          </button>
        ))}
      </div>
      <span className="find-count">{matches.length ? `${current}/${matches.length}` : t('findNone')}</span>
      <button type="button" className="find-nav" disabled={!matches.length} onClick={() => step(-1)} aria-label="Previous">
        ↑
      </button>
      <button type="button" className="find-nav" disabled={!matches.length} onClick={() => step(1)} aria-label="Next">
        ↓
      </button>
      <button type="button" className="btn-ghost" onClick={onClose}>
        {t('close')}
      </button>
    </div>
  )
}
