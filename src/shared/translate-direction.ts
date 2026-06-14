/**
 * Reading-pair translation direction — picks which side of the `langPair` is the
 * source vs. target for a given document, from a CJK-script heuristic.
 *
 * Isomorphic / browser-safe so BOTH the browser (translate toggle) and the CLI
 * (offline `translate-blocks` pre-translate) compute the SAME target-language
 * string — that parity is what makes a CLI-written translation cache a hit when
 * the browser later asks for it.
 */

import { detectDocScript } from './blocks'
import { isCjkLang } from './languages'

export function pickTarget(source: string, pair: { a: string; b: string }): { sourceLang: string; targetLang: string } {
  const docIsCjk = detectDocScript(source) === 'cjk'
  const aIsCjk = isCjkLang(pair.a)
  if (docIsCjk) {
    return aIsCjk ? { sourceLang: pair.a, targetLang: pair.b } : { sourceLang: pair.b, targetLang: pair.a }
  }
  return aIsCjk ? { sourceLang: pair.b, targetLang: pair.a } : { sourceLang: pair.a, targetLang: pair.b }
}

export function previewTargetLang(source: string, pair: { a: string; b: string }): string {
  return pickTarget(source, pair).targetLang
}
