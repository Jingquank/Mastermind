import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { animateSlotText, buildSlotText, clearSlotText, type SlotOptions } from 'slot-text'

/**
 * A text label that rolls character-by-character (slot-text) whenever its
 * content changes — and, optionally, when it first mounts. Display-only: it
 * renders a single <span>, owns nothing but that span's text, and degrades to
 * plain static text under `prefers-reduced-motion`. Use it for chrome captions
 * (filename, mode, status, toasts) and for button labels whose text flips on
 * click. Never put it inside the selectable document body — slot-text doubles
 * each glyph into a hidden sizer cell, which would corrupt source-offset
 * mapping for selection and commenting.
 */

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Building with an empty string yields zero cells, and slot-text then short-
// circuits to a no-op build (no roll). To get a roll-in *reveal* we seed the
// label with same-length whitespace so every visible glyph rolls up out of a
// blank cell. Newlines are left intact so multi-line labels keep their shape.
const blankOf = (text: string): string => text.replace(/[^\n]/g, ' ')

export interface SlotHandle {
  /**
   * Re-roll the label as click feedback. With no argument it re-rolls the
   * current text in place; pass `temp` to flash a transient caption that rolls
   * back to the resting text shortly after.
   */
  flash: (temp?: string, options?: SlotOptions) => void
}

interface SlotLabelProps {
  text: string
  /** Roll the text in from blank when the label first mounts. */
  revealOnMount?: boolean
  /** Bump to force a re-roll even when `text` is unchanged (e.g. a refresh). */
  rerollKey?: string | number
  /** A single CSS color swept across the glyphs as they roll on change/flash,
   *  fading back to the resting ink. Omit for a plain (untinted) roll. */
  tint?: string
  options?: SlotOptions
  className?: string
  title?: string
  ['aria-hidden']?: boolean
}

export const SlotLabel = forwardRef<SlotHandle, SlotLabelProps>(function SlotLabel(
  { text, revealOnMount = false, rerollKey, tint, options, className, title, 'aria-hidden': ariaHidden },
  ref,
) {
  const elRef = useRef<HTMLSpanElement>(null)
  const firstChange = useRef(true)
  const optsRef = useRef(options)
  optsRef.current = options
  const tintRef = useRef(tint)
  tintRef.current = tint
  const textRef = useRef(text)
  textRef.current = text

  // Change/flash rolls re-roll every glyph (skipUnchanged off) so even a
  // same-length swap visibly moves; `tint` adds a single-hue sweep that fades
  // back to the resting ink.
  const changeOpts = (extra?: SlotOptions): SlotOptions => ({
    skipUnchanged: false,
    ...optsRef.current,
    ...(tintRef.current ? { color: tintRef.current } : null),
    ...extra,
  })

  useImperativeHandle(
    ref,
    () => ({
      flash(temp, flashOptions) {
        const el = elRef.current
        if (!el || prefersReducedMotion()) return
        const target = temp ?? textRef.current
        animateSlotText(el, target, {
          skipUnchanged: false,
          ...(tintRef.current ? { color: tintRef.current } : null),
          ...optsRef.current,
          ...flashOptions,
        })
        if (temp !== undefined && temp !== textRef.current) {
          window.setTimeout(() => {
            const cur = elRef.current
            if (cur) animateSlotText(cur, textRef.current, optsRef.current)
          }, 1200)
        }
      },
    }),
    [],
  )

  // Build on mount (with an optional roll-in reveal); tear down on unmount.
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    if (revealOnMount && !prefersReducedMotion()) {
      buildSlotText(el, blankOf(text))
      // Defer one frame so the cells have measured height before they roll.
      const raf = requestAnimationFrame(() => {
        if (elRef.current) animateSlotText(elRef.current, textRef.current, optsRef.current)
      })
      return () => {
        cancelAnimationFrame(raf)
        clearSlotText(el)
      }
    }
    buildSlotText(el, text)
    return () => clearSlotText(el)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Roll whenever the text (or rerollKey) changes after the initial mount.
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    if (firstChange.current) {
      firstChange.current = false
      return
    }
    if (prefersReducedMotion()) {
      buildSlotText(el, text)
      return
    }
    animateSlotText(el, text, changeOpts())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, rerollKey])

  return <span ref={elRef} className={className} title={title} aria-hidden={ariaHidden} aria-label={text} />
})
