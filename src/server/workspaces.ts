import crypto from 'node:crypto'
import path from 'node:path'
import type { SseEventName } from '../shared/types'
import { relWithin } from './contain'
import { log } from './log'
import type { Conn } from './sessions'

export interface Workspace {
  readonly id: string
  /** realpath of the root directory — the containment anchor */
  readonly root: string
  readonly displayName: string
  readonly createdAt: number
  /** live tree connections (SSE), keep the daemon alive and receive updates */
  readonly uiConns: Set<Conn>
}

/**
 * Realpath-keyed directory contexts for the file-tree. A workspace is NOT a
 * session: it owns no file, no watcher, no liveness timers. It exists only to
 * (a) anchor the containment root and (b) hold a thin SSE channel so an open
 * tree keeps the daemon alive and can be told to refresh. Opening a file from
 * the tree mints an ordinary session through the existing SessionRegistry — the
 * session layer, `--wait`, handback, and idle-exit are all untouched.
 */
export class WorkspaceRegistry {
  private byRoot = new Map<string, Workspace>()
  private byId = new Map<string, Workspace>()

  /** Open (or reuse by realpath) a workspace for an already-realpath'd root. */
  open(rootReal: string): Workspace {
    const existing = this.byRoot.get(rootReal)
    if (existing) return existing
    const ws: Workspace = {
      id: crypto.randomUUID(),
      root: rootReal,
      displayName: path.basename(rootReal) || rootReal,
      createdAt: Date.now(),
      uiConns: new Set(),
    }
    this.byRoot.set(rootReal, ws)
    this.byId.set(ws.id, ws)
    log(`workspace ${ws.id} opened for ${rootReal}`)
    return ws
  }

  get(id: string): Workspace | undefined {
    return this.byId.get(id)
  }

  /** Total live tree connections across all workspaces — gates daemon idle-exit. */
  activeUiConnCount(): number {
    let n = 0
    for (const ws of this.byId.values()) n += ws.uiConns.size
    return n
  }

  attach(workspaceId: string, conn: Conn): boolean {
    const ws = this.byId.get(workspaceId)
    if (!ws) return false
    ws.uiConns.add(conn)
    return true
  }

  detach(workspaceId: string, conn: Conn): void {
    this.byId.get(workspaceId)?.uiConns.delete(conn)
  }

  broadcast(workspaceId: string, event: SseEventName, data: unknown): void {
    const ws = this.byId.get(workspaceId)
    if (!ws) return
    for (const conn of ws.uiConns) {
      conn.send(event, data).catch(() => this.detach(workspaceId, conn))
    }
  }

  /**
   * Tell every workspace that contains `realPath` that something about that file
   * changed (mark counts, open/agent state). The relative path is injected into
   * the event data so the tree can target the right row. Skips workspaces with
   * no live tree connection.
   */
  notifyForPath(realPath: string, event: SseEventName, dataBase: Record<string, unknown> = {}): void {
    for (const ws of this.byId.values()) {
      if (ws.uiConns.size === 0) continue
      const rel = relWithin(ws.root, realPath)
      if (rel === null) continue
      this.broadcast(ws.id, event, { ...dataBase, rel })
    }
  }
}
