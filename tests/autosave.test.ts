import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionMeta } from '../src/shared/types'

// Mock the HTTP client before importing the store. The autosave paths under test
// touch no DOM, so this runs in the default node env with fake timers.
vi.mock('../src/ui/app/api', () => {
  class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
      public data?: unknown,
    ) {
      super(message)
    }
  }
  return {
    ApiError,
    putFile: vi.fn(),
    getFile: vi.fn(),
    getSession: vi.fn(),
    postHandback: vi.fn(),
    postRename: vi.fn(),
  }
})

import { ApiError, getFile, postHandback, putFile } from '../src/ui/app/api'
import { useDoc } from '../src/ui/app/store'

const AUTOSAVE_MS = 600

function seed(over: Partial<ReturnType<typeof useDoc.getState>> = {}): void {
  useDoc.setState({
    sessionId: 's1',
    source: 'hello',
    savedSource: 'hello',
    eol: 'lf',
    mtimeMs: 100,
    saving: false,
    savingKind: null,
    conflict: false,
    renamePrompt: false,
    notice: null,
    history: [],
    externalVersion: 0,
    flushEditor: null,
    meta: { isDraft: false, displayName: 'f.md', path: '/f.md' } as unknown as SessionMeta,
    ...over,
  })
}

describe('autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(putFile).mockReset().mockResolvedValue({ mtimeMs: 200 })
    vi.mocked(getFile).mockReset()
    vi.mocked(postHandback).mockReset()
    seed()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces an edit into a single disk write after the idle delay', async () => {
    useDoc.getState().setSource('hello world')
    expect(putFile).not.toHaveBeenCalled() // still within the debounce window

    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS)
    expect(putFile).toHaveBeenCalledTimes(1)
    expect(putFile).toHaveBeenCalledWith('s1', 'hello world', 100)
    expect(useDoc.getState().savedSource).toBe('hello world')
  })

  it('coalesces a burst of edits into one write of the latest text', async () => {
    useDoc.getState().setSource('a')
    useDoc.getState().setSource('ab')
    useDoc.getState().setSource('abc')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS)

    expect(putFile).toHaveBeenCalledTimes(1)
    expect(putFile).toHaveBeenCalledWith('s1', 'abc', 100)
  })

  it('restores the original EOL on the wire', async () => {
    seed({ eol: 'crlf', source: 'a\nb', savedSource: 'a\nb' })
    useDoc.getState().setSource('a\nb\nc')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS)
    expect(putFile).toHaveBeenCalledWith('s1', 'a\r\nb\r\nc', 100)
  })

  it('an unnamed draft prompts for a filename instead of writing', async () => {
    seed({ meta: { isDraft: true, displayName: 'Untitled' } as unknown as SessionMeta })
    useDoc.getState().setSource('first keystroke')
    expect(useDoc.getState().renamePrompt).toBe(true)

    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS)
    expect(putFile).not.toHaveBeenCalled()
  })

  it('does not schedule writes while a disk conflict is unresolved', async () => {
    seed({ conflict: true })
    useDoc.getState().setSource('edit during conflict')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS)
    expect(putFile).not.toHaveBeenCalled()
  })

  it('hand back cancels a pending autosave so no stale PUT clobbers the summary', async () => {
    vi.mocked(postHandback).mockResolvedValue({
      mtimeMs: 300,
      counts: { comments: 0, edits: 0, highlights: 0 },
      summaryLine: 'mastermind: review complete — no marks',
    } as never)
    vi.mocked(getFile).mockResolvedValue({ content: 'hello world\n', mtimeMs: 300 } as never)

    useDoc.getState().setSource('hello world') // queues an autosave
    await useDoc.getState().handback() // must clear that timer
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS)

    expect(putFile).not.toHaveBeenCalled()
    expect(postHandback).toHaveBeenCalledTimes(1)
  })

  it('a failed write is never silent — it raises the saveFailed notice', async () => {
    vi.mocked(putFile).mockRejectedValue(new Error('network down'))
    useDoc.getState().setSource('doomed edit')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS)

    expect(useDoc.getState().notice).toEqual({ kind: 'error', msg: 'saveFailed' })
  })

  it('a 409 raises the conflict flag instead of a generic error', async () => {
    vi.mocked(putFile).mockRejectedValue(new ApiError(409, 'file changed on disk'))
    useDoc.getState().setSource('racing edit')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS)

    expect(useDoc.getState().conflict).toBe(true)
    expect(useDoc.getState().notice).toBeNull()
  })

  it('adopts server-rewritten bytes when the feedback-language rule changes them', async () => {
    vi.mocked(putFile).mockResolvedValue({ mtimeMs: 250, content: 'REWRITTEN\n' } as never)
    useDoc.getState().setSource('hello world')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS)

    expect(useDoc.getState().source).toBe('REWRITTEN\n')
    expect(useDoc.getState().savedSource).toBe('REWRITTEN\n')
  })
})
