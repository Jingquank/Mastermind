import path from 'node:path'
import fs from 'node:fs/promises'

/**
 * On-disk translation cache. Translations are keyed by content hash (sha-256 of
 * the block) and target language, so they survive reloads and unrelated edits —
 * an unchanged block stays translated without re-asking the agent. Lives next to
 * the document under `.mastermind/translations/`, the same sibling dir the rest
 * of Mastermind's on-disk state uses (and which the workspace tree hides).
 */
export function cacheFile(realPath: string, targetLang: string): string {
  // targetLang is a language code (en, zh-CN, …); sanitize anyway for the filename.
  const safeLang = targetLang.replace(/[^a-zA-Z0-9_-]/g, '_') || 'x'
  return path.join(path.dirname(realPath), '.mastermind', 'translations', `${path.basename(realPath)}.${safeLang}.json`)
}

/** The cached `{ blockHash: translatedText }` map, or `{}` if none/unreadable. */
export async function loadCache(realPath: string, targetLang: string): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(cacheFile(realPath, targetLang), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

/**
 * Merge fresh translations into the on-disk cache (read-modify-write). Best-effort:
 * a disk failure never breaks translation, it just doesn't persist. Content-addressed,
 * so superseded block versions linger harmlessly until pruned by a future cleanup.
 */
export async function saveCache(realPath: string, targetLang: string, entries: Record<string, string>): Promise<void> {
  if (Object.keys(entries).length === 0) return
  const file = cacheFile(realPath, targetLang)
  try {
    await fs.mkdir(path.dirname(file), { recursive: true })
    const merged = { ...(await loadCache(realPath, targetLang)), ...entries }
    await fs.writeFile(file, JSON.stringify(merged))
  } catch {
    // best-effort: the in-memory translation still works even if the cache can't persist
  }
}
