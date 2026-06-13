import { useEffect, useRef, useState, type RefObject } from 'react'
import type { OutlineItem } from '../modes/reading/outline'
import { scrollToOffset } from '../util/scroll'

interface Props {
  items: OutlineItem[]
  docRef: RefObject<HTMLElement | null>
}

/**
 * Sticky document outline in the left gutter. Headings carry data-ps source
 * offsets (from the renderer); clicking scrolls to one, and an
 * IntersectionObserver tracks the current section for the active marker.
 */
export function Outline({ items, docRef }: Props) {
  const [activeOffset, setActiveOffset] = useState<number | null>(null)
  const visible = useRef(new Set<number>())

  useEffect(() => {
    const doc = docRef.current
    if (!doc) return
    const els = items
      .map((it) => doc.querySelector(`[data-ps="${it.offset}"]`))
      .filter((el): el is Element => el !== null)
    if (els.length === 0) return
    visible.current.clear()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const off = Number((e.target as HTMLElement).dataset.ps)
          if (e.isIntersecting) visible.current.add(off)
          else visible.current.delete(off)
        }
        // active = the topmost (smallest offset) heading currently on screen
        const on = [...visible.current].sort((a, b) => a - b)
        setActiveOffset(on.length ? on[0]! : null)
      },
      { rootMargin: '0px 0px -65% 0px', threshold: 0 },
    )
    for (const el of els) io.observe(el)
    return () => io.disconnect()
  }, [items, docRef])

  if (items.length < 2) return null // not worth a nav for a single heading

  const minDepth = Math.min(...items.map((i) => i.depth))

  return (
    <nav className="doc-outline" aria-label="Document outline">
      <ul>
        {items.map((it) => (
          <li
            key={it.offset}
            style={{ paddingLeft: `${(it.depth - minDepth) * 12}px` }}
            className={activeOffset === it.offset ? 'active' : undefined}
          >
            <button type="button" onClick={() => scrollToOffset(docRef, it.offset)} title={it.text}>
              {it.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
