import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistError, AssistRegistry } from '../src/server/assist/index'
import { SessionRegistry, type Conn } from '../src/server/sessions'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Unit-level harness: a real SessionRegistry + AssistRegistry, with a fake
 * agent = a recording cli Conn flagged assistCapable. Exercises enqueue →
 * assist-request → resolve/fail/timeout/cancel without spinning a daemon.
 */
let tmp: string
let file: string
let sessions: SessionRegistry
let assist: AssistRegistry

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-assist-'))
  file = path.join(tmp, 'plan.md')
  fs.writeFileSync(file, '# Plan\n')
  sessions = new SessionRegistry({ graceMs: 50_000, neverOpenedMs: 50_000 })
  assist = new AssistRegistry(sessions, 200) // short timeout for the timeout test
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

interface FakeAgent {
  conn: Conn
  requests: { event: string; data: unknown }[]
}

/** A minimal translate request — the only assist task kind. */
function translateReq(text = 'x') {
  return { kind: 'translate' as const, sourceLang: 'en', targetLang: 'zh-CN', blocks: [{ hash: 'h', text }] }
}

function attachFakeAgent(sessionId: string, assistCapable = true): FakeAgent {
  const requests: { event: string; data: unknown }[] = []
  const conn: Conn = {
    role: 'cli',
    assistCapable,
    send: async (event, data) => {
      requests.push({ event, data })
    },
    close: () => {},
  }
  sessions.attach(sessionId, conn)
  return { conn, requests }
}

describe('AssistRegistry', () => {
  it('enqueue broadcasts assist-request and resolves on result', async () => {
    const { session } = sessions.open(file)
    const agent = attachFakeAgent(session.id)

    const promise = assist.enqueue(session, {
      kind: 'translate',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      blocks: [{ hash: 'h1', text: 'Hello' }],
    })

    // the agent received exactly one assist-request with an id
    const req = agent.requests.find((r) => r.event === 'assist-request')
    expect(req).toBeTruthy()
    const id = (req!.data as { id: string }).id
    expect(id).toBeTruthy()
    expect(session.pendingAssist.has(id)).toBe(true)

    expect(assist.resolve(id, { kind: 'translate', blocks: [{ hash: 'h1', text: '你好' }] })).toBe(true)
    await expect(promise).resolves.toEqual({ kind: 'translate', blocks: [{ hash: 'h1', text: '你好' }] })
    expect(session.pendingAssist.size).toBe(0)
  })

  it('rejects immediately with no-agent when no assist-capable listener', async () => {
    const { session } = sessions.open(file)
    attachFakeAgent(session.id, false) // a plain --wait waiter, NOT assist-capable
    await expect(assist.enqueue(session, translateReq())).rejects.toMatchObject({
      code: 'no-agent',
    })
  })

  it('times out when the agent never answers', async () => {
    vi.useFakeTimers()
    const { session } = sessions.open(file)
    attachFakeAgent(session.id)
    const promise = assist.enqueue(session, translateReq())
    const assertion = expect(promise).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(250)
    await assertion
    expect(session.pendingAssist.size).toBe(0)
    vi.useRealTimers()
  })

  it('fail() rejects with agent-error', async () => {
    const { session } = sessions.open(file)
    const agent = attachFakeAgent(session.id)
    const promise = assist.enqueue(session, translateReq())
    const id = (agent.requests[0]!.data as { id: string }).id
    expect(assist.fail(id, 'cannot')).toBe(true)
    await expect(promise).rejects.toMatchObject({ code: 'agent-error' })
  })

  it('cancelForSession rejects all pending (close path)', async () => {
    const { session } = sessions.open(file)
    attachFakeAgent(session.id)
    const p1 = assist.enqueue(session, translateReq('a'))
    const p2 = assist.enqueue(session, translateReq('b'))
    assist.cancelForSession(session.id)
    await expect(p1).rejects.toMatchObject({ code: 'cancelled' })
    await expect(p2).rejects.toMatchObject({ code: 'cancelled' })
  })

  it('resolve on an unknown/expired id is a no-op false (dup-safe)', () => {
    expect(assist.resolve('nope', { kind: 'translate', blocks: [] })).toBe(false)
    expect(assist.fail('nope', 'x')).toBe(false)
  })

  it('pendingFor lists open requests for catch-up', async () => {
    const { session } = sessions.open(file)
    attachFakeAgent(session.id)
    void assist.enqueue(session, { kind: 'translate', sourceLang: 'en', targetLang: 'zh-CN', blocks: [{ hash: 'h', text: 't' }] })
    const open = assist.pendingFor(session.id)
    expect(open).toHaveLength(1)
    expect(open[0]!.kind).toBe('translate')
  })

  it('emits assist-availability to ui when an assist agent attaches/detaches', () => {
    const { session } = sessions.open(file)
    const uiEvents: string[] = []
    const ui: Conn = { role: 'ui', send: async (e) => void uiEvents.push(e), close: () => {} }
    sessions.attach(session.id, ui)
    const agent = attachFakeAgent(session.id)
    expect(uiEvents).toContain('assist-availability')
    expect(assist.hasListener(session)).toBe(true)
    sessions.detach(session.id, agent.conn)
    expect(assist.hasListener(session)).toBe(false)
  })

  it('AssistError carries a code', () => {
    expect(new AssistError('timeout').code).toBe('timeout')
    expect(new AssistError('agent-error', 'detail').message).toContain('detail')
  })
})
