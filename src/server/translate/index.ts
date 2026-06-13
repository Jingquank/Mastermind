import { validateTranslatedBlock } from '../../shared/blocks'
import type { MastermindConfig } from '../../shared/types'
import { log } from '../log'
import type { Session } from '../sessions'
import { loadCache, saveCache } from './cache'
import { translateBlock } from './providers'

export interface TranslateRequestBlock {
  hash: string
  text: string
}

export interface TranslateResult {
  hash: string
  text?: string
  error?: 'structure' | 'provider'
  cached: boolean
}

export function providerConfigured(config: MastermindConfig): boolean {
  const p = config.provider
  if (!p) return false
  if (p.type === 'agent-channel') return true // the agent is the provider; no key/model
  if (!p.model) return false
  return p.type === 'openai-compatible' || Boolean(p.apiKey)
}

/** Per-block translation with cache + structural validation, concurrency 3. */
export async function translateBlocks(
  session: Session,
  blocks: TranslateRequestBlock[],
  sourceLang: string,
  targetLang: string,
  config: MastermindConfig,
): Promise<TranslateResult[]> {
  const provider = config.provider!
  const model = provider.model ?? ''
  const entries = loadCache(session.path, targetLang, model)
  const results: TranslateResult[] = []
  const misses: TranslateRequestBlock[] = []

  for (const block of blocks) {
    const hit = entries[block.hash]
    if (hit !== undefined) results.push({ hash: block.hash, text: hit, cached: true })
    else misses.push(block)
  }

  let dirty = false
  const queue = [...misses]
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    for (;;) {
      const block = queue.shift()
      if (!block) return
      try {
        const translated = await translateBlock(provider, block.text, sourceLang, targetLang)
        if (!validateTranslatedBlock(block.text, translated)) {
          log(`translate: structural mismatch for block ${block.hash.slice(0, 8)}`)
          results.push({ hash: block.hash, error: 'structure', cached: false })
          continue
        }
        entries[block.hash] = translated
        dirty = true
        results.push({ hash: block.hash, text: translated, cached: false })
      } catch (err) {
        log('translate: provider error:', err instanceof Error ? err.message : err)
        results.push({ hash: block.hash, error: 'provider', cached: false })
      }
    }
  })
  await Promise.all(workers)

  if (dirty) saveCache(session.path, targetLang, model, entries)
  return results
}
