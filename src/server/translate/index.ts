import { validateTranslatedBlock } from '../../shared/blocks'
import type { AssistRegistry } from '../assist/index'
import type { Session } from '../sessions'

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

/**
 * Translate blocks by routing ONE batched request to the user's coding agent —
 * the only translation backend (no third-party APIs, no on-disk cache; the UI's
 * in-memory map is the only cache). May throw AssistError (no agent / timeout),
 * which the route turns into 409 (no agent) / 502.
 */
export async function translateBlocks(
  session: Session,
  blocks: TranslateRequestBlock[],
  sourceLang: string,
  targetLang: string,
  assist: AssistRegistry,
): Promise<TranslateResult[]> {
  if (blocks.length === 0) return []
  const payload = await assist.enqueue(session, { kind: 'translate', sourceLang, targetLang, blocks })
  const byHash = new Map(payload.kind === 'translate' ? payload.blocks.map((b) => [b.hash, b.text]) : [])
  return blocks.map((block): TranslateResult => {
    const text = byHash.get(block.hash)
    if (text === undefined) return { hash: block.hash, error: 'provider', cached: false }
    if (!validateTranslatedBlock(block.text, text)) return { hash: block.hash, error: 'structure', cached: false }
    return { hash: block.hash, text, cached: false }
  })
}
