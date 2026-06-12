import fs from 'node:fs'
import path from 'node:path'
import type { ServerState } from '../shared/types'
import { ensureConfigDir, stateFilePath } from './paths'

export function readServerState(): ServerState | null {
  try {
    const raw = fs.readFileSync(stateFilePath(), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as ServerState).port === 'number' &&
      typeof (parsed as ServerState).pid === 'number' &&
      typeof (parsed as ServerState).version === 'string' &&
      typeof (parsed as ServerState).startedAt === 'number'
    ) {
      return parsed as ServerState
    }
    return null
  } catch {
    return null
  }
}

/** Atomic write: tmp file + rename, so a concurrent reader never sees a torn file. */
export function writeServerState(state: ServerState): void {
  const dir = ensureConfigDir()
  const tmp = path.join(dir, `.server.json.${process.pid}.tmp`)
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2))
  fs.renameSync(tmp, stateFilePath())
}

/**
 * Remove the statefile. When `onlyIfPid` is given, leave it alone unless it
 * still names that pid — a newer daemon may have already replaced it.
 */
export function clearServerState(onlyIfPid?: number): void {
  if (onlyIfPid !== undefined) {
    const current = readServerState()
    if (current && current.pid !== onlyIfPid) return
  }
  try {
    fs.unlinkSync(stateFilePath())
  } catch {
    /* already gone */
  }
}

export function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
