import fs from 'node:fs'
import path from 'node:path'
import { sha256hex } from '../files'
import { PROMPT_VERSION } from './providers'

interface CacheFile {
  model: string
  promptVersion: number
  entries: Record<string, string>
}

function cacheDir(realPath: string): string {
  return path.join(path.dirname(realPath), '.mastermind', 'translations', sha256hex(realPath).slice(0, 12))
}

function cacheFile(realPath: string, lang: string): string {
  return path.join(cacheDir(realPath), `${lang}.json`)
}

/** Entries survive only while model + prompt version match — else start fresh. */
export function loadCache(realPath: string, lang: string, model: string): Record<string, string> {
  try {
    const raw = fs.readFileSync(cacheFile(realPath, lang), 'utf8')
    const parsed = JSON.parse(raw) as CacheFile
    if (parsed.model !== model || parsed.promptVersion !== PROMPT_VERSION) return {}
    return parsed.entries ?? {}
  } catch {
    return {}
  }
}

export function saveCache(realPath: string, lang: string, model: string, entries: Record<string, string>): void {
  const dir = cacheDir(realPath)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, `.${lang}.json.tmp`)
  const payload: CacheFile = { model, promptVersion: PROMPT_VERSION, entries }
  fs.writeFileSync(tmp, JSON.stringify(payload))
  fs.renameSync(tmp, cacheFile(realPath, lang))
}

export function clearCache(realPath: string, lang?: string): void {
  try {
    if (lang) fs.rmSync(cacheFile(realPath, lang), { force: true })
    else fs.rmSync(cacheDir(realPath), { recursive: true, force: true })
  } catch {
    /* best effort */
  }
}
