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

function tmpSetup(name: string): { cfgDir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mm-e2e-${name}-`))
  const file = path.join(dir, 'doc.md')
  fs.writeFileSync(file, '# Doc\n\nBody {++added++} text {>>@ke: a note<<}.\n')
  return { cfgDir: path.join(dir, 'cfg'), file }
}

async function startDaemon(port: number, cfgDir: string, extraEnv: Record<string, string> = {}): Promise<ChildProcess> {
  const child = spawn(process.execPath, [distServer], {
    env: {
      ...process.env,
      MASTERMIND_CONFIG_DIR: cfgDir,
      MASTERMIND_PORT: String(port),
      MASTERMIND_PINNED: '1',
      ...extraEnv,
    },
    stdio: 'ignore',
  })
  children.push(child)
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(500) })
      if (res.ok) return child
    } catch {
      /* not up yet */
    }
    await sleep(100)
  }
  throw new Error('daemon failed to start')
}

interface WaitProc {
  proc: ChildProcess
  stdout: () => string
  stderr: () => string
  exited: Promise<number | null>
  urlLine: Promise<string>
}

function runOpenWait(file: string, cfgDir: string): WaitProc {
  const proc = spawn(process.execPath, [distCli, 'open', file, '--wait', '--no-browser'], {
    env: { ...process.env, MASTERMIND_CONFIG_DIR: cfgDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(proc)
  let out = ''
  let err = ''
  let urlResolve: (s: string) => void
  const urlLine = new Promise<string>((r) => (urlResolve = r))
  proc.stdout!.on('data', (d: Buffer) => {
    out += d.toString()
    const m = out.match(/^http:\/\/[^\n]+/m)
    if (m) urlResolve(m[0])
  })
  proc.stderr!.on('data', (d: Buffer) => {
    err += d.toString()
  })
  const exited = new Promise<number | null>((resolve) => proc.on('exit', (code) => resolve(code)))
  return { proc, stdout: () => out, stderr: () => err, exited, urlLine }
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

describe.skipIf(!hasDist)('mastermind open --wait (e2e)', () => {
  it('exits 0 with the summary line on hand-back', async () => {
    const { cfgDir, file } = tmpSetup('handback')
    await startDaemon(5311, cfgDir)
    const wait = runOpenWait(file, cfgDir)
    const url = await wait.urlLine
    const sessionId = url.split('/d/')[1]!

    await sleep(300) // let the cli SSE attach
    const content = fs.readFileSync(file, 'utf8')
    const { mtimeMs } = fs.statSync(file)
    const res = await fetch(`http://127.0.0.1:5311/api/sessions/${sessionId}/handback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, baseMtimeMs: mtimeMs }),
    })
    expect(res.status).toBe(200)

    expect(await wait.exited).toBe(0)
    expect(wait.stdout()).toContain('mastermind: review complete — 1 comment, 1 suggested edit')

    const saved = fs.readFileSync(file, 'utf8')
    expect(saved).toContain('<!-- mastermind:summary -->')
    expect(saved).toContain('1 comment, 1 suggested edit')
  }, 20000)

  it('exits 130 on SIGINT', async () => {
    const { cfgDir, file } = tmpSetup('sigint')
    await startDaemon(5312, cfgDir)
    const wait = runOpenWait(file, cfgDir)
    await wait.urlLine
    await sleep(300)
    wait.proc.kill('SIGINT')
    expect(await wait.exited).toBe(130)
  }, 20000)

  it('exits 1 when the browser never connects', async () => {
    const { cfgDir, file } = tmpSetup('neveropen')
    await startDaemon(5313, cfgDir, { MASTERMIND_NEVER_OPENED_MS: '600' })
    const wait = runOpenWait(file, cfgDir)
    await wait.urlLine
    expect(await wait.exited).toBe(1)
    expect(wait.stderr()).toContain('browser never connected')
  }, 20000)

  it('exits 1 when the tab closes without hand-back', async () => {
    const { cfgDir, file } = tmpSetup('tabclose')
    await startDaemon(5314, cfgDir, { MASTERMIND_GRACE_MS: '300', MASTERMIND_NEVER_OPENED_MS: '60000' })
    const wait = runOpenWait(file, cfgDir)
    const url = await wait.urlLine
    const sessionId = url.split('/d/')[1]!

    // simulate a browser tab: role=ui SSE connection, then drop it
    const tab = new AbortController()
    void fetch(`http://127.0.0.1:5314/api/sessions/${sessionId}/events?role=ui`, {
      signal: tab.signal,
      headers: { accept: 'text/event-stream' },
    })
      .then(async (res) => {
        for await (const _ of res.body!) {
          /* drain */
        }
      })
      .catch(() => {})
    await sleep(500)
    tab.abort()

    expect(await wait.exited).toBe(1)
    expect(wait.stderr()).toContain('tab closed without hand-back')
  }, 20000)
})
