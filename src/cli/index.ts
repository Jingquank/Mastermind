import { Command } from 'commander'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import pkg from '../../package.json'
import type { CreateSessionResponse, CreateWorkspaceResponse, MastermindConfig, ServerState } from '../shared/types'
import { pkgRoot, serverLogPath } from '../server/paths'
import { readServerState } from '../server/statefile'
import { CliError, ensureServer } from './daemon'
import { getJson, postJson, postNoContent, probeHealth, putJson, requestShutdown, sleep } from './http'
import { serveAssist, waitForHandback } from './wait'
import { type ConfigPatch, readConfig, updateConfig } from '../server/config'
import { planPretranslate, writePretranslations } from '../server/translate/pretranslate'
import { type Assignment, applyAssignments, getDotted, parseAssignment } from './config-edit'
import { browserOpenArgs } from './browser-open'
import { AGENT_TARGETS, removeMarkedBlock, skillFile, stripFrontmatter, upsertMarkedBlock } from './install-agents'

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

async function openBrowser(url: string, override?: string): Promise<void> {
  if (process.platform !== 'darwin') return
  const args = browserOpenArgs(url, override, readConfig().browser)
  if (args.length === 1) {
    // system default browser — fire and forget
    spawn('open', args, { stdio: 'ignore', detached: true }).unref()
    return
  }
  // a specific app (`-a <name>`): detect "no such application" and fall back to the default
  const ok = await new Promise<boolean>((resolve) => {
    const child = spawn('open', args, { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
  if (!ok) {
    process.stderr.write(`mastermind: couldn't open ${args[1]} — using the default browser\n`)
    spawn('open', [url], { stdio: 'ignore', detached: true }).unref()
  }
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
  .option('--serve-assist', 'answer translation requests for this session (on by default with --wait)')
  .option('--no-assist', 'with --wait, review only — do not serve the assist channel (translation)')
  .option('--no-translate', 'open even if the translation cache is cold (skip the translate-first guard)')
  .option('--no-browser', 'print the URL without opening a browser tab')
  .option('--in <browser>', 'open in a specific browser app, e.g. "Google Chrome" (overrides the configured default)')
  .description('start the server if not running and open a browser tab for this file')
  .action(async (file: string, opts: { wait?: boolean; serveAssist?: boolean; assist: boolean; translate: boolean; browser: boolean; in?: string }) => {
    const pinnedPort = parsePort(program.opts<{ port?: string }>().port)
    const abs = path.resolve(file)
    let st: fs.Stats
    try {
      st = fs.statSync(abs)
    } catch {
      die(2, `file not found: ${abs}`)
    }
    if (!st.isFile()) die(2, `not a file: ${abs}`)

    // Translate-first guard: the reading-language toggle is cache-only, so the cache must
    // be warm BEFORE opening or the toggle has nothing to show. Refuse a cold cache and
    // point at the offline pre-translate flow (opt out with --no-translate).
    if (opts.translate) {
      const plan = await planPretranslate(abs, fs.readFileSync(abs, 'utf8'), readConfig().langPair)
      if (plan.blocks.length > 0) {
        die(
          2,
          `translation cache is cold (${plan.blocks.length} block(s) untranslated for ${plan.targetLang}).\n` +
            `  Pre-translate first, then re-run open:\n` +
            `    mastermind translate-blocks ${file}            # emits the blocks to translate\n` +
            `    …translate each block, preserving Markdown + CriticMarkup…\n` +
            `    printf '%s' '[{"hash":"…","text":"…"}]' | mastermind translate-blocks ${file} --save\n` +
            `  Or open without translating: mastermind open --no-translate ${file}`,
        )
      }
    }

    const port = await ensureServer({ pinnedPort })
    const session = await createSession(port, abs)
    process.stdout.write(`${session.url}\n`)
    if (opts.browser) await openBrowser(session.url, opts.in)

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
    if (opts.browser) await openBrowser(ws.url)
    process.exit(0)
  })

program
  .command('assist')
  .argument('<file>', 'markdown file under review')
  .description('listen for translation requests and stream them as JSON lines (agent-channel)')
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
  .description('deliver an agent-channel result back to Mastermind')
  .action(async (id: string, opts: { blocks?: string }) => {
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
    } else {
      die(2, 'provide --blocks')
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
    if (opts.browser) await openBrowser(session.url)
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

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

program
  .command('translate-blocks')
  .argument('<file>', 'markdown file to pre-translate')
  .option('--save', 'read translated [{hash,text}] JSON from stdin and write it to the on-disk cache')
  .description("offline pre-translate: emit the blocks to translate, or (--save) cache the agent's translations")
  .action(async (file: string, opts: { save?: boolean }) => {
    const abs = path.resolve(file)
    let source: string
    try {
      source = fs.readFileSync(abs, 'utf8')
    } catch {
      die(2, `file not found: ${abs}`)
    }
    const { langPair } = readConfig()
    if (opts.save) {
      let entries: { hash: string; text: string }[]
      try {
        const parsed: unknown = JSON.parse(await readStdin())
        if (!Array.isArray(parsed)) throw new Error('expected a JSON array')
        const ok = parsed.every(
          (e) =>
            e !== null &&
            typeof e === 'object' &&
            typeof (e as { hash?: unknown }).hash === 'string' &&
            typeof (e as { text?: unknown }).text === 'string',
        )
        if (!ok) throw new Error('each element must be { hash: string, text: string }')
        entries = parsed as { hash: string; text: string }[]
      } catch (err) {
        die(2, `--save expects [{hash,text}] JSON on stdin: ${err instanceof Error ? err.message : String(err)}`)
      }
      const res = await writePretranslations(abs, source, langPair, entries)
      const skips: string[] = []
      if (res.skippedUnknownHash) skips.push(`${res.skippedUnknownHash} stale/unknown-hash`)
      if (res.skippedMarkMismatch) skips.push(`${res.skippedMarkMismatch} mismatched-CriticMarkup`)
      process.stdout.write(
        `mastermind: cached ${res.written} block(s) → ${res.cachePath}${skips.length ? ` (skipped ${skips.join(', ')})` : ''}\n`,
      )
      process.exit(0)
    }
    process.stdout.write(`${JSON.stringify(await planPretranslate(abs, source, langPair))}\n`)
    process.exit(0)
  })

/** Port of a live, healthy daemon, or null when none runs (config edits then go straight to disk). */
async function liveDaemonPort(): Promise<number | null> {
  const state = readServerState()
  if (!state) return null
  const probe = await probeHealth(state.port)
  return typeof probe === 'object' ? state.port : null
}

const configCmd = program.command('config').description('read or write Mastermind preferences')

configCmd
  .command('get [key]')
  .description('print the whole config as JSON, or one dotted key (e.g. langPair.a)')
  .action((key: string | undefined) => {
    const cfg = readConfig() as unknown as Record<string, unknown>
    if (key === undefined) {
      process.stdout.write(`${JSON.stringify(cfg, null, 2)}\n`)
    } else {
      const v = getDotted(cfg, key)
      if (v === undefined) die(2, `unknown config key: ${key}`)
      process.stdout.write(`${typeof v === 'string' ? v : JSON.stringify(v)}\n`)
    }
    process.exit(0)
  })

configCmd
  .command('set <assignments...>')
  .description('set dotted key=value pairs, e.g. langPair.a=English theme=nacht browser="Google Chrome"')
  .action(async (raw: string[]) => {
    let assignments: Assignment[]
    try {
      assignments = raw.map(parseAssignment)
    } catch (err) {
      die(2, err instanceof Error ? err.message : String(err))
    }
    const port = await liveDaemonPort()
    // Read current config (via the daemon if up, else the file) so a dotted edit like
    // langPair.a doesn't clobber its sibling in the shallow server-side merge.
    const current = port ? await getJson<MastermindConfig>(port, '/api/config') : readConfig()
    let patch: Record<string, unknown>
    try {
      patch = applyAssignments(current, assignments).patch
    } catch (err) {
      die(2, err instanceof Error ? err.message : String(err))
    }
    try {
      // Daemon up → PUT so the change persists AND broadcasts config-changed to open tabs;
      // daemon down → write the file directly (no tabs to notify).
      if (port) await putJson<MastermindConfig>(port, '/api/config', patch)
      else updateConfig(patch as ConfigPatch)
    } catch (err) {
      die(1, `config set failed: ${err instanceof Error ? err.message : String(err)}`)
    }
    process.stdout.write(`mastermind: set ${assignments.map((a) => a.key).join(', ')}\n`)
    process.exit(0)
  })

const MM_DESC =
  'Visualize and review a Markdown file in Mastermind — /mastermind [setup|demo|<file>]. Always pre-translates the doc into both reading languages first.'
const MASTER_DESC = 'Alias of /mastermind: translate a file into both reading languages, then open it in Mastermind.'

function readCanonical(rel: string): string {
  return fs.readFileSync(path.join(pkgRoot, rel), 'utf8')
}

function installAgents(opts: { all: boolean; global: boolean }): void {
  const home = os.homedir()
  const mmBody = stripFrontmatter(readCanonical('.claude/skills/mastermind/SKILL.md'))
  const masterBody = stripFrontmatter(readCanonical('.claude/skills/master/SKILL.md'))
  const demo = readCanonical('.claude/skills/mastermind/reference/demo.md')
  const globalBody = readCanonical('assets/agent/global.md')

  const done: string[] = []
  for (const t of AGENT_TARGETS) {
    const base = path.join(home, t.dir)
    if (!opts.all && !fs.existsSync(base)) continue
    const mmDir = path.join(base, 'skills', 'mastermind')
    fs.mkdirSync(path.join(mmDir, 'reference'), { recursive: true })
    fs.writeFileSync(path.join(mmDir, 'SKILL.md'), skillFile(t, 'mastermind', MM_DESC, mmBody, pkg.version))
    fs.writeFileSync(path.join(mmDir, 'reference', 'demo.md'), demo)
    const masterDir = path.join(base, 'skills', 'master')
    fs.mkdirSync(masterDir, { recursive: true })
    fs.writeFileSync(path.join(masterDir, 'SKILL.md'), skillFile(t, 'master', MASTER_DESC, masterBody, pkg.version))
    let note = `  ${t.id}: skills/{mastermind,master}`
    if (opts.global && t.globalFile) {
      const gf = path.join(base, t.globalFile)
      const existing = fs.existsSync(gf) ? fs.readFileSync(gf, 'utf8') : ''
      fs.writeFileSync(gf, upsertMarkedBlock(existing, globalBody))
      note += ` + global (${t.globalFile})`
    } else if (opts.global && !t.globalFile) {
      note += ` + global skipped (no known memory file for ${t.id}; see AGENT_SETUP.md)`
    }
    done.push(`${note} → ${base}`)
  }
  if (done.length === 0) {
    process.stdout.write(
      'mastermind: no agent config dirs found (~/.claude, ~/.cursor, ~/.gemini, ~/.agents). Re-run with --all to create them.\n',
    )
    return
  }
  process.stdout.write(`mastermind: installed for ${done.length} agent(s):\n${done.join('\n')}\n`)
  if (opts.global) process.stdout.write('  (undo the global block + skills with `mastermind uninstall-agents`)\n')
}

function uninstallAgents(): void {
  const home = os.homedir()
  const removed: string[] = []
  for (const t of AGENT_TARGETS) {
    const base = path.join(home, t.dir)
    for (const name of ['mastermind', 'master']) {
      const dir = path.join(base, 'skills', name)
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true })
        removed.push(`  ${t.id}: skills/${name}`)
      }
    }
    if (t.globalFile) {
      const gf = path.join(base, t.globalFile)
      if (fs.existsSync(gf)) fs.writeFileSync(gf, removeMarkedBlock(fs.readFileSync(gf, 'utf8')))
    }
  }
  process.stdout.write(removed.length ? `mastermind: removed:\n${removed.join('\n')}\n` : 'mastermind: nothing to remove\n')
}

program
  .command('install-agents')
  .option('--all', 'install for every supported agent, creating its config dir if absent')
  .option('--no-global', 'install the skills only — skip the always-translate-first / plan→visualize global instruction block')
  .description('install the mastermind + master skills (and a global instruction block) for your coding agents')
  .action((opts: { all?: boolean; global: boolean }) => {
    installAgents({ all: !!opts.all, global: opts.global })
    process.exit(0)
  })

program
  .command('uninstall-agents')
  .description('remove the mastermind/master skills and the global instruction block this tool installed')
  .action(() => {
    uninstallAgents()
    process.exit(0)
  })

program.parseAsync().catch((err: unknown) => {
  if (err instanceof CliError) die(err.exitCode, err.message)
  die(1, err instanceof Error ? err.message : String(err))
})
