import type { TextEdit } from '../types'

const MARKER_RE = /^([ \t]*(?:[-*+]|\d+[.)])[ \t]+\[)([ xX])\]/

/**
 * Locate the GFM task marker (`[ ]`/`[x]`) of the list item starting at
 * `itemStart` in `source`. Returns the offset of the state character.
 */
export function taskMarkerAt(source: string, itemStart: number): { offset: number; checked: boolean } | null {
  const m = MARKER_RE.exec(source.slice(itemStart, itemStart + 256))
  if (!m || m[1] === undefined || m[2] === undefined) return null
  return { offset: itemStart + m[1].length, checked: m[2] !== ' ' }
}

/** The one-character splice that flips a task checkbox in the source buffer. */
export function toggleTaskEdit(source: string, itemStart: number): TextEdit | null {
  const marker = taskMarkerAt(source, itemStart)
  if (!marker) return null
  return { from: marker.offset, to: marker.offset + 1, insert: marker.checked ? ' ' : 'x' }
}
