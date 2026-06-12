import path from 'node:path'
import crypto from 'node:crypto'
import {
  SESSION_CLOSE_GRACE_MS,
  SESSION_NEVER_OPENED_MS,
} from '../shared/constants'
import type { SessionCloseReason, SseEventName } from '../shared/types'
import { log } from './log'

export type ConnRole = 'ui' | 'cli'

export interface Conn {
  readonly role: ConnRole
  /** Push one SSE event to this connection. */
  readonly send: (event: SseEventName, data: unknown) => Promise<void>
  /** Force the underlying stream closed. */
  readonly close: () => void
}

export interface Session {
  readonly id: string
  readonly path: string // realpath
  readonly displayName: string
  isDraft: boolean
  readonly createdAt: number
  /** sha256 of the last content the server itself wrote — used to swallow watcher echo. */
  lastSelfWriteHash: string | null
  readonly uiConns: Set<Conn>
  readonly cliConns: Set<Conn>
  /* liveness bookkeeping */
  everConnected: boolean
  graceTimer: NodeJS.Timeout | null
  graceArmedAt: number
  graceRearmed: boolean
  neverOpenedTimer: NodeJS.Timeout | null
  closed: boolean
}

export class SessionRegistry {
  private byPath = new Map<string, Session>()
  private byId = new Map<string, Session>()

  /** Called whenever a session is created or destroyed (idle-exit tracking). */
  onChange: (() => void) | null = null
  /** Hook for cleanup when a session closes (e.g. stop file watcher). */
  onSessionClosed: ((session: Session, reason: SessionCloseReason) => void) | null = null

  open(realPath: string, opts: { isDraft?: boolean } = {}): { session: Session; created: boolean } {
    const existing = this.byPath.get(realPath)
    if (existing) return { session: existing, created: false }

    const session: Session = {
      id: crypto.randomUUID(),
      path: realPath,
      displayName: path.basename(realPath),
      isDraft: opts.isDraft ?? false,
      createdAt: Date.now(),
      lastSelfWriteHash: null,
      uiConns: new Set(),
      cliConns: new Set(),
      everConnected: false,
      graceTimer: null,
      graceArmedAt: 0,
      graceRearmed: false,
      neverOpenedTimer: null,
      closed: false,
    }
    session.neverOpenedTimer = setTimeout(() => {
      if (!session.everConnected && !session.closed) {
        log(`session ${session.id} (${session.displayName}): no browser connected within timeout`)
        this.close(session.id, 'never-opened')
      }
    }, SESSION_NEVER_OPENED_MS)
    this.byPath.set(realPath, session)
    this.byId.set(session.id, session)
    log(`session ${session.id} opened for ${realPath}`)
    this.onChange?.()
    return { session, created: true }
  }

  get(id: string): Session | undefined {
    return this.byId.get(id)
  }

  getByPath(realPath: string): Session | undefined {
    return this.byPath.get(realPath)
  }

  count(): number {
    return this.byId.size
  }

  all(): Session[] {
    return [...this.byId.values()]
  }

  /** Re-key a session after rename-on-first-save. */
  rekey(session: Session, newRealPath: string): void {
    this.byPath.delete(session.path)
    const mutable = session as { path: string; displayName: string }
    mutable.path = newRealPath
    mutable.displayName = path.basename(newRealPath)
    this.byPath.set(newRealPath, session)
  }

  attach(sessionId: string, conn: Conn): boolean {
    const session = this.byId.get(sessionId)
    if (!session || session.closed) return false
    if (conn.role === 'ui') {
      session.uiConns.add(conn)
      session.everConnected = true
      if (session.neverOpenedTimer) {
        clearTimeout(session.neverOpenedTimer)
        session.neverOpenedTimer = null
      }
      this.disarmGrace(session)
    } else {
      session.cliConns.add(conn)
    }
    return true
  }

  detach(sessionId: string, conn: Conn): void {
    const session = this.byId.get(sessionId)
    if (!session) return
    session.uiConns.delete(conn)
    session.cliConns.delete(conn)
    if (conn.role === 'ui' && session.uiConns.size === 0 && session.everConnected && !session.closed) {
      this.armGrace(session)
    }
  }

  broadcast(sessionId: string, event: SseEventName, data: unknown, roles: ConnRole[] = ['ui', 'cli']): void {
    const session = this.byId.get(sessionId)
    if (!session) return
    const targets: Conn[] = []
    if (roles.includes('ui')) targets.push(...session.uiConns)
    if (roles.includes('cli')) targets.push(...session.cliConns)
    for (const conn of targets) {
      conn.send(event, data).catch(() => {
        // dead pipe — drop it; liveness timers handle the rest
        this.detach(sessionId, conn)
      })
    }
  }

  close(sessionId: string, reason: SessionCloseReason): void {
    const session = this.byId.get(sessionId)
    if (!session || session.closed) return
    session.closed = true
    if (session.graceTimer) clearTimeout(session.graceTimer)
    if (session.neverOpenedTimer) clearTimeout(session.neverOpenedTimer)
    this.broadcast(sessionId, 'session-closed', { reason })
    for (const conn of [...session.uiConns, ...session.cliConns]) {
      // give the event a beat to flush before tearing the stream down
      setTimeout(() => conn.close(), 50)
    }
    session.uiConns.clear()
    session.cliConns.clear()
    this.byPath.delete(session.path)
    this.byId.delete(sessionId)
    log(`session ${sessionId} closed (${reason})`)
    this.onSessionClosed?.(session, reason)
    this.onChange?.()
  }

  closeAll(reason: SessionCloseReason): void {
    for (const id of [...this.byId.keys()]) this.close(id, reason)
  }

  private armGrace(session: Session): void {
    this.disarmGrace(session)
    session.graceArmedAt = Date.now()
    session.graceRearmed = false
    session.graceTimer = setTimeout(() => this.graceFired(session), SESSION_CLOSE_GRACE_MS)
  }

  private disarmGrace(session: Session): void {
    if (session.graceTimer) {
      clearTimeout(session.graceTimer)
      session.graceTimer = null
    }
  }

  private graceFired(session: Session): void {
    session.graceTimer = null
    if (session.closed || session.uiConns.size > 0) return
    const elapsed = Date.now() - session.graceArmedAt
    // Timer overshot badly → the machine slept; give the browser one more
    // window to reconnect after wake instead of declaring the tab closed.
    if (elapsed > SESSION_CLOSE_GRACE_MS * 1.5 && !session.graceRearmed) {
      session.graceRearmed = true
      session.graceArmedAt = Date.now()
      session.graceTimer = setTimeout(() => this.graceFired(session), SESSION_CLOSE_GRACE_MS)
      return
    }
    this.close(session.id, 'tabs-closed')
  }
}
