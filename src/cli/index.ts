import { Command } from 'commander'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import pkg from '../../package.json'
import type { CreateSessionResponse, CreateWorkspaceResponse, ServerState } from '../shared/types'
import { serverLogPath } from '../server/paths'
import { readServerState } from '../server/statefile'
import { CliError, ensureServer } from './daemon'
import { postJson, postNoContent, probeHealth, requestShutdown, sleep } from './http'
import { serveAssist, waitForHandback } from './wait'

const program = new Command()

function die(code: number, message: string): never {
  process.stderr.write(`mastermind: ${message}\n`)
  process.exit(code)
}

function parsePort(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 65535) die(2, `invalid port: ${value}`)
  return n
}

function openBrowser(url: string): void {
  if (process.platform !== 'darwin') return
  spawn('open', [url], { stdio: 'ignore', detached: true }).unref()
}

async function createSession(port: number, filePath: string): Promise<CreateSessionResponse> {
  return postJson<CreateSessionResponse>(port, '/api/sessions', { path: filePath })
}

async function createWorkspace(port: number, dir: string): Promise<CreateWorkspaceResponse> {
  return postJson<CreateWorkspaceResponse>(port, '/api/workspaces', { root: dir })
}

program
  .name('mastermind')
  .description('Local-first markdown review for humans and AI agents — the file is the protocol')
  .version(pkg.version)
  .option('--port <n>', 'port override (default 5173 or next free)')

program
  .command('open')
  .argument('<file>', 'markdown file to open')
  .option('--wait', 'block until the user clicks "Save & hand back", then exit 0')
  .option('--serve-assist', 'answer translation/suggestion requests for this session (on by default with --wait)')
  .option('--no-assist', 'with --wait, review only — do not serve the assist channel (translation/suggestions)')
  .option('--no-browser', 'print the URL without opening a browser tab')
  .description('start the server if not running and open a browser tab for this file')
  .action(async (file: string, opts: { wait?: boolean; serveAssist?: boolean; assist: boolean; browser: boolean }) => {
    const pinnedPort = parsePort(program.opts<{ port?: string }>().port)
    const abs = path.resolve(file)
    let st: fs.Stats
    try {
      st = fs.statSync(abs)
    } catch {
      die(2, `file not found: ${abs}`)
    }
    if (!st.isFile()) die(2, `not a file: ${abs}`)

    const port = await ensureServer({ pinnedPort })
    const session = await createSession(port, abs)
    process.stdout.write(`${session.url}\n`)
    if (opts.browser) openBrowser(session.url)

    // A --wait review serves the agent-channel by default: it lights up the reading-language
    // toggle and lets Mastermind pre-translate the document while the user reads (opt out with
    // --no-assist). Plain `open` stays fire-and-forget; --serve-assist makes it block-and-serve.
    const serve = !!opts.serveAssist || (!!opts.wait && opts.assist)
    if (opts.wait) {
      await waitForHandback(port, session.sessionId, { serveAssist: serve })
    } else if (serve) {
      await serveAssist(port, session.sessionId)
    }
    process.exit(0)
  })

program
  .command('workspace')
  .alias('ws')
  .argument('[dir]', 'directory to browse (default: current directory)')
  .option('--no-browser', 'print the URL without opening a browser tab')
  .description('open a file-tree workspace rooted at a directory')
  .action(async (dirArg: string | undefined, opts: { browser: boolean }) => {
    const pinnedPort = parsePort(program.opts<{ port?: string }>().port)
    const abs = path.resolve(dirArg ?? process.cwd())
    let st: fs.Stats
    try {
      st = fs.statSync(abs)
    } catch {
      die(2, `directory not found: ${abs}`)
    }
    if (!st.isDirectory()) die(2, `not a directory: ${abs}`)

    const port = await ensureServer({ pinnedPort })
    const ws = await createWorkspace(port, abs)
    process.stdout.write(`${ws.url}\n`)
    if (opts.browser) openBrowser(ws.url)
    process.exit(0)
  })

program
  .command('assist')
  .argument('<file>', 'markdown file under review')
  .description('listen for translation/suggestion requests and stream them as JSON lines (agent-channel)')
  .action(async (file: string) => {
    const pinnedPort = parsePort(program.opts<{ port?: string }>().port)
    const abs = path.resolve(file)
    if (!fs.existsSync(abs)) die(2, `file not found: ${abs}`)
    const port = await ensureServer({ pinnedPort })
    const session = await createSession(port, abs)
    await serveAssist(port, session.sessionId)
  })

