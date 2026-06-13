import type { RefObject } from 'react'

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Scroll a matched element into view, honoring reduced-motion. Returns it. */
export function scrollToElement(el: Element | null): Element | null {
  if (el) el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  return el
}

/** Scroll to the rendered element for a scanner span index. */
export function scrollToSpan(doc: RefObject<HTMLElement | null>, spanIndex: number): Element | null {
  return scrollToElement(doc.current?.querySelector(`[data-span-index="${spanIndex}"]`) ?? null)
}

/** Scroll to the rendered element whose source offset matches (headings, etc.). */
export function scrollToOffset(doc: RefObject<HTMLElement | null>, offset: number): Element | null {
  return scrollToElement(doc.current?.querySelector(`[data-ps="${offset}"]`) ?? null)
}
