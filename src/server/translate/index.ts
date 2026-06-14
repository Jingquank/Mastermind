import { validateTranslatedBlock } from '../../shared/blocks'
import { AssistError, type AssistRegistry } from '../assist/index'
import type { Session } from '../sessions'
import { loadCache, saveCache } from './cache'

export interface TranslateRequestBlock {
  hash: string
  text: string
}

export interface TranslateResult {
  hash: string
  text?: string
  error?: 'structure' | 'provider' | 'no-agent' | 'timeout' | 'cancel'
  cached: boolean
}

export interface TranslateOutcome {
  results: TranslateResult[]
  /** set when blocks needed the agent but it couldn't serve them (e.g. 'no-agent'); cached blocks still come back */
  error?: string
}

/**
 * Translate blocks, on-disk cache first. Cached hits (by content hash + target
 * language) return immediately and work with no agent at all — that's what makes
 * the toggle survive reloads and run offline. Only true misses route ONE batched
 * request to the user's coding agent (the sole translation backend — no APIs),
 * and fresh results are persisted. A missing/slow agent fails only the misses;
 * cached blocks are unaffected, so translation degrades gracefully instead of
 * going all-or-nothing.
 */
export async function translateBlocks(
  session: Session,
  blocks: TranslateRequestBlock[],
  sourceLang: string,
  targetLang: string,
  assist: AssistRegistry,
): Promise<TranslateOutcome> {
  if (blocks.length === 0) return { results: [] }

  const cache = await loadCache(session.path, targetLang)
  const results: TranslateResult[] = []
  const misses: TranslateRequestBlock[] = []
  for (const block of blocks) {
    const hit = cache[block.hash]
    if (hit !== undefined && validateTranslatedBlock(block.text, hit)) {
      results.push({ hash: block.hash, text: hit, cached: true })
    } else {
      misses.push(block)
    }
  }
  if (misses.length === 0) return { results }

  const fresh: Record<string, string> = {}
  let error: string | undefined
  try {
    const payload = await assist.enqueue(session, { kind: 'translate', sourceLang, targetLang, blocks: misses })
    const byHash = new Map(payload.kind === 'translate' ? payload.blocks.map((b) => [b.hash, b.text]) : [])
    for (const block of misses) {
      const text = byHash.get(block.hash)
      if (text === undefined) results.push({ hash: block.hash, error: 'provider', cached: false })
      else if (!validateTranslatedBlock(block.text, text)) results.push({ hash: block.hash, error: 'structure', cached: false })
      else {
        results.push({ hash: block.hash, text, cached: false })
        fresh[block.hash] = text
      }
    }
  } catch (err) {
    // no agent / timeout / cancel — fail only the misses, keep cached hits
    error = err instanceof AssistError ? err.code : 'provider'
    for (const block of misses) results.push({ hash: block.hash, error: error as TranslateResult['error'], cached: false })
  }

  await saveCache(session.path, targetLang, fresh)
  return { results, error }
}
