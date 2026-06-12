import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import fs from 'node:fs/promises'
import path from 'node:path'
import { SSE_PING_INTERVAL_MS } from '../shared/constants'
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  FileResponse,
  HealthResponse,
  SessionMeta,
  SseEventName,
} from '../shared/types'
import { writeSessionFile } from './files'
import { performHandback } from './handback'
import { listSnapshots, readLatestSnapshot } from './snapshots'
import { log } from './log'
import { themesDir, uiDir } from './paths'
import { type Conn, type ConnRole, SessionRegistry } from './sessions'
import { serveFile } from './static'

export interface AppDeps {
  registry: SessionRegistry
  version: string
  startedAt: number
  requestShutdown: (reason: string) => void
  touch: () => void
}

const LOCAL_HOST_RE = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/
const LOCAL_ORIGIN_RE = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/

export function createApp(deps: AppDeps): Hono {
  const { registry } = deps
  const app = new Hono()

  // Guards: localhost-only Host (DNS rebinding) and same-machine Origin for writes (CSRF).
  app.use('*', async (c, next) => {
    deps.touch()
    const host = c.req.header('host') ?? ''
    if (!LOCAL_HOST_RE.test(host)) return c.text('forbidden host', 403)
    const origin = c.req.header('origin')
    if (origin && c.req.method !== 'GET' && !LOCAL_ORIGIN_RE.test(origin)) {
      return c.text('forbidden origin', 403)
    }
    await next()
  })

  app.get('/api/health', (c) => {
    const body: HealthResponse = {
      ok: true,
      pid: process.pid,
      version: deps.version,
      startedAt: deps.startedAt,
    }
    return c.json(body)
  })

  app.post('/api/admin/shutdown', (c) => {
    setTimeout(() => deps.requestShutdown('admin request'), 20)
    return c.body(null, 202)
  })

  app.post('/api/sessions', async (c) => {
    let body: CreateSessionRequest
    try {
      body = await c.req.json<CreateSessionRequest>()
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400)
    }
    if (!body.path) return c.json({ error: 'path is required' }, 400)
    let real: string
    try {
      real = await fs.realpath(path.resolve(body.path))
    } catch {
      return c.json({ error: `file not found: ${body.path}` }, 404)
    }
    const st = await fs.stat(real)
    if (!st.isFile()) return c.json({ error: `not a file: ${real}` }, 400)

    const { session, created } = registry.open(real, { isDraft: body.draft ?? false })
    const resp: CreateSessionResponse = {
      sessionId: session.id,
      url: `http://${c.req.header('host')}/d/${session.id}`,
      created,
      isDraft: session.isDraft,
    }
    return c.json(resp)
  })

  app.get('/api/sessions/:id', async (c) => {
    const session = registry.get(c.req.param('id'))
    if (!session) return c.json({ error: 'session not found' }, 404)
    let mtimeMs = 0
    try {
      mtimeMs = (await fs.stat(session.path)).mtimeMs
    } catch {
      /* deleted on disk — still report the session */
    }
    const meta: SessionMeta = {
      sessionId: session.id,
      path: session.path,
      displayName: session.displayName,
      isDraft: session.isDraft,
      mtimeMs,
    }
    return c.json(meta)
  })

  app.get('/api/sessions/:id/file', async (c) => {
    const session = registry.get(c.req.param('id'))
    if (!session) return c.json({ error: 'session not found' }, 404)
    try {
      const [content, st] = await Promise.all([fs.readFile(session.path, 'utf8'), fs.stat(session.path)])
      const body: FileResponse = { content, mtimeMs: st.mtimeMs }
      return c.json(body)
    } catch {
      return c.json({ error: 'file unreadable (deleted?)' }, 410)
    }
  })

  app.put('/api/sessions/:id/file', async (c) => {
    const session = registry.get(c.req.param('id'))
    if (!session) return c.json({ error: 'session not found' }, 404)
    let body: { content?: string; baseMtimeMs?: number }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400)
    }
    if (typeof body.content !== 'string') return c.json({ error: 'content is required' }, 400)
    const result = await writeSessionFile(session, body.content, body.baseMtimeMs)
    if (!result.ok) {
      return c.json({ error: 'file changed on disk', currentMtimeMs: result.currentMtimeMs }, 409)
    }
    return c.json({ mtimeMs: result.mtimeMs })
  })

  app.post('/api/sessions/:id/handback', async (c) => {
    const session = registry.get(c.req.param('id'))
    if (!session) return c.json({ error: 'session not found' }, 404)
    let body: { content?: string; baseMtimeMs?: number }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400)
    }
    if (typeof body.content !== 'string') return c.json({ error: 'content is required' }, 400)
    const result = await performHandback(session, body.content, body.baseMtimeMs)
    if (!result.ok) {
      return c.json({ error: 'file changed on disk', currentMtimeMs: result.currentMtimeMs }, 409)
    }
    log(`session ${session.id}: hand back — ${result.summaryLine}`)
    registry.broadcast(session.id, 'handback', {
      summaryLine: result.summaryLine,
      counts: result.counts,
      snapshotId: result.snapshotId,
      mtimeMs: result.mtimeMs,
    })
    return c.json({
      mtimeMs: result.mtimeMs,
      counts: result.counts,
      summaryLine: result.summaryLine,
      snapshotId: result.snapshotId,
    })
  })

  app.get('/api/sessions/:id/snapshots', async (c) => {
    const session = registry.get(c.req.param('id'))
    if (!session) return c.json({ error: 'session not found' }, 404)
    return c.json(await listSnapshots(session.path))
  })

  app.get('/api/sessions/:id/snapshots/latest', async (c) => {
    const session = registry.get(c.req.param('id'))
    if (!session) return c.json({ error: 'session not found' }, 404)
    const latest = await readLatestSnapshot(session.path)
    if (!latest) return c.json({ error: 'no snapshots' }, 404)
    return c.json(latest)
  })

  app.get('/api/sessions/:id/events', (c) => {
    const sessionId = c.req.param('id')
    const role: ConnRole = c.req.query('role') === 'cli' ? 'cli' : 'ui'
    if (!registry.get(sessionId)) return c.json({ error: 'session not found' }, 404)

    return streamSSE(c, async (stream) => {
      let open = true
      const conn: Conn = {
        role,
        send: async (event: SseEventName, data: unknown) => {
          await stream.writeSSE({ event, data: JSON.stringify(data) })
        },
        close: () => {
          open = false
          void stream.close()
        },
      }
      stream.onAbort(() => {
        open = false
        registry.detach(sessionId, conn)
      })
      if (!registry.attach(sessionId, conn)) {
        open = false
        return
      }
      log(`sse ${role} connected to session ${sessionId}`)
      while (open) {
        await stream.sleep(SSE_PING_INTERVAL_MS)
        if (!open) break
        try {
          await stream.writeSSE({ event: 'ping', data: '{}' })
        } catch {
          open = false
        }
      }
      registry.detach(sessionId, conn)
    })
  })

  // --- static: themes, built UI, SPA fallback ---

  app.get('/themes/*', async (c) => {
    const rel = c.req.path.replace(/^\/themes\//, '')
    const res = await serveFile(themesDir, rel, 'no-cache')
    return res ?? c.notFound()
  })

  app.get('/assets/*', async (c) => {
    const rel = c.req.path.replace(/^\//, '')
    const res = await serveFile(uiDir, rel, 'immutable')
    return res ?? c.notFound()
  })

  app.get('*', async (c) => {
    if (c.req.path.startsWith('/api/')) return c.notFound()
    // exact static file (favicon etc.), else SPA fallback to index.html
    const rel = c.req.path.replace(/^\//, '')
    if (rel && !rel.includes('..') && path.extname(rel)) {
      const res = await serveFile(uiDir, rel, 'no-cache')
      if (res) return res
      return c.notFound()
    }
    const index = await serveFile(uiDir, 'index.html', 'no-store')
    return index ?? c.text('mastermind: UI not built — run npm run build', 500)
  })

  return app
}
