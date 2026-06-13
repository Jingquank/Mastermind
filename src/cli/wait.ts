import type { ReviewCounts, SessionCloseReason } from '../shared/types'
import { probeHealth, sleep } from './http'
import { sseRecords } from './sse'

const CLOSE_MESSAGES: Record<SessionCloseReason, string> = {
  'tabs-closed': 'tab closed without hand-back',
  'never-opened': 'browser never connected',
  shutdown: 'server shut down',
}

/** Emit any requests queued before this listener attached (startup race). */
async function drainAssistPending(port: number, sessionId: string): Promise<void> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/assist/pending?sessionId=${sessionId}`, {
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return
    const { requests } = (await res.json()) as { requests: unknown[] }
    for (const req of requests) process.stdout.write(`mastermind-assist: ${JSON.stringify(req)}\n`)
  } catch {
    /* best effort */
  }
}

/**
 * Standalone assist listener: attaches assist-capable, drains pending, and
 * prints one `mastermind-assist: {json}` line per request. The agent answers
 * with `mastermind assist-result|assist-error`. Runs until the session closes.
 */
export async function serveAssist(port: number, sessionId: string): Promise<never> {
  process.on('SIGINT', () => process.exit(130))
  process.on('SIGTERM', () => process.exit(143))
  process.stderr.write('mastermind: assist listener ready — answer with `mastermind assist-result|assist-error`\n')

  let attempts = 0
  for (;;) {
    try {
      await drainAssistPending(port, sessionId)
      const url = `http://127.0.0.1:${port}/api/sessions/${sessionId}/events?role=cli&assist=1`
      for await (const evt of sseRecords(url)) {
        attempts = 0
        if (evt.event === 'assist-request') {
          process.stdout.write(`mastermind-assist: ${evt.data}\n`)
        } else if (evt.event === 'session-closed') {
          const { reason } = JSON.parse(evt.data) as { reason: SessionCloseReason }
          process.stderr.write(`mastermind: ${CLOSE_MESSAGES[reason] ?? reason}\n`)
          process.exit(0)
        }
      }
    } catch {
      /* connection dropped — retry */
    }
    attempts++
    if (attempts > 3) {
      process.stderr.write('mastermind: lost connection to the daemon\n')
      process.exit(1)
    }
    await sleep(1000 * attempts)
    if ((await probeHealth(port)) === 'free') {
      process.stderr.write('mastermind: daemon is gone\n')
      process.exit(1)
    }
  }
}

/**
 * The --wait state machine. Blocks until hand-back (prints the summary line,
 * exit 0), the session dies (exit 1), or the daemon vanishes after retries
 * (exit 1). SIGINT/SIGTERM exit 130/143. `file-deleted` is NOT terminal —
 * the user can still hand back, which recreates the file.
 */
export async function waitForHandback(
  port: number,
  sessionId: string,
  opts: { serveAssist?: boolean } = {},
): Promise<never> {
  process.on('SIGINT', () => process.exit(130))
  process.on('SIGTERM', () => process.exit(143))

  let attempts = 0
  for (;;) {
    try {
      const q = opts.serveAssist ? 'role=cli&assist=1' : 'role=cli'
      const url = `http://127.0.0.1:${port}/api/sessions/${sessionId}/events?${q}`
      if (opts.serveAssist) await drainAssistPending(port, sessionId)
      for await (const evt of sseRecords(url)) {
        attempts = 0
        if (evt.event === 'handback') {
          const payload = JSON.parse(evt.data) as { summaryLine: string; counts: ReviewCounts }
          process.stdout.write(`${payload.summaryLine}\n`)
          process.exit(0)
        }
        if (evt.event === 'session-closed') {
          const { reason } = JSON.parse(evt.data) as { reason: SessionCloseReason }
          process.stderr.write(`mastermind: ${CLOSE_MESSAGES[reason] ?? reason}\n`)
          process.exit(1)
        }
        if (opts.serveAssist && evt.event === 'assist-request') {
          process.stdout.write(`mastermind-assist: ${evt.data}\n`)
        }
        // ping / file-changed / file-deleted / config-changed: keep waiting
      }
    } catch {
      /* connection dropped — fall through to retry */
    }
    attempts++
    if (attempts > 3) {
      process.stderr.write('mastermind: lost connection to the daemon\n')
      process.exit(1)
    }
    await sleep(1000 * attempts)
    const probe = await probeHealth(port)
    if (probe === 'free' || probe === 'foreign') {
      process.stderr.write('mastermind: daemon is gone\n')
      process.exit(1)
    }
    const sessionAlive = await fetch(`http://127.0.0.1:${port}/api/sessions/${sessionId}`, {
      signal: AbortSignal.timeout(2000),
    })
      .then((r) => r.ok)
      .catch(() => false)
    if (!sessionAlive) {
      process.stderr.write('mastermind: session is gone\n')
      process.exit(1)
    }
  }
}
