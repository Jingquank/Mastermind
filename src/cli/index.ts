import { Command } from 'commander'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import pkg from '../../package.json'
import type { CreateSessionResponse, ServerState } from '../shared/types'
import { serverLogPath } from '../server/paths'
import { readServerState } from '../server/statefile'
import { CliError, ensureServer } from './daemon'
import { postJson, probeHealth, requestShutdown, sleep } from './http'
import { waitForHandback } from './wait'

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

program
  .name('mastermind')
  .description('Local-first markdown review for humans and AI agents — the file is the protocol')
  .version(pkg.version)
  .option('--port <n>', 'port override (default 5173 or next free)')

program
  .command('open')
  .argument('<file>', 'markdown file to open')
  .option('--wait', 'block until the user clicks "Save & hand back", then exit 0')
  .option('--no-browser', 'print the URL without opening a browser tab')
  .description('start the server if not running and open a browser tab for this file')
  .action(async (file: string, opts: { wait?: boolean; browser: boolean }) => {
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

    if (opts.wait) {
      await waitForHandback(port, session.sessionId)
    }
    process.exit(0)
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
