import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { scrollToSpan } from '../util/scroll'

export interface MarkTick {
  spanIndex: number
  kind: 'ins' | 'del' | 'sub' | 'highlight' | 'comment'
}

interface PlacedTick extends MarkTick {
  fraction: number // 0..1 down the document
}

interface Props {
  docRef: RefObject<HTMLElement | null>
  marks: MarkTick[]
  /** bumped when the buffer changes from outside the renderer — re-measure */
  version: number
}

const KIND_CLASS: Record<MarkTick['kind'], string> = {
  ins: 'tick-ins',
  del: 'tick-del',
  sub: 'tick-sub',
  highlight: 'tick-hl',
  comment: 'tick-comment',
}

/**
 * A thin scroll-track minimap: one tick per review item at its vertical
 * position, plus a viewport thumb. Positions come from the DOM (the same
 * [data-span-index] elements the walker/rail use), measured on a debounced
 * ResizeObserver — never on raw scroll. The thumb moves via transform only.
 */
export function MarkGutter({ docRef, marks, version }: Props) {
  const [ticks, setTicks] = useState<PlacedTick[]>([])
  const thumbRef = useRef<HTMLDivElement>(null)
  const metrics = useRef({ articleTop: 0, articleHeight: 1 })

  const measure = useCallback(() => {
    const doc = docRef.current
    if (!doc) return
    const articleTop = doc.getBoundingClientRect().top + window.scrollY
    const articleHeight = doc.offsetHeight || 1
    metrics.current = { articleTop, articleHeight }
    const placed: PlacedTick[] = []
    for (const m of marks) {
      const el = doc.querySelector(`[data-span-index="${m.spanIndex}"]`)
      if (!el) continue
      const top = el.getBoundingClientRect().top + window.scrollY - articleTop
      placed.push({ ...m, fraction: Math.min(1, Math.max(0, top / articleHeight)) })
    }
    // cluster ticks within ~0.6% so a dense doc draws tens, not thousands
    placed.sort((a, b) => a.fraction - b.fraction)
    const clustered: PlacedTick[] = []
    for (const tk of placed) {
      const last = clustered[clustered.length - 1]
      if (!last || tk.fraction - last.fraction > 0.006) clustered.push(tk)
    }
    setTicks(clustered)
  }, [docRef, marks])

  // measure on mount, when marks/version change, and on size changes (debounced)
  useEffect(() => {
    let raf = 0
    const schedule = (): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }
    schedule()
    const ro = new ResizeObserver(schedule)
    if (docRef.current) ro.observe(docRef.current)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [measure, version])

  // the thumb tracks scroll cheaply (transform only, no re-render)
  useEffect(() => {
    const onScroll = (): void => {
      const thumb = thumbRef.current
      if (!thumb) return
      const { articleTop, articleHeight } = metrics.current
      const topFrac = Math.max(0, (window.scrollY - articleTop) / articleHeight)
      const heightFrac = Math.min(1, window.innerHeight / articleHeight)
      thumb.style.transform = `translateY(${topFrac * 100}%)`
      thumb.style.height = `${heightFrac * 100}%`
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [ticks])

  if (ticks.length === 0) return null

  return (
    <div
      className="mark-gutter"
      aria-hidden
      onClick={(e) => {
        // jump to the nearest tick by click position
        const rect = e.currentTarget.getBoundingClientRect()
        const f = (e.clientY - rect.top) / rect.height
        let nearest = ticks[0]!
        for (const tk of ticks) if (Math.abs(tk.fraction - f) < Math.abs(nearest.fraction - f)) nearest = tk
        scrollToSpan(docRef, nearest.spanIndex)
      }}
    >
      <div ref={thumbRef} className="mark-gutter-thumb" />
      {ticks.map((tk, i) => (
        <span key={i} className={`mark-tick ${KIND_CLASS[tk.kind]}`} style={{ top: `${tk.fraction * 100}%` }} />
      ))}
    </div>
  )
}
