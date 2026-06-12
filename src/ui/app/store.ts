import { create } from 'zustand'
import { applyTextEdits } from '../../shared/edits'
import { detectEol, normalizeToLf, restoreEol, type Eol } from '../../shared/eol'
import type { SessionMeta, TextEdit } from '../../shared/types'
import { ApiError, getFile, getSession, putFile } from './api'

export type ViewMode = 'reading' | 'editing' | 'source'

export interface DocStore {
  sessionId: string | null
  meta: SessionMeta | null
  /** Canonical buffer — LF-normalized. All three modes are views over this string. */
  source: string
  savedSource: string
  eol: Eol
  mtimeMs: number
  mode: ViewMode
  status: 'loading' | 'ready' | 'error'
  error: string | null
  conflict: boolean
  saving: boolean

  load(sessionId: string): Promise<void>
  setSource(source: string): void
  applyEdits(edits: TextEdit[]): void
  setMode(mode: ViewMode): void
  save(): Promise<boolean>
  /** Replace buffer + saved state from disk content (reload after external change). */
  adoptDiskContent(content: string, mtimeMs: number): void
}

export const useDoc = create<DocStore>((set, get) => ({
  sessionId: null,
  meta: null,
  source: '',
  savedSource: '',
  eol: 'lf',
  mtimeMs: 0,
  mode: 'reading',
  status: 'loading',
  error: null,
  conflict: false,
  saving: false,

  async load(sessionId) {
    set({ sessionId, status: 'loading', error: null })
    try {
      const [meta, file] = await Promise.all([getSession(sessionId), getFile(sessionId)])
      const normalized = normalizeToLf(file.content)
      set({
        meta,
        source: normalized,
        savedSource: normalized,
        eol: detectEol(file.content),
        mtimeMs: file.mtimeMs,
        status: 'ready',
        conflict: false,
      })
      document.title = `${meta.displayName} — Mastermind`
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 404
          ? 'Session not found — it may have expired. Run `mastermind open <file>` again.'
          : err instanceof Error
            ? err.message
            : String(err)
      set({ status: 'error', error: message })
    }
  },

  setSource(source) {
    set({ source })
  },

  applyEdits(edits) {
    set({ source: applyTextEdits(get().source, edits) })
  },

  setMode(mode) {
    set({ mode })
  },

  async save() {
    const { sessionId, source, savedSource, eol, mtimeMs, saving } = get()
    if (!sessionId || saving) return false
    if (source === savedSource) return true
    set({ saving: true })
    try {
      const res = await putFile(sessionId, restoreEol(source, eol), mtimeMs)
      set({ savedSource: source, mtimeMs: res.mtimeMs, conflict: false })
      return true
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        set({ conflict: true })
        return false
      }
      throw err
    } finally {
      set({ saving: false })
    }
  },

  adoptDiskContent(content, mtimeMs) {
    const normalized = normalizeToLf(content)
    set({ source: normalized, savedSource: normalized, eol: detectEol(content), mtimeMs, conflict: false })
  },
}))

export function useDirty(): boolean {
  return useDoc((s) => s.source !== s.savedSource)
}
