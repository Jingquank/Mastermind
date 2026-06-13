import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const distCli = path.join(root, 'dist', 'cli', 'index.js')
const distServer = path.join(root, 'dist', 'server', 'index.js')
const hasDist = fs.existsSync(distCli) && fs.existsSync(distServer)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const children: ChildProcess[] = []
const PORT = 5331

function setup(): { cfgDir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-assist-cli-'))
  const cfgDir = path.join(dir, 'cfg')
  fs.mkdirSync(cfgDir, { recursive: true })
  // provider = agent-channel
  fs.writeFileSync(
    path.join(cfgDir, 'config.json'),
    JSON.stringify({ version: 1, provider: { type: 'agent-channel' } }),
  )
  const file = path.join(dir, 'plan.md')
  fs.writeFileSync(file, '# Plan\n\nHello world.\n')
  return { cfgDir, file }
}

function env(cfgDir: string): NodeJS.ProcessEnv {
  return { ...process.env, MASTERMIND_CONFIG_DIR: cfgDir, MASTERMIND_PORT: String(PORT), MASTERMIND_PINNED: '1' }
}

async function startDaemon(cfgDir: string): Promise<void> {
  const child = spawn(process.execPath, [distServer], { env: env(cfgDir), stdio: 'ignore' })
  children.push(child)
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`, { signal: AbortSignal.timeout(500) })
      if (res.ok) return
    } catch {
      /* not up */
    }
    await sleep(100)
  }
  throw new Error('daemon did not start')
}

afterAll(() => {
  for (const c of children) {
    try {
      c.kill('SIGKILL')
    } catch {
      /* gone */
    }
  }
})

describe.skipIf(!hasDist)('assist CLI round-trip (e2e)', () => {
  it('assist prints a translate request; assist-result unblocks /api/translate', async () => {
    const { cfgDir, file } = setup()
    await startDaemon(cfgDir)

    // the assist listener (the "agent")
    const assist = spawn(process.execPath, [distCli, 'assist', file], { env: env(cfgDir), stdio: ['ignore', 'pipe', 'pipe'] })
    children.push(assist)
    let assistOut = ''
    assist.stdout!.on('data', (d: Buffer) => (assistOut += d.toString()))
    await sleep(800) // let it attach (creates/joins the session, assist-capable)

    // find the sessionId the assist process joined
    // (assist created the session by realpath; the daemon reuses it for translate)
    const sessionsRes = await fetch(`http://127.0.0.1:${PORT}/api/health`)
    expect(sessionsRes.ok).toBe(true)

    // fire a translate (don't await yet — it blocks until the agent answers)
    const realFile = fs.realpathSync(file)
    const create = await fetch(`http://127.0.0.1:${PORT}/api/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: realFile }),
    })
    const { sessionId } = (await create.json()) as { sessionId: string }

    const translateP = fetch(`http://127.0.0.1:${PORT}/api/translate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, sourceLang: 'en', targetLang: 'zh-CN', blocks: [{ hash: 'h1', text: 'Hello world.' }] }),
    })

    // wait for the assist child to print the request line
    let id = ''
    for (let i = 0; i < 40 && !id; i++) {
      const m = assistOut.match(/mastermind-assist: (\{.*\})/)
      if (m) {
        const req = JSON.parse(m[1]!) as { id: string; kind: string }
        expect(req.kind).toBe('translate')
        id = req.id
      } else {
        await sleep(100)
      }
    }
    expect(id).toBeTruthy()

    // answer via the CLI
    const result = spawn(
      process.execPath,
      [distCli, 'assist-result', id, '--blocks', JSON.stringify([{ hash: 'h1', text: '你好世界。' }])],
      { env: env(cfgDir), stdio: 'ignore' },
    )
    children.push(result)
    const resultExit = await new Promise<number | null>((r) => result.on('exit', r))
    expect(resultExit).toBe(0)

    // the translate call now resolves with the translation
    const res = await translateP
    expect(res.ok).toBe(true)
    const { results } = (await res.json()) as { results: { hash: string; text?: string }[] }
    expect(results).toEqual([{ hash: 'h1', text: '你好世界。', cached: false }])
  }, 25000)
})
