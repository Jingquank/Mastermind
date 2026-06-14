import { create } from 'zustand'
import { detectDocScript, segmentBlocks } from '../../shared/blocks'
import { isCjkLang } from '../../shared/languages'

interface TranslateResponse {
  results: Array<{ hash: string; text?: string; error?: string; cached: boolean }>
}

interface TransState {
  active: boolean
  loading: boolean
  targetLang: string | null
  map: Record<string, string>
  failed: Record<string, true>
  toggle(sessionId: string, source: string, langPair: { a: string; b: string }): Promise<void>
  /** Fetch translations for blocks not yet in the map (after comment edits). */
  ensure(sessionId: string, source: string): Promise<void>
  deactivate(): void
  reset(): void
}

export function previewTargetLang(source: string, pair: { a: string; b: string }): string {
  return pickTarget(source, pair).targetLang
}

function pickTarget(source: string, pair: { a: string; b: string }): { sourceLang: string; targetLang: string } {
  const docIsCjk = detectDocScript(source) === 'cjk'
  const aIsCjk = isCjkLang(pair.a)
  if (docIsCjk) {
    return aIsCjk ? { sourceLang: pair.a, targetLang: pair.b } : { sourceLang: pair.b, targetLang: pair.a }
  }
  return aIsCjk ? { sourceLang: pair.b, targetLang: pair.a } : { sourceLang: pair.a, targetLang: pair.b }
}

async function fetchTranslations(
  sessionId: string,
  source: string,
  sourceLang: string,
  targetLang: string,
  known: Record<string, string>,
): Promise<{ map: Record<string, string>; failed: Record<string, true>; error?: string }> {
  const blocks = await segmentBlocks(source)
  const misses = blocks.filter((b) => b.translatable && known[b.hash] === undefined)
  const map: Record<string, string> = {}
  const failed: Record<string, true> = {}
  let error: string | undefined
  for (let i = 0; i < misses.length; i += 20) {
    const chunk = misses.slice(i, i + 20)
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        sourceLang,
        targetLang,
        blocks: chunk.map((b) => ({ hash: b.hash, text: b.text })),
      }),
    })
    if (!res.ok) {
      for (const b of chunk) failed[b.hash] = true
      try {
        error = ((await res.json()) as { error?: string }).error ?? `http-${res.status}`
      } catch {
        error = `http-${res.status}`
      }
      continue
    }
    const json = (await res.json()) as TranslateResponse
    for (const r of json.results) {
      if (r.text !== undefined) map[r.hash] = r.text
      else failed[r.hash] = true
    }
  }
  return { map, failed, error }
}

export const useTranslation = create<TransState>((set, get) => ({
  active: false,
  loading: false,
  targetLang: null,
  map: {},
  failed: {},

  async toggle(sessionId, source, langPair) {
    if (get().active) {
      set({ active: false })
      return
    }
    const { sourceLang, targetLang } = pickTarget(source, langPair)
    set({ loading: true, targetLang })
    try {
      const { map, failed, error } = await fetchTranslations(sessionId, source, sourceLang, targetLang, get().map)
      if (Object.keys(map).length === 0 && error) {
        // nothing came back — surface the reason instead of a silently blank translated view
        const { useDoc } = await import('../app/store')
        useDoc.getState().setNotice({ kind: 'error', msg: error === 'no-agent' ? 'translateNoAgent' : 'translateFailed' })
        return
      }
      set((s) => ({ active: true, map: { ...s.map, ...map }, failed }))
    } finally {
      set({ loading: false })
    }
  },

  async ensure(sessionId, source) {
    const { targetLang, loading, active } = get()
    if (!targetLang || loading || !active) return
    set({ loading: true })
    try {
      const { map, failed } = await fetchTranslations(sessionId, source, 'the document language', targetLang, get().map)
      set((s) => ({ map: { ...s.map, ...map }, failed: { ...s.failed, ...failed } }))
    } finally {
      set({ loading: false })
    }
  },

  deactivate() {
    set({ active: false })
  },

  reset() {
    set({ active: false, loading: false, targetLang: null, map: {}, failed: {} })
  },
}))
