import { serve } from '@hono/node-server'
import type { Hono } from 'hono'
import type { Server } from 'node:http'
import pkg from '../../package.json'
import { DAEMON_IDLE_EXIT_MS, DEFAULT_PORT, PORT_SCAN_LIMIT } from '../shared/constants'
import { createApp } from './app'
import { log } from './log'
import { SessionRegistry } from './sessions'
import { clearServerState, readServerState, writeServerState } from './statefile'

function listenOnce(app: Hono, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => resolve(server as Server)) as Server
    server.on('error', reject)
  })
}

async function listenWithScan(app: Hono, base: number, attempts: number): Promise<{ server: Server; port: number }> {
  let lastErr: unknown
  for (let port = base; port < base + attempts; port++) {
    try {
      const server = await listenOnce(app, port)
      return { server, port }
    } catch (err) {
      lastErr = err
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') continue
      throw err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('no free port found')
}

async function isHealthyMastermind(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) })
    if (!res.ok) return false
    const j = (await res.json()) as { ok?: boolean; pid?: number }
    return j.ok === true && typeof j.pid === 'number'
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  const pinned = process.env.MASTERMIND_PINNED === '1'
  const base = Number(process.env.MASTERMIND_PORT || '') || DEFAULT_PORT
  const startedAt = Date.now()
  let lastActivity = Date.now()

  const registry = new SessionRegistry()
  registry.onChange = () => {
    lastActivity = Date.now()
  }

  let shuttingDown = false
  let server: Server | null = null
  const shutdown = (reason: string): void => {
    if (shuttingDown) return
    shuttingDown = true
    log(`shutting down (${reason})`)
    registry.closeAll('shutdown')
    clearServerState(process.pid)
    server?.close()
    // SSE streams keep sockets open; don't wait on them forever
    setTimeout(() => process.exit(0), 500).unref()
  }

  const app = createApp({
    registry,
    version: pkg.version,
    startedAt,
    requestShutdown: shutdown,
    touch: () => {
      lastActivity = Date.now()
    },
  })

  const bound = await listenWithScan(app, base, pinned ? 1 : PORT_SCAN_LIMIT)
  server = bound.server

  // Spawn race: if another healthy daemon already owns the statefile, defer to it.
  const existing = readServerState()
  if (existing && existing.pid !== process.pid && (await isHealthyMastermind(existing.port))) {
    log(`another daemon is already healthy on port ${existing.port} — exiting`)
    server.close()
    process.exit(0)
  }

  writeServerState({ port: bound.port, pid: process.pid, version: pkg.version, startedAt })
  log(`mastermind v${pkg.version} listening on http://127.0.0.1:${bound.port} (pid ${process.pid})`)

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  setInterval(() => {
    const idleFor = Date.now() - lastActivity
    if (registry.count() === 0 && idleFor > DAEMON_IDLE_EXIT_MS) {
      shutdown(`idle for ${Math.round(idleFor / 60_000)} min with no sessions`)
    }
  }, 60_000).unref()
}

main().catch((err: unknown) => {
  log('fatal:', err)
  process.exit(1)
})
