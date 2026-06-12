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
  /**
   * Bumped whenever the buffer changes from OUTSIDE the active editor
   * (load, accept/reject, disk reload) — editor components remount on it.
   * Editor-originated flushes do not bump it.
   */
  externalVersion: number
  /** The active editor has unflushed changes (dot indicator while typing). */
  editorDirty: boolean
  /** Registered by the active editor: flush pending edits into `source`. */
  flushEditor: (() => void) | null
  /** Undo stack for review operations applied outside the editors (cap 50). */
  history: string[]

  load(sessionId: string): Promise<void>
  undo(): void
  setSource(source: string): void
  /** Editor flush path — updates the buffer without remounting the editor. */
  setSourceFromEditor(source: string): void
  setEditorDirty(dirty: boolean): void
  registerFlusher(fn: (() => void) | null): void
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
  externalVersion: 0,
  editorDirty: false,
  flushEditor: null,
  history: [],

  async load(sessionId) {
    set({ sessionId, status: 'loading', error: null })
    try {
      const [meta, file] = await Promise.all([getSession(sessionId), getFile(sessionId)])
      const normalized = normalizeToLf(file.content)
      set((s) => ({
        meta,
        source: normalized,
        savedSource: normalized,
        eol: detectEol(file.content),
        mtimeMs: file.mtimeMs,
        status: 'ready',
        conflict: false,
        externalVersion: s.externalVersion + 1,
        editorDirty: false,
      }))
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
    set((s) => ({
      source,
      externalVersion: s.externalVersion + 1,
      history: [...s.history.slice(-49), s.source],
    }))
  },

  undo() {
    set((s) => {
      const prev = s.history.at(-1)
      if (prev === undefined) return s
      return { source: prev, history: s.history.slice(0, -1), externalVersion: s.externalVersion + 1 }
    })
  },

  setSourceFromEditor(source) {
    set({ source, editorDirty: false })
  },

  setEditorDirty(dirty) {
    if (get().editorDirty !== dirty) set({ editorDirty: dirty })
  },

  registerFlusher(fn) {
    set({ flushEditor: fn })
  },

  applyEdits(edits) {
    set((s) => ({
      source: applyTextEdits(s.source, edits),
      externalVersion: s.externalVersion + 1,
      history: [...s.history.slice(-49), s.source],
    }))
  },

  setMode(mode) {
    if (mode === get().mode) return
    get().flushEditor?.()
    set({ mode })
  },

  async save() {
    get().flushEditor?.()
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
    set((s) => ({
      source: normalized,
      savedSource: normalized,
      eol: detectEol(content),
      mtimeMs,
      conflict: false,
      externalVersion: s.externalVersion + 1,
      editorDirty: false,
    }))
  },
}))

export function useDirty(): boolean {
  return useDoc((s) => s.source !== s.savedSource || s.editorDirty)
}
