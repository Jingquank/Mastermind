import { create } from 'zustand'
import { segmentBlocks } from '../../shared/blocks'
import { pickTarget, previewTargetLang } from '../../shared/translate-direction'

// re-exported so existing importers (SessionView) keep their translationStore import
export { previewTargetLang }

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
  /** Warm the cache + map in the background (no UI flip) so a later toggle is instant. */
  prefetch(sessionId: string, source: string, langPair: { a: string; b: string }): Promise<void>
  deactivate(): void
  reset(): void
}

// in-flight prefetches keyed by `${sessionId}|${targetLang}`, so a re-fired
// effect or a second tab doesn't launch duplicate background warm-ups.
const prefetchInFlight = new Set<string>()

// pickTarget / previewTargetLang now live in ../../shared/translate-direction (imported above).

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
    // 200 may still carry an `error` code: cached blocks came back, but some
    // misses needed a live agent. Record translated blocks; surface the code.
    const json = (await res.json()) as TranslateResponse & { error?: string }
    if (json.error) error = json.error
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
      const merged = { ...get().map, ...map }
      if (Object.keys(merged).length === 0) {
        // nothing to show (no cache, agent absent) — surface the reason, don't blank the view
        const { useDoc } = await import('../app/store')
        useDoc.getState().setNotice({ kind: 'error', msg: error === 'no-agent' ? 'translateNoAgent' : 'translateFailed' })
        return
      }
      set({ active: true, map: merged, failed })
      // partial: cached blocks rendered, but some need a live agent to finish
      if (error === 'no-agent' && Object.keys(failed).length > 0) {
        const { useDoc } = await import('../app/store')
        useDoc.getState().setNotice({ kind: 'ok', msg: 'translatePartialNoAgent' })
      }
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

  async prefetch(sessionId, source, langPair) {
    const { sourceLang, targetLang } = pickTarget(source, langPair)
    const key = `${sessionId}|${targetLang}`
    if (prefetchInFlight.has(key)) return
    prefetchInFlight.add(key)
    try {
      // background warm-up: no `loading` flip (it must not block or spin the button)
      const { map, failed } = await fetchTranslations(sessionId, source, sourceLang, targetLang, get().map)
      if (Object.keys(map).length > 0) {
        set((s) => ({ targetLang, map: { ...s.map, ...map }, failed: { ...s.failed, ...failed } }))
      }
    } finally {
      prefetchInFlight.delete(key)
    }
  },

  deactivate() {
    set({ active: false })
  },

  reset() {
    set({ active: false, loading: false, targetLang: null, map: {}, failed: {} })
  },
}))
