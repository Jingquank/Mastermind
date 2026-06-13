import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AssistError, AssistRegistry } from '../src/server/assist/index'
import { SessionRegistry, type Conn } from '../src/server/sessions'
import { translateBlocks } from '../src/server/translate/index'
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
function autoAgent(sessionId: string, transform: (text: string) => string): void {
  const conn: Conn = {
    role: 'cli',
    assistCapable: true,
    send: async (event, data) => {
      if (event !== 'assist-request') return
      const req = data as AssistRequestEvent
      if (req.kind !== 'translate') return
      // answer on the next tick (mimics the agent's round-trip)
      queueMicrotask(() => {
        assist.resolve(req.id, { kind: 'translate', blocks: req.blocks.map((b) => ({ hash: b.hash, text: transform(b.text) })) })
      })
    },
    close: () => {},
  }
  sessions.attach(sessionId, conn)
}

describe('agent-channel translation via translateBlocks (V3)', () => {
  it('routes the whole batch through the agent and returns translations', async () => {
    const { session } = sessions.open(file)
    autoAgent(session.id, (t) => `「译」${t}`)
    const results = await translateBlocks(
      session,
      [
        { hash: 'h1', text: 'Hello' },
        { hash: 'h2', text: 'World' },
      ],
      'en',
      'zh-CN',
      assist,
    )
    expect(results).toEqual([
      { hash: 'h1', text: '「译」Hello', cached: false },
      { hash: 'h2', text: '「译」World', cached: false },
    ])
  })

  it('preserves CriticMarkup validation (structure break → error:structure)', async () => {
    const { session } = sessions.open(file)
    // agent drops the insertion mark → structural mismatch
    autoAgent(session.id, (t) => t.replace(/\{\+\+.*?\+\+\}/g, 'naked'))
    const [res] = await translateBlocks(
      session,
      [{ hash: 'h1', text: 'Body {++added++} end' }],
      'en',
      'zh-CN',
      assist,
    )
    expect(res).toEqual({ hash: 'h1', error: 'structure', cached: false })
  })

  it('rejects with no-agent when no assist listener is attached', async () => {
    const { session } = sessions.open(file)
    await expect(
      translateBlocks(session, [{ hash: 'h', text: 'x' }], 'en', 'zh-CN', assist),
    ).rejects.toBeInstanceOf(AssistError)
  })

  it('does NOT write the on-disk translation cache (session-scoped only)', async () => {
    const { session } = sessions.open(file)
    autoAgent(session.id, (t) => t)
    await translateBlocks(session, [{ hash: 'h', text: 'x' }], 'en', 'zh-CN', assist)
    const cacheDir = path.join(tmp, '.mastermind', 'translations')
    expect(fs.existsSync(cacheDir)).toBe(false)
  })

  it('empty block list short-circuits without bothering the agent', async () => {
    const { session } = sessions.open(file)
    // no agent attached, but empty list must still resolve
    await expect(translateBlocks(session, [], 'en', 'zh-CN', assist)).resolves.toEqual([])
  })
})
