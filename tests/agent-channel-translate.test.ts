import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AssistRegistry } from '../src/server/assist/index'
import { SessionRegistry, type Conn } from '../src/server/sessions'
import { translateBlocks } from '../src/server/translate/index'
import { loadCache } from '../src/server/translate/cache'
import type { AssistRequestEvent } from '../src/shared/types'

let tmp: string
let file: string
let sessions: SessionRegistry
let assist: AssistRegistry

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-ac-'))
  file = path.join(tmp, 'plan.md')
  fs.writeFileSync(file, '# Plan\n')
  sessions = new SessionRegistry({ graceMs: 50_000, neverOpenedMs: 50_000 })
  assist = new AssistRegistry(sessions, 500)
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

/** Attach a fake agent that auto-answers translate requests via `transform`. */
function autoAgent(sessionId: string, transform: (text: string) => string): { calls: () => number; detach: () => void } {
  let calls = 0
  const conn: Conn = {
    role: 'cli',
    assistCapable: true,
    send: async (event, data) => {
      if (event !== 'assist-request') return
      const req = data as AssistRequestEvent
      if (req.kind !== 'translate') return
      calls++
      // answer on the next tick (mimics the agent's round-trip)
      queueMicrotask(() => {
        assist.resolve(req.id, { kind: 'translate', blocks: req.blocks.map((b) => ({ hash: b.hash, text: transform(b.text) })) })
      })
    },
    close: () => {},
  }
  sessions.attach(sessionId, conn)
  return { calls: () => calls, detach: () => sessions.detach(sessionId, conn) }
}

describe('agent-channel translation via translateBlocks', () => {
  it('routes misses through the agent and returns translations', async () => {
    const { session } = sessions.open(file)
    autoAgent(session.id, (t) => `「译」${t}`)
    const out = await translateBlocks(
      session,
      [
        { hash: 'h1', text: 'Hello' },
        { hash: 'h2', text: 'World' },
      ],
      'en',
      'zh-CN',
      assist,
    )
    expect(out.error).toBeUndefined()
    expect(out.results).toEqual([
      { hash: 'h1', text: '「译」Hello', cached: false },
      { hash: 'h2', text: '「译」World', cached: false },
    ])
  })

  it('preserves CriticMarkup validation (structure break → error:structure, not cached)', async () => {
    const { session } = sessions.open(file)
    // agent drops the insertion mark → structural mismatch
    autoAgent(session.id, (t) => t.replace(/\{\+\+.*?\+\+\}/g, 'naked'))
    const out = await translateBlocks(session, [{ hash: 'h1', text: 'Body {++added++} end' }], 'en', 'zh-CN', assist)
    expect(out.results).toEqual([{ hash: 'h1', error: 'structure', cached: false }])
    // structurally-broken results are never persisted
    expect(await loadCache(session.path, 'zh-CN')).toEqual({})
  })

  it('reports no-agent per-block AND top-level instead of throwing', async () => {
    const { session } = sessions.open(file)
    const out = await translateBlocks(session, [{ hash: 'h', text: 'x' }], 'en', 'zh-CN', assist)
    expect(out.error).toBe('no-agent')
    expect(out.results).toEqual([{ hash: 'h', error: 'no-agent', cached: false }])
  })

  it('persists translations to the on-disk cache and serves them with no agent once warm', async () => {
    const { session } = sessions.open(file)
    const agent = autoAgent(session.id, (t) => `「译」${t}`)
    const first = await translateBlocks(session, [{ hash: 'h1', text: 'Hello' }], 'en', 'zh-CN', assist)
    expect(first.results).toEqual([{ hash: 'h1', text: '「译」Hello', cached: false }])
    expect(agent.calls()).toBe(1)
    expect(await loadCache(session.path, 'zh-CN')).toEqual({ h1: '「译」Hello' })

    // agent walks away — the cached block still toggles, offline, without re-asking
    agent.detach()
    const second = await translateBlocks(session, [{ hash: 'h1', text: 'Hello' }], 'en', 'zh-CN', assist)
    expect(second.error).toBeUndefined()
    expect(second.results).toEqual([{ hash: 'h1', text: '「译」Hello', cached: true }])
    expect(agent.calls()).toBe(1)
  })

  it('returns cached blocks even when the agent is gone for the misses (graceful partial)', async () => {
    const { session } = sessions.open(file)
    const agent = autoAgent(session.id, (t) => `「译」${t}`)
    await translateBlocks(session, [{ hash: 'h1', text: 'Hello' }], 'en', 'zh-CN', assist) // warms h1
    agent.detach()
    const out = await translateBlocks(
      session,
      [
        { hash: 'h1', text: 'Hello' },
        { hash: 'h2', text: 'New' },
      ],
      'en',
      'zh-CN',
      assist,
    )
    expect(out.error).toBe('no-agent')
    expect(out.results).toEqual([
      { hash: 'h1', text: '「译」Hello', cached: true },
      { hash: 'h2', error: 'no-agent', cached: false },
    ])
  })

  it('caches per target language', async () => {
    const { session } = sessions.open(file)
    autoAgent(session.id, (t) => `[${t}]`)
    await translateBlocks(session, [{ hash: 'h1', text: 'Hello' }], 'en', 'zh-CN', assist)
    expect(await loadCache(session.path, 'zh-CN')).toEqual({ h1: '[Hello]' })
    expect(await loadCache(session.path, 'ja')).toEqual({})
  })

  it('empty block list short-circuits without bothering the agent', async () => {
    const { session } = sessions.open(file)
    // no agent attached, but empty list must still resolve
    expect(await translateBlocks(session, [], 'en', 'zh-CN', assist)).toEqual({ results: [] })
  })
})
