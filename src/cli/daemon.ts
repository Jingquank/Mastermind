import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import pkg from '../../package.json'
import { ensureConfigDir, pkgRoot, serverLogPath } from '../server/paths'
import { clearServerState, pidIsAlive, readServerState } from '../server/statefile'
import { probeHealth, requestShutdown, sleep } from './http'

const serverEntry = fileURLToPath(new URL('../server/index.js', import.meta.url))

export class CliError extends Error {
  constructor(
    message: string,
    public exitCode: number,
  ) {
    super(message)
  }
}

function spawnDaemon(opts: { port?: number; pinned: boolean }): void {
  ensureConfigDir()
  const logPath = serverLogPath()
  try {
    const st = fs.statSync(logPath)
    if (st.size > 5 * 1024 * 1024) fs.renameSync(logPath, `${logPath}.1`)
  } catch {
    /* no log yet */
  }
  const logFd = fs.openSync(logPath, 'a')
  const child = spawn(process.execPath, [serverEntry], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    cwd: pkgRoot,
    env: {
      ...process.env,
      MASTERMIND_PORT: opts.port !== undefined ? String(opts.port) : '',
      MASTERMIND_PINNED: opts.pinned ? '1' : '',
    },
  })
  child.unref()
  fs.closeSync(logFd)
}

async function awaitReady(deadlineMs: number): Promise<number> {
  const until = Date.now() + deadlineMs
  while (Date.now() < until) {
    const state = readServerState()
    if (state && state.version === pkg.version) {
      const probe = await probeHealth(state.port)
      if (probe !== 'free' && probe !== 'foreign' && probe.version === pkg.version) return state.port
    }
    await sleep(120)
  }
  throw new CliError(`daemon did not become ready — check ${serverLogPath()}`, 1)
}

async function shutdownAndWait(port: number): Promise<void> {
  await requestShutdown(port)
  const until = Date.now() + 4000
  while (Date.now() < until) {
    if ((await probeHealth(port)) === 'free') return
    await sleep(100)
  }
}

/**
 * Make sure a daemon of OUR version is running; return its port.
 * Handles: reuse, stale statefile recovery, version-skew restart, pinned ports.
 */
export async function ensureServer(opts: { pinnedPort?: number } = {}): Promise<number> {
  const pinned = opts.pinnedPort

  const state = readServerState()
  if (state) {
    const probe = await probeHealth(state.port)
    if (probe !== 'free' && probe !== 'foreign') {
      // healthy mastermind
      if (probe.version !== pkg.version) {
        process.stderr.write(`mastermind: restarting daemon (v${probe.version} → v${pkg.version})\n`)
        await shutdownAndWait(state.port)
      } else if (pinned !== undefined && state.port !== pinned) {
        process.stderr.write(`mastermind: daemon already running on port ${state.port}; reusing it (ignoring --port ${pinned})\n`)
        return state.port
      } else {
        return state.port
      }
    } else {
      // stale or hung — recover
      if (pidIsAlive(state.pid)) {
        process.stderr.write(`mastermind: unresponsive daemon (pid ${state.pid}) — abandoning it\n`)
      }
      clearServerState(state.pid)
    }
  }

  if (pinned !== undefined) {
    const probe = await probeHealth(pinned)
    if (probe === 'foreign') {
      throw new CliError(`port ${pinned} is in use by something that isn't mastermind`, 2)
    }
    if (probe !== 'free') {
      // healthy mastermind not in the statefile (e.g. statefile was deleted)
      if (probe.version === pkg.version) return pinned
      await shutdownAndWait(pinned)
    }
    spawnDaemon({ port: pinned, pinned: true })
  } else {
    spawnDaemon({ pinned: false })
  }

  return awaitReady(6000)
}
