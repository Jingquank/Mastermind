import type { TextEdit } from '../../../shared/types'
import { markEdits, type SelRange } from './selection'

/** Comment bodies must not contain a closer or a blank line. */
export function sanitizeComment(text: string): string {
  return text.trim().replace(/\n[ \t]*\n+/g, '\n').replaceAll('<<}', '<< }')
}

/** Wrap a slice as a suggested deletion: `{--text--}`. */
export function deletionWrap(text: string): string {
  return `{--${text}--}`
}

/**
 * Build the splice edits for a comment over one or more ranges. The comment
 * anchors on the first range (`{==text==}{>>@author: body<<}`); any trailing
 * ranges are dropped rather than left as bare `{==…==}` highlights — those would
 * now render invisibly (highlights only show as comment anchors) and become
 * unreachable markup.
 */
export function commentEdits(ranges: readonly SelRange[], authorTag: string, body: string): TextEdit[] {
  const safe = sanitizeComment(body)
  const anchor = ranges[0]
  if (!anchor) return []
  return markEdits([anchor], (s) => `{==${s}==}{>>@${authorTag}: ${safe}<<}`)
}
