import type { ReviewCounts, SessionCloseReason } from '../shared/types'
import { probeHealth, sleep } from './http'

interface SseRecord {
  event: string
  data: string
}

/** Minimal SSE client over fetch (Node has no EventSource). */
async function* sseRecords(url: string): AsyncGenerator<SseRecord> {
  const res = await fetch(url, { headers: { accept: 'text/event-stream' } })
  if (!res.ok || !res.body) throw new Error(`sse connect failed: ${res.status}`)
  const decoder = new TextDecoder()
  let buf = ''
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk as Uint8Array, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const record = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      if (record.startsWith(':')) continue // comment/ping
      let event = 'message'
      let data = ''
      for (const line of record.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      yield { event, data }
    }
  }
}

const CLOSE_MESSAGES: Record<SessionCloseReason, string> = {
  'tabs-closed': 'tab closed without hand-back',
  'never-opened': 'browser never connected',
  shutdown: 'server shut down',
}

/**
 * The --wait state machine. Blocks until hand-back (prints the summary line,
 * exit 0), the session dies (exit 1), or the daemon vanishes after retries
 * (exit 1). SIGINT/SIGTERM exit 130/143. `file-deleted` is NOT terminal —
 * the user can still hand back, which recreates the file.
 */
export async function waitForHandback(port: number, sessionId: string): Promise<never> {
  process.on('SIGINT', () => process.exit(130))
  process.on('SIGTERM', () => process.exit(143))

  let attempts = 0
  for (;;) {
    try {
      const url = `http://127.0.0.1:${port}/api/sessions/${sessionId}/events?role=cli`
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
