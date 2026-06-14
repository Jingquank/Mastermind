/**
 * Offline pre-translate — the engine behind `mastermind translate-blocks`.
 *
 * The agent (any agent) translates a document's blocks up front and writes them
 * straight into the on-disk translation cache, so Mastermind's toggle is warm on
 * open with NO live serve loop: `translateBlocks` finds every block already cached
 * (`loadCache`) and asks no one. This is the "always translate first" guardrail,
 * realized as a pure file op.
 *
 * Parity is everything: the blocks are segmented with the same isomorphic
 * `segmentBlocks`/`hashBlock` the browser uses, and the target language is chosen
 * with the same `pickTarget` — so the cache the CLI writes is exactly the cache the
 * browser later reads.
 */

import { segmentBlocks, validateTranslatedBlock } from '../../shared/blocks'
import { pickTarget } from '../../shared/translate-direction'
import { cacheFile, loadCache, saveCache } from './cache'

export interface PretranslatePlan {
  sourceLang: string
  targetLang: string
  cachePath: string
  /** translatable blocks not yet in the cache — what the agent must translate */
  blocks: { hash: string; text: string }[]
}

/** Segment a doc and list the translatable blocks still missing from the target-language cache. */
export async function planPretranslate(
  realPath: string,
  source: string,
  langPair: { a: string; b: string },
): Promise<PretranslatePlan> {
  const { sourceLang, targetLang } = pickTarget(source, langPair)
  const cached = await loadCache(realPath, targetLang)
  const blocks = (await segmentBlocks(source))
    .filter((b) => b.translatable && cached[b.hash] === undefined)
    .map((b) => ({ hash: b.hash, text: b.text }))
  return { sourceLang, targetLang, cachePath: cacheFile(realPath, targetLang), blocks }
}

export interface PretranslateWriteResult {
  targetLang: string
  cachePath: string
  written: number
  /** total dropped = unknown-hash + CriticMarkup-mismatch */
  skipped: number
  /** dropped because the hash isn't in the current document (stale plan / the doc changed) */
  skippedUnknownHash: number
  /** dropped because the translation's CriticMarkup structure didn't match the source */
  skippedMarkMismatch: number
}

/**
 * Validate agent translations against the source's CriticMarkup structure, then write the
 * valid ones to the on-disk cache (same path/format `loadCache` reads). A translation that
 * adds/drops/reorders marks is rejected, never cached — the engine's invariant, enforced here.
 */
export async function writePretranslations(
  realPath: string,
  source: string,
  langPair: { a: string; b: string },
  entries: { hash: string; text: string }[],
): Promise<PretranslateWriteResult> {
  const { targetLang } = pickTarget(source, langPair)
  const originals = new Map((await segmentBlocks(source)).map((b) => [b.hash, b.text]))
  const valid: Record<string, string> = {}
  let skippedUnknownHash = 0
  let skippedMarkMismatch = 0
  for (const { hash, text } of entries) {
    const original = originals.get(hash)
    if (original === undefined) skippedUnknownHash++
    else if (!validateTranslatedBlock(original, text)) skippedMarkMismatch++
    else valid[hash] = text
  }
  await saveCache(realPath, targetLang, valid)
  return {
    targetLang,
    cachePath: cacheFile(realPath, targetLang),
    written: Object.keys(valid).length,
    skipped: skippedUnknownHash + skippedMarkMismatch,
    skippedUnknownHash,
    skippedMarkMismatch,
  }
}
