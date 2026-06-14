import { create } from 'zustand'
import { applyTextEdits } from '../../shared/edits'
import { detectEol, normalizeToLf, restoreEol, type Eol } from '../../shared/eol'
import type { ReviewCounts, SessionMeta, TextEdit } from '../../shared/types'
import {
  ApiError,
  getFile,
  getSession,
  postHandback,
  postRename,
  putFile,
} from './api'

export type ViewMode = 'reading' | 'source'

/** Idle delay before the buffer is flushed to disk. The file is the single
 *  source of truth, so every edit lands automatically — no manual save. */
const AUTOSAVE_MS = 600
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
function clearAutosave(): void {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
    autosaveTimer = null
  }
}

/** Reflect the open document in the tab title — a no-op outside a browser (tests). */
function setTabTitle(name: string): void {
  const g = globalThis as { document?: { title: string } }
  if (g.document) g.document.title = `${name} — Mastermind`
}

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
  /** Which write is in flight — drives button labels. */
  savingKind: 'save' | 'handback' | null
  /** Transient toast: i18n key + optional count; kind picks the style. */
  notice: { kind: 'error' | 'ok'; msg: string; count?: number } | null
  /**
   * Bumped whenever the buffer changes from OUTSIDE the active editor
   * (load, accept/reject, disk reload) — editor components remount on it.
   * Editor-originated flushes do not bump it.
   */
  externalVersion: number
  /** Registered by the active editor: flush pending edits into `source`. */
  flushEditor: (() => void) | null
  /** Registered by the Source editor: scroll to an outline heading. */
  scroller: ((offset: number, index: number) => void) | null
  /** Undo stack for review operations applied outside the editors (cap 50). */
  history: string[]
  /** The file changed on disk under us (banner state). */
  diskChange: { mtimeMs: number; deleted: boolean } | null
  /** Toast after a successful hand-back (counts, localized at render). */
  handedBack: ReviewCounts | null
  /** One-shot flag: pulse the agent chip right after a local hand-back. */
  handbackPulse: boolean

  load(sessionId: string): Promise<void>
  undo(): void
  notifyDiskChange(mtimeMs: number, deleted?: boolean): void
  dismissDiskChange(): void
  /** Discard the buffer and adopt the on-disk content. */
  reloadFromDisk(): Promise<void>
  /** PUT without the mtime guard (the "Save anyway" path). */
  saveForce(): Promise<void>
  /** Hand the document back to the waiting agent; an optional note is woven into the summary block. */
  handback(note?: string): Promise<boolean>
  clearHandedBack(): void
  setNotice(notice: DocStore['notice']): void
  /** Draft naming: first save prompts for a filename. */
  renamePrompt: boolean
  renameError: string | null
  cancelRename(): void
  completeRename(filename: string): Promise<void>
  setSource(source: string): void
  /** Editor flush path — updates the buffer without remounting the editor. */
  setSourceFromEditor(source: string): void
  registerFlusher(fn: (() => void) | null): void
  registerScroller(fn: DocStore['scroller']): void
  applyEdits(edits: TextEdit[]): void
  setMode(mode: ViewMode): void
  /** Debounced disk write triggered by every buffer edit (drafts prompt for a name first). */
  queueAutosave(): void
  /** Flush the buffer to disk now (debounced via queueAutosave; also the rename follow-up). */
  autosave(): Promise<boolean>
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
  savingKind: null,
  notice: null,
  externalVersion: 0,
  flushEditor: null,
  scroller: null,
  history: [],
  diskChange: null,
  handedBack: null,
  handbackPulse: false,
  renamePrompt: false,
  renameError: null,

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
        // an empty draft has nothing to read — open it in the source editor
        mode: meta.isDraft ? 'source' : s.mode,
      }))
      clearAutosave()
      setTabTitle(meta.displayName)
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 404
          ? '__session-not-found__'
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
    get().queueAutosave()
  },

  undo() {
    set((s) => {
      const prev = s.history.at(-1)
      if (prev === undefined) return s
      return { source: prev, history: s.history.slice(0, -1), externalVersion: s.externalVersion + 1 }
    })
    get().queueAutosave()
  },

  setSourceFromEditor(source) {
    if (source === get().source) return
    set({ source })
    get().queueAutosave()
  },

  registerFlusher(fn) {
    set({ flushEditor: fn })
  },

  registerScroller(fn) {
    set({ scroller: fn })
  },

  applyEdits(edits) {
    set((s) => ({
      source: applyTextEdits(s.source, edits),
      externalVersion: s.externalVersion + 1,
      history: [...s.history.slice(-49), s.source],
    }))
    get().queueAutosave()
  },

  setMode(mode) {
    const s = get()
    if (mode === s.mode) return
    s.flushEditor?.()
    set({ mode })
  },

  queueAutosave() {
    const { meta, renamePrompt, conflict } = get()
    // An unnamed draft has no path to write to — ask for a filename on first edit.
    // Once named, completeRename writes and subsequent edits autosave normally.
    if (meta?.isDraft) {
      if (!renamePrompt) set({ renamePrompt: true })
      return
    }
    // Don't bury the conflict banner under retry churn — the user resolves it.
    if (conflict) return
    clearAutosave()
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null
      void get().autosave()
    }, AUTOSAVE_MS)
  },

  async autosave() {
    clearAutosave()
    get().flushEditor?.()
    const { sessionId, source, savedSource, eol, mtimeMs, saving, meta } = get()
    if (!sessionId || saving || meta?.isDraft) return false
    if (source === savedSource) return true
    set({ saving: true, savingKind: 'save', notice: null })
    try {
      const res = (await putFile(sessionId, restoreEol(source, eol), mtimeMs)) as {
        mtimeMs: number
        content?: string
      }
      if (res.content !== undefined) {
        // the feedback-language rule rewrote comments — adopt the saved bytes
        get().adoptDiskContent(res.content, res.mtimeMs)
      } else {
        set({ savedSource: source, mtimeMs: res.mtimeMs, conflict: false })
      }
      return true
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        set({ conflict: true })
        return false
      }
      // a failed write must never be silent — the file is the protocol
      set({ notice: { kind: 'error', msg: 'saveFailed' } })
      return false
    } finally {
      set({ saving: false, savingKind: null })
    }
  },

  adoptDiskContent(content, mtimeMs) {
    clearAutosave()
    const normalized = normalizeToLf(content)
    set((s) => ({
      source: normalized,
      savedSource: normalized,
      eol: detectEol(content),
      mtimeMs,
      conflict: false,
      externalVersion: s.externalVersion + 1,
      diskChange: null,
      // reload must be undoable: keep the discarded buffer on the stack
      history: normalized === s.source ? s.history : [...s.history.slice(-49), s.source],
    }))
  },

  setNotice(notice) {
    set({ notice })
  },

  notifyDiskChange(mtimeMs, deleted = false) {
    set({ diskChange: { mtimeMs, deleted } })
  },

  dismissDiskChange() {
    set({ diskChange: null })
  },

  async reloadFromDisk() {
    const { sessionId } = get()
    if (!sessionId) return
    const file = await getFile(sessionId)
    get().adoptDiskContent(file.content, file.mtimeMs)
  },

  async saveForce() {
    clearAutosave()
    const { sessionId, eol } = get()
    if (!sessionId) return
    get().flushEditor?.()
    const current = get().source
    const res = await putFile(sessionId, restoreEol(current, eol), undefined)
    set({ savedSource: current, mtimeMs: res.mtimeMs, conflict: false, diskChange: null })
  },

  async handback(note?: string) {
    // Cancel any pending autosave so its stale PUT can't land after handback and
    // clobber the summary block the server is about to write.
    clearAutosave()
    get().flushEditor?.()
    const { sessionId, source, eol, mtimeMs, saving, meta } = get()
    if (!sessionId || saving) return false
    if (meta?.isDraft) {
      set({ renamePrompt: true })
      return false
    }
    set({ saving: true, savingKind: 'handback', notice: null })
    try {
      const res = await postHandback(sessionId, restoreEol(source, eol), mtimeMs, note)
      // the server appended/refreshed the summary block — adopt its content
      const file = await getFile(sessionId)
      get().adoptDiskContent(file.content, file.mtimeMs)
      set({ handedBack: res.counts, handbackPulse: true })
      return true
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        set({ conflict: true })
        return false
      }
      set({ notice: { kind: 'error', msg: 'handbackFailed' } })
      return false
    } finally {
      set({ saving: false, savingKind: null })
    }
  },

  clearHandedBack() {
    set({ handedBack: null, handbackPulse: false })
  },

  cancelRename() {
    set({ renamePrompt: false, renameError: null })
  },

  async completeRename(filename) {
    const { sessionId, meta } = get()
    if (!sessionId || !meta) return
    try {
      const res = await postRename(sessionId, filename)
      set({
        meta: { ...meta, isDraft: false, path: res.path, displayName: res.displayName },
        renamePrompt: false,
        renameError: null,
      })
      setTabTitle(res.displayName)
      await get().autosave()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        set({ renameError: '__exists__' })
      } else {
        set({ renameError: err instanceof Error ? err.message : String(err) })
      }
    }
  },
}))

export function useDirty(): boolean {
  return useDoc((s) => s.source !== s.savedSource)
}
