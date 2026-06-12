import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import type { Session } from './sessions'

export function sha256hex(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
}

export type WriteResult = { ok: true; mtimeMs: number } | { ok: false; currentMtimeMs: number }

/**
 * Compare-and-swap write: refuses (409 upstream) when the file's mtime no
 * longer matches what the client based its edit on. Records the content hash
 * so the watcher can swallow the echo of our own write.
 */
export async function writeSessionFile(
  session: Session,
  content: string,
  baseMtimeMs: number | undefined,
): Promise<WriteResult> {
  if (baseMtimeMs !== undefined) {
    const st = await fs.stat(session.path).catch(() => null)
    if (st && Math.abs(st.mtimeMs - baseMtimeMs) > 0.001) {
      return { ok: false, currentMtimeMs: st.mtimeMs }
    }
  }
  session.lastSelfWriteHash = sha256hex(content)
  await fs.writeFile(session.path, content)
  const st = await fs.stat(session.path)
  return { ok: true, mtimeMs: st.mtimeMs }
}
