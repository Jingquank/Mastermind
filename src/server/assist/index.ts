import crypto from 'node:crypto'
import { ASSIST_TIMEOUT_MS } from '../../shared/constants'
import type { AssistRequestEvent, AssistResultPayload } from '../../shared/types'
import { log } from '../log'
import type { Session, SessionRegistry } from '../sessions'

/** The request body minus the server-assigned id (id is added at enqueue). */
export type AssistRequest = {
  kind: 'translate'
  sourceLang: string
  targetLang: string
  blocks: { hash: string; text: string }[]
}

export type AssistFailure = 'no-agent' | 'timeout' | 'cancelled' | 'agent-error'

export class AssistError extends Error {
  constructor(
    public readonly code: AssistFailure,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'AssistError'
  }
}

interface Pending {
  id: string
  sessionId: string
  request: AssistRequest
  createdAt: number
  resolve: (payload: AssistResultPayload) => void
  reject: (err: AssistError) => void
  timer: NodeJS.Timeout
}

/**
 * Routes LLM tasks to the user's own coding agent through the SSE/--wait
 * channel — no API. enqueue() broadcasts an `assist-request` to assist-capable
 * cli conns and returns a promise that settles when the agent POSTs a result
 * (or times out / the agent is gone / the session closes). Mirrors the waiter
 * model that already powers `--wait`.
 */
export class AssistRegistry {
  private pending = new Map<string, Pending>()

  constructor(
    private readonly sessions: SessionRegistry,
    private readonly timeoutMs = ASSIST_TIMEOUT_MS,
  ) {}

  hasListener(session: Session): boolean {
    return this.sessions.hasAssistListener(session)
  }

  enqueue(session: Session, request: AssistRequest, opts: { timeoutMs?: number } = {}): Promise<AssistResultPayload> {
    if (!this.hasListener(session)) return Promise.reject(new AssistError('no-agent'))
    const id = crypto.randomUUID()
    const timeoutMs = opts.timeoutMs ?? this.timeoutMs
    return new Promise<AssistResultPayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          session.pendingAssist.delete(id)
          reject(new AssistError('timeout'))
        }
      }, timeoutMs)
      this.pending.set(id, { id, sessionId: session.id, request, createdAt: Date.now(), resolve, reject, timer })
      session.pendingAssist.add(id)
      const event: AssistRequestEvent = { id, ...request }
      this.sessions.broadcast(session.id, 'assist-request', event, ['cli'])
      log(`assist: enqueued ${request.kind} ${id.slice(0, 8)} for session ${session.id}`)
    })
  }

  /** Agent delivered a result. Returns false if the id is unknown (expired / dup). */
  resolve(id: string, payload: AssistResultPayload): boolean {
    const p = this.pending.get(id)
    if (!p) return false
    this.settle(p)
    p.resolve(payload)
    return true
  }

  /** Agent declined/failed a request. */
  fail(id: string, reason: string): boolean {
    const p = this.pending.get(id)
    if (!p) return false
    this.settle(p)
    p.reject(new AssistError('agent-error', reason))
    return true
  }

  /** Reject every pending request for a session (called on close). */
  cancelForSession(sessionId: string): void {
    for (const p of [...this.pending.values()]) {
      if (p.sessionId === sessionId) {
        this.settle(p)
        p.reject(new AssistError('cancelled'))
      }
    }
  }

  /** Requests still open for a session — drained by `mastermind assist` on (re)connect. */
  pendingFor(sessionId: string): AssistRequestEvent[] {
    return [...this.pending.values()]
      .filter((p) => p.sessionId === sessionId)
      .map((p) => ({ id: p.id, ...p.request }) as AssistRequestEvent)
  }

  private settle(p: Pending): void {
    clearTimeout(p.timer)
    this.pending.delete(p.id)
    this.sessions.get(p.sessionId)?.pendingAssist.delete(p.id)
  }
}
