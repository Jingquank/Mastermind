import type { RefObject } from 'react'

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// The page (documentElement) is the scroll container in every mode. We animate
// it ourselves with rAF instead of relying on `scrollIntoView`/`scrollTo` with
// `behavior: 'smooth'`, which some browsers/environments treat as a no-op (the
// scroll silently never happens). Honors reduced-motion with an instant jump.
let scrollRaf = 0
function smoothScrollWindowTo(top: number): void {
  if (scrollRaf) {
    cancelAnimationFrame(scrollRaf)
    scrollRaf = 0
  }
  const max = document.documentElement.scrollHeight - window.innerHeight
  const dest = Math.max(0, Math.min(top, max))
  const start = window.scrollY
  const dist = dest - start
  // Instant when there's nothing to animate, reduced-motion is set, or the tab
  // is hidden (rAF is paused while hidden, so an animation would never run).
  if (prefersReducedMotion() || document.hidden || Math.abs(dist) < 2) {
    window.scrollTo(0, dest)
    return
  }
  const duration = Math.min(480, Math.max(180, Math.abs(dist) * 0.5))
  let t0 = 0
  const step = (ts: number): void => {
    if (!t0) t0 = ts
    const p = Math.min(1, (ts - t0) / duration)
    const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2 // easeInOutQuad
    window.scrollTo(0, start + dist * eased)
    scrollRaf = p < 1 ? requestAnimationFrame(step) : 0
  }
  scrollRaf = requestAnimationFrame(step)
}

/** Scroll a matched element to the viewport center (review navigation). Returns it. */
export function scrollToElement(el: Element | null): Element | null {
  if (el) {
    const rect = el.getBoundingClientRect()
    smoothScrollWindowTo(window.scrollY + rect.top - (window.innerHeight - rect.height) / 2)
  }
  return el
}

/**
 * Scroll a matched element near the top of the viewport. Used by the outline
 * navigator so the clicked heading lands inside the scroll-spy's "active" zone
 * (the top of the page) — otherwise centering it would leave a different
 * heading marked active.
 */
export function scrollElementToTop(el: Element | null, offsetTop = 24): Element | null {
  if (el) smoothScrollWindowTo(window.scrollY + el.getBoundingClientRect().top - offsetTop)
  return el
}

/** Scroll to the rendered element for a scanner span index. */
export function scrollToSpan(doc: RefObject<HTMLElement | null>, spanIndex: number): Element | null {
  return scrollToElement(doc.current?.querySelector(`[data-span-index="${spanIndex}"]`) ?? null)
}

/** Scroll to the rendered element whose source offset matches (outline headings). */
export function scrollToOffset(doc: RefObject<HTMLElement | null>, offset: number): Element | null {
  return scrollElementToTop(doc.current?.querySelector(`[data-ps="${offset}"]`) ?? null)
}
