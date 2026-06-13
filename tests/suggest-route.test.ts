import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createApp } from '../src/server/app'
import { AssistRegistry } from '../src/server/assist/index'
import { SessionRegistry, type Conn } from '../src/server/sessions'
import type { AssistRequestEvent } from '../src/shared/types'

let tmp: string
let file: string
let sessions: SessionRegistry
let assist: AssistRegistry
let app: ReturnType<typeof createApp>

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-suggest-'))
  file = path.join(tmp, 'plan.md')
  fs.writeFileSync(file, '# Plan\n')
  process.env.MASTERMIND_CONFIG_DIR = path.join(tmp, 'cfg')
  sessions = new SessionRegistry({ graceMs: 50_000, neverOpenedMs: 50_000 })
  assist = new AssistRegistry(sessions, 1000)
  app = createApp({
    registry: sessions,
    assist,
    version: 'test',
    startedAt: 0,
    requestShutdown: () => {},
    touch: () => {},
  })
})

afterEach(() => {
  delete process.env.MASTERMIND_CONFIG_DIR
  fs.rmSync(tmp, { recursive: true, force: true })
})

/** Fake agent: records assist-requests, lets the test answer them. */
function fakeAgent(sessionId: string): { lastRequest: () => AssistRequestEvent | null } {
  let last: AssistRequestEvent | null = null
  const conn: Conn = {
    role: 'cli',
    assistCapable: true,
    send: async (event, data) => {
      if (event === 'assist-request') last = data as AssistRequestEvent
    },
    close: () => {},
  }
  sessions.attach(sessionId, conn)
  return { lastRequest: () => last }
}

const HOST = { host: '127.0.0.1' }

async function post(path: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...HOST },
    body: JSON.stringify(body),
  })
}

function get(path: string): Promise<Response> {
  return app.request(path, { headers: HOST })
}

describe('POST /api/assist (suggest staging gate)', () => {
  it('409 no-agent when no assist listener', async () => {
    const real = fs.realpathSync(file)
    const { session } = sessions.open(real)
    const res = await post('/api/assist', { sessionId: session.id, kind: 'suggest', selection: 'x' })
    expect(res.status).toBe(409)
  })

  it('valid markup is stashed and fetchable once; structure preserved', async () => {
    const real = fs.realpathSync(file)
    const { session } = sessions.open(real)
    const agent = fakeAgent(session.id)
    const res = await post('/api/assist', { sessionId: session.id, kind: 'suggest', selection: 'the quick fox' })
    const { requestId } = (await res.json()) as { requestId: string }
    expect(requestId).toBeTruthy()
    expect(agent.lastRequest()?.kind).toBe('suggest')

    // agent answers with valid markup (rejects back to the original)
    assist.resolve(requestId, { kind: 'suggest', markup: 'the {~~quick~>swift~~} fox' })
    await new Promise((r) => setTimeout(r, 10)) // let the route's .then run

    const fetch1 = await get(`/api/assist/${requestId}/suggestion`)
    expect(fetch1.status).toBe(200)
    expect(((await fetch1.json()) as { markup: string }).markup).toBe('the {~~quick~>swift~~} fox')

    // one-shot: second fetch is 404
    const fetch2 = await get(`/api/assist/${requestId}/suggestion`)
    expect(fetch2.status).toBe(404)
  })

  it('markup that rewrites untouched text is NOT stashed (back-door blocked)', async () => {
    const real = fs.realpathSync(file)
    const { session } = sessions.open(real)
    fakeAgent(session.id)
    const res = await post('/api/assist', { sessionId: session.id, kind: 'suggest', selection: 'the brown fox' })
    const { requestId } = (await res.json()) as { requestId: string }
    // agent silently changed "brown"→"red" outside any mark
    assist.resolve(requestId, { kind: 'suggest', markup: 'the {++swift ++}red fox' })
    await new Promise((r) => setTimeout(r, 10))
    const fetched = await get(`/api/assist/${requestId}/suggestion`)
    expect(fetched.status).toBe(404) // never stashed
  })
})
