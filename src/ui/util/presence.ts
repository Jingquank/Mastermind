import { useEffect, useRef, useState } from 'react'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * Keep a component mounted through its exit transition. `open` is the desired
 * visibility; `mounted` stays true for `exitMs` after `open` flips to false so a
 * CSS leave animation can play, then unmounts. Drive the leave off `exiting`.
 * Honors reduced-motion by unmounting immediately (no lingering delay).
 */
export function usePresence(open: boolean, exitMs: number): { mounted: boolean; exiting: boolean } {
  const [mounted, setMounted] = useState(open)
  const [exiting, setExiting] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (open) {
      setMounted(true)
      setExiting(false)
    } else if (mounted) {
      if (exitMs <= 0 || prefersReducedMotion()) {
        setMounted(false)
        return
      }
      setExiting(true)
      timer.current = setTimeout(() => {
        timer.current = null
        setExiting(false)
        setMounted(false)
      }, exitMs)
    }
  }, [open, exitMs, mounted])

  return { mounted, exiting }
}
