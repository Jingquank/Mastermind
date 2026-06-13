import { create } from 'zustand'
import { applyTextEdits } from '../../shared/edits'
import { detectEol, normalizeToLf, restoreEol, type Eol } from '../../shared/eol'
import type { ReviewCounts, SessionMeta, TextEdit } from '../../shared/types'
import {
  ApiError,
  getFile,
  getLatestSnapshot,
  getRounds,
  getSession,
  postHandback,
  postRename,
  putFile,
  type RoundInfo,
} from './api'

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
  /** The active editor has unflushed changes (dot indicator while typing). */
  editorDirty: boolean
  /** Registered by the active editor: flush pending edits into `source`. */
  flushEditor: (() => void) | null
  /** Undo stack for review operations applied outside the editors (cap 50). */
  history: string[]
  /** The file changed on disk under us (banner state). */
  diskChange: { mtimeMs: number; deleted: boolean } | null
  /** Toast after a successful hand-back (counts, localized at render). */
  handedBack: ReviewCounts | null
  /** Revision diff view open? */
  diffOpen: boolean
  /** When the diff is opened from a specific round, its snapshot id (null = latest). */
  diffLeftSnapshotId: string | null
  /** Offer "show what changed" after a reload when a snapshot exists. */
  diffOffer: boolean
  /** Review-rounds timeline. */
  rounds: RoundInfo[]
  roundsOpen: boolean
  /** One-shot flag: pulse the agent chip right after a local hand-back. */
  handbackPulse: boolean

  load(sessionId: string): Promise<void>
  loadRounds(): Promise<void>
  setRoundsOpen(open: boolean): void
  openRoundDiff(snapshotId: string): void
  undo(): void
  notifyDiskChange(mtimeMs: number, deleted?: boolean): void
  dismissDiskChange(): void
  /** Discard the buffer and adopt the on-disk content. */
  reloadFromDisk(): Promise<void>
  /** PUT without the mtime guard (the "Save anyway" path). */
  saveForce(): Promise<void>
  handback(): Promise<boolean>
  clearHandedBack(): void
  setNotice(notice: DocStore['notice']): void
  setDiffOpen(open: boolean): void
  dismissDiffOffer(): void
  /** Draft naming: first save prompts for a filename. */
  renamePrompt: boolean
  renameError: string | null
  cancelRename(): void
  completeRename(filename: string): Promise<void>
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
  savingKind: null,
  notice: null,
  externalVersion: 0,
  editorDirty: false,
  flushEditor: null,
  history: [],
  diskChange: null,
  handedBack: null,
  diffOpen: false,
  diffLeftSnapshotId: null,
  diffOffer: false,
  rounds: [],
  roundsOpen: false,
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
        editorDirty: false,
        // new drafts open straight into WYSIWYG
        mode: meta.isDraft ? 'editing' : s.mode,
      }))
      document.title = `${meta.displayName} — Mastermind`
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
    const s = get()
    if (s.diffOpen) set({ diffOpen: false })
    if (mode === s.mode) return
    s.flushEditor?.()
    set({ mode })
  },

  async save() {
    get().flushEditor?.()
    const { sessionId, source, savedSource, eol, mtimeMs, saving, meta } = get()
    if (!sessionId || saving) return false
    if (meta?.isDraft) {
      set({ renamePrompt: true })
      return false
    }
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
      // a failed save must never be silent — the file is the protocol
      set({ notice: { kind: 'error', msg: 'saveFailed' } })
      return false
    } finally {
      set({ saving: false, savingKind: null })
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
    // spec: after reload, offer the revision diff when a snapshot exists
    try {
      await getLatestSnapshot(sessionId)
      set({ diffOffer: true })
    } catch {
      set({ diffOffer: false })
    }
  },

  setDiffOpen(open) {
    set({
      diffOpen: open,
      diffOffer: open ? false : get().diffOffer,
      diffLeftSnapshotId: open ? get().diffLeftSnapshotId : null, // reset to latest on close
    })
  },

  dismissDiffOffer() {
    set({ diffOffer: false })
  },

  async saveForce() {
    const { sessionId, eol } = get()
    if (!sessionId) return
    get().flushEditor?.()
    const current = get().source
    const res = await putFile(sessionId, restoreEol(current, eol), undefined)
    set({ savedSource: current, mtimeMs: res.mtimeMs, conflict: false, diskChange: null })
  },

  async handback() {
    get().flushEditor?.()
    const { sessionId, source, eol, mtimeMs, saving, meta } = get()
    if (!sessionId || saving) return false
    if (meta?.isDraft) {
      set({ renamePrompt: true })
      return false
    }
    set({ saving: true, savingKind: 'handback', notice: null })
    try {
      const res = await postHandback(sessionId, restoreEol(source, eol), mtimeMs)
      // the server appended/refreshed the summary block — adopt its content
      const file = await getFile(sessionId)
      get().adoptDiskContent(file.content, file.mtimeMs)
      set({ handedBack: res.counts, handbackPulse: true })
      void get().loadRounds() // a new round just landed — refresh the timeline
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

  async loadRounds() {
    const { sessionId } = get()
    if (!sessionId) return
    try {
      set({ rounds: await getRounds(sessionId) })
    } catch {
      /* no snapshots yet, or daemon hiccup */
    }
  },

  setRoundsOpen(open) {
    if (open) void get().loadRounds()
    set({ roundsOpen: open })
  },

  openRoundDiff(snapshotId) {
    set({ diffLeftSnapshotId: snapshotId, diffOpen: true, roundsOpen: false })
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
      document.title = `${res.displayName} — Mastermind`
      await get().save()
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
  return useDoc((s) => s.source !== s.savedSource || s.editorDirty)
}
