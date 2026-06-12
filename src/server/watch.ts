import { watch } from 'chokidar'
import fs from 'node:fs/promises'
import { sha256hex } from './files'
import { log } from './log'
import type { Session, SessionRegistry } from './sessions'

/**
 * Per-session file watcher. Self-write echoes are swallowed by hash (not by
 * time window — awaitWriteFinish skews timing); unlink is tentative because
 * editors do atomic replace (unlink+add).
 */
export function startWatcher(session: Session, registry: SessionRegistry): void {
  const watcher = watch(session.path, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  })

  const onContent = async (): Promise<void> => {
    try {
      const [content, st] = await Promise.all([fs.readFile(session.path, 'utf8'), fs.stat(session.path)])
      if (sha256hex(content) === session.lastSelfWriteHash) return // our own write
      registry.broadcast(session.id, 'file-changed', { mtimeMs: st.mtimeMs })
    } catch {
      /* deleted between events — unlink handler covers it */
    }
  }

  watcher.on('change', () => void onContent())
  watcher.on('add', () => void onContent()) // file recreated after atomic replace
  watcher.on('unlink', () => {
    setTimeout(() => {
      void fs.access(session.path).catch(() => {
        log(`session ${session.id}: file deleted on disk`)
        registry.broadcast(session.id, 'file-deleted', {})
      })
    }, 500)
  })
  watcher.on('error', (err) => log(`watcher error for ${session.path}:`, err))

  session.watcher = watcher
}

export async function stopWatcher(session: Session): Promise<void> {
  await session.watcher?.close().catch(() => {})
  session.watcher = null
}
