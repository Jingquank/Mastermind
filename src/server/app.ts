import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import fs from 'node:fs/promises'
import os from 'node:os'
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
import { readConfig, redactConfig, updateConfig, type ConfigPatch } from './config'
import { processFeedbackLanguage } from './feedback'
import { writeSessionFile } from './files'
import { performHandback } from './handback'
import { listRounds, readLatestSnapshot, readSnapshot } from './snapshots'
import { scanThemes } from './themes'
import { clearCache } from './translate/cache'
import { providerConfigured, translateBlocks, type TranslateRequestBlock } from './translate/index'
import { startWatcher, stopWatcher } from './watch'
import { AssistError, type AssistRegistry } from './assist/index'
import { validateSuggestion } from '../shared/critic/suggest'
import { log } from './log'
import { themesDir, uiDir } from './paths'
import { type Conn, type ConnRole, SessionRegistry } from './sessions'
import { serveFile } from './static'
import type { AssistResultPayload } from '../shared/types'

export interface AppDeps {
  registry: SessionRegistry
  assist: AssistRegistry
  version: string
  startedAt: number
  requestShutdown: (reason: string) => void
  touch: () => void
}

const LOCAL_HOST_RE = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/
const LOCAL_ORIGIN_RE = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/

export function createApp(deps: AppDeps): Hono {
  const { registry, assist } = deps
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

  app.get('/api/config', (c) => c.json(redactConfig(readConfig())))

  app.put('/api/config', async (c) => {
    let patch: ConfigPatch
    try {
      patch = await c.req.json<ConfigPatch>()
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400)
    }
    const next = updateConfig(patch)
    for (const session of registry.all()) {
      registry.broadcast(session.id, 'config-changed', {})
    }
    return c.json(redactConfig(next))
  })

  app.get('/api/themes', async (c) => c.json(await scanThemes()))

  app.post('/api/translate', async (c) => {
    let body: { sessionId?: string; sourceLang?: string; targetLang?: string; blocks?: TranslateRequestBlock[] }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400)
    }
    if (!body.sessionId || !body.targetLang || !Array.isArray(body.blocks)) {
      return c.json({ error: 'sessionId, targetLang, blocks required' }, 400)
    }
    const session = registry.get(body.sessionId)
    if (!session) return c.json({ error: 'session not found' }, 404)
    const config = readConfig()
    if (!providerConfigured(config)) return c.json({ error: 'no translation provider configured' }, 400)
    try {
      const results = await translateBlocks(
        session,
        body.blocks.slice(0, 50),
        body.sourceLang ?? 'auto-detected source language',
        body.targetLang,
        config,
        assist,
      )
      return c.json({ results })
    } catch (err) {
      // agent-channel surfaces no-agent/timeout/cancel here (the whole batch fails)
      const code = err instanceof AssistError ? err.code : 'provider'
      return c.json({ error: code }, code === 'no-agent' ? 409 : 502)
    }
  })

  app.delete('/api/translate/cache', (c) => {
    const sessionId = c.req.query('sessionId')
    const session = sessionId ? registry.get(sessionId) : undefined
    if (!session) return c.json({ error: 'session not found' }, 404)
    clearCache(session.path, c.req.query('lang') || undefined)
    return c.body(null, 204)
  })

  app.post('/api/sessions', async (c) => {
    let body: CreateSessionRequest
    try {
      body = await c.req.json<CreateSessionRequest>()
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400)
    }

    let real: string
    let isDraft = false
    if (body.draft) {
      // blank draft: eagerly create untitled.md (one session model — real
      // path, real watcher); renamed on first save, unlinked if left empty
      const dir = body.dir ? path.resolve(body.dir) : os.homedir()
      const dirStat = await fs.stat(dir).catch(() => null)
      if (!dirStat?.isDirectory()) return c.json({ error: `not a directory: ${dir}` }, 400)
      let name = 'untitled.md'
      for (let n = 2; ; n++) {
        try {
          await fs.writeFile(path.join(dir, name), '', { flag: 'wx' })
          break
        } catch {
          name = `untitled-${n}.md`
        }
      }
      real = await fs.realpath(path.join(dir, name))
      isDraft = true
    } else {
      if (!body.path) return c.json({ error: 'path is required' }, 400)
      try {
        real = await fs.realpath(path.resolve(body.path))
      } catch {
        return c.json({ error: `file not found: ${body.path}` }, 404)
      }
      const st = await fs.stat(real)
      if (!st.isFile()) return c.json({ error: `not a file: ${real}` }, 400)
    }

    const { session, created } = registry.open(real, { isDraft })
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
      agentWaiting: session.cliConns.size > 0,
      assistAvailable: registry.hasAssistListener(session),
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
    const processed = await processFeedbackLanguage(body.content, readConfig())
    const result = await writeSessionFile(session, processed, body.baseMtimeMs)
    if (!result.ok) {
      return c.json({ error: 'file changed on disk', currentMtimeMs: result.currentMtimeMs }, 409)
    }
    // content returned only when the feedback rule rewrote it — UI adopts
    return c.json({ mtimeMs: result.mtimeMs, content: processed !== body.content ? processed : undefined })
  })

  app.post('/api/sessions/:id/rename', async (c) => {
    const session = registry.get(c.req.param('id'))
    if (!session) return c.json({ error: 'session not found' }, 404)
    let body: { filename?: string }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400)
    }
    let name = path.basename((body.filename ?? '').trim())
    if (!name || name === '.md' || name.startsWith('.')) return c.json({ error: 'invalid filename' }, 400)
    if (!name.endsWith('.md')) name += '.md'
    const target = path.join(path.dirname(session.path), name)
    const exists = await fs.stat(target).then(
      () => true,
      () => false,
    )
    if (exists) return c.json({ error: `${name} already exists`, code: 'exists' }, 409)

    await stopWatcher(session)
    await fs.rename(session.path, target)
    const real = await fs.realpath(target)
    registry.rekey(session, real)
    session.isDraft = false
    startWatcher(session, registry)
    log(`session ${session.id}: renamed to ${real}`)
    return c.json({ path: real, displayName: session.displayName })
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
    // rounds: snapshots enriched with mark counts (the timeline data)
    return c.json(await listRounds(session.path))
  })

  app.get('/api/sessions/:id/snapshots/latest', async (c) => {
    const session = registry.get(c.req.param('id'))
    if (!session) return c.json({ error: 'session not found' }, 404)
    const latest = await readLatestSnapshot(session.path)
    if (!latest) return c.json({ error: 'no snapshots' }, 404)
    return c.json(latest)
  })

  app.get('/api/sessions/:id/snapshots/:snapId', async (c) => {
    const session = registry.get(c.req.param('id'))
    if (!session) return c.json({ error: 'session not found' }, 404)
    const snap = await readSnapshot(session.path, c.req.param('snapId'))
    if (!snap) return c.json({ error: 'snapshot not found' }, 404)
    return c.json(snap)
  })

  // --- agent-channel (assist) ---

  // validated proposed-suggestion markup, keyed by request id (one-shot fetch by the UI)
  const suggestions = new Map<string, { markup: string }>()

  app.post('/api/assist', async (c) => {
    let body: { sessionId?: string; kind?: string; scope?: string; selection?: string; context?: string }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400)
    }
    if (!body.sessionId || body.kind !== 'suggest' || typeof body.selection !== 'string') {
      return c.json({ error: 'sessionId, kind:suggest, selection required' }, 400)
    }
    const session = registry.get(body.sessionId)
    if (!session) return c.json({ error: 'session not found' }, 404)
    if (!assist.hasListener(session)) return c.json({ error: 'no-agent' }, 409)
    const scope = body.scope === 'section' || body.scope === 'document' ? body.scope : 'selection'
    const selection = body.selection
    const { id, result } = assist.enqueueWithId(session, { kind: 'suggest', scope, selection, context: body.context })
    result
      .then((payload) => {
        const ok = payload.kind === 'suggest' && validateSuggestion(payload.markup, selection).ok
        if (ok && payload.kind === 'suggest') suggestions.set(id, { markup: payload.markup })
        registry.broadcast(session.id, 'assist-result', { id, kind: 'suggest', ok }, ['ui'])
      })
      .catch((err: unknown) => {
        log(`assist suggest ${id.slice(0, 8)} failed: ${err instanceof AssistError ? err.code : 'error'}`)
        registry.broadcast(session.id, 'assist-result', { id, kind: 'suggest', ok: false }, ['ui'])
      })
    return c.json({ requestId: id })
  })

  app.get('/api/assist/:id/suggestion', (c) => {
    const s = suggestions.get(c.req.param('id'))
    if (!s) return c.json({ error: 'not found' }, 404)
    suggestions.delete(c.req.param('id')) // one-shot
    return c.json({ markup: s.markup })
  })

  app.get('/api/assist/pending', (c) => {
    const sessionId = c.req.query('sessionId')
    const session = sessionId ? registry.get(sessionId) : undefined
    if (!session) return c.json({ error: 'session not found' }, 404)
    return c.json({ requests: assist.pendingFor(session.id) })
  })

  app.post('/api/assist/:id/result', async (c) => {
    let payload: AssistResultPayload
    try {
      payload = await c.req.json<AssistResultPayload>()
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400)
    }
    return assist.resolve(c.req.param('id'), payload) ? c.body(null, 204) : c.json({ error: 'unknown or expired' }, 404)
  })

  app.post('/api/assist/:id/error', async (c) => {
    let body: { reason?: string }
    try {
      body = await c.req.json()
    } catch {
      body = {}
    }
    return assist.fail(c.req.param('id'), body.reason ?? 'declined')
      ? c.body(null, 204)
      : c.json({ error: 'unknown or expired' }, 404)
  })

  app.get('/api/sessions/:id/events', (c) => {
    const sessionId = c.req.param('id')
    const role: ConnRole = c.req.query('role') === 'cli' ? 'cli' : 'ui'
    const assistCapable = role === 'cli' && c.req.query('assist') === '1'
    if (!registry.get(sessionId)) return c.json({ error: 'session not found' }, 404)

    return streamSSE(c, async (stream) => {
      let open = true
      const conn: Conn = {
        role,
        assistCapable,
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