program
  .command('assist-result')
  .argument('<id>', 'the request id from the assist-request line')
  .option('--blocks <json>', 'translate result: JSON [{hash,text}]')
  .option('--markup <md>', 'suggest result: the selection rewritten with CriticMarkup')
  .description('deliver an agent-channel result back to Mastermind')
  .action(async (id: string, opts: { blocks?: string; markup?: string }) => {
    const state = readServerState()
    if (!state) die(1, 'no daemon running')
    let payload: unknown
    if (opts.blocks !== undefined) {
      let blocks: unknown
      try {
        blocks = JSON.parse(opts.blocks)
      } catch {
        die(2, '--blocks must be valid JSON')
      }
      payload = { kind: 'translate', blocks }
    } else if (opts.markup !== undefined) {
      payload = { kind: 'suggest', markup: opts.markup }
    } else {
      die(2, 'provide --blocks or --markup')
    }
    try {
      await postNoContent(state.port, `/api/assist/${id}/result`, payload)
      process.exit(0)
    } catch (err) {
      die(1, `result rejected: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

program
  .command('assist-error')
  .argument('<id>', 'the request id')
  .option('--reason <text>', 'why the request could not be fulfilled')
  .description('decline an agent-channel request')
  .action(async (id: string, opts: { reason?: string }) => {
    const state = readServerState()
    if (!state) die(1, 'no daemon running')
    try {
      await postNoContent(state.port, `/api/assist/${id}/error`, { reason: opts.reason ?? 'declined' })
      process.exit(0)
    } catch (err) {
      die(1, `error rejected: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

program
  .command('new')
  .argument('[path]', 'optional path for the new draft')
  .option('--no-browser', 'print the URL without opening a browser tab')
  .description('create a blank draft and open it (prompts for a name on first save)')
  .action(async (pathArg: string | undefined, opts: { browser: boolean }) => {
    const pinnedPort = parsePort(program.opts<{ port?: string }>().port)
    const port = await ensureServer({ pinnedPort })
    let session: CreateSessionResponse
    if (pathArg) {
      const abs = path.resolve(pathArg)
      if (!fs.existsSync(abs)) {
        fs.mkdirSync(path.dirname(abs), { recursive: true })
        fs.writeFileSync(abs, '', { flag: 'wx' })
      }
      session = await postJson<CreateSessionResponse>(port, '/api/sessions', { path: abs })
    } else {
      session = await postJson<CreateSessionResponse>(port, '/api/sessions', { draft: true, dir: process.cwd() })
    }
    process.stdout.write(`${session.url}\n`)
    if (opts.browser) openBrowser(session.url)
    process.exit(0)
  })

program
  .command('status')
  .description('show daemon status')
  .action(async () => {
    const state: ServerState | null = readServerState()
    if (!state) {
      process.stdout.write('mastermind: no daemon registered\n')
      process.exit(0)
    }
    const probe = await probeHealth(state.port)
    if (probe === 'free' || probe === 'foreign') {
      process.stdout.write(
        `mastermind: statefile names pid ${state.pid} on port ${state.port}, but no healthy daemon answered (${probe})\n`,
      )
      process.exit(1)
    }
    const uptime = Math.round((Date.now() - probe.startedAt) / 1000)
    process.stdout.write(
      `mastermind v${probe.version} — pid ${probe.pid}, http://127.0.0.1:${state.port}, up ${uptime}s\nlog: ${serverLogPath()}\n`,
    )
    process.exit(0)
  })

program
  .command('stop')
  .description('shut the daemon down')
  .action(async () => {
    const state = readServerState()
    if (!state) {
      process.stdout.write('mastermind: no daemon registered\n')
      process.exit(0)
    }
    await requestShutdown(state.port)
    const until = Date.now() + 4000
    while (Date.now() < until) {
      if ((await probeHealth(state.port)) === 'free') {
        process.stdout.write('mastermind: daemon stopped\n')
        process.exit(0)
      }
      await sleep(100)
    }
    die(1, `daemon did not stop — check ${serverLogPath()}`)
  })

program.parseAsync().catch((err: unknown) => {
  if (err instanceof CliError) die(err.exitCode, err.message)
  die(1, err instanceof Error ? err.message : String(err))
})
