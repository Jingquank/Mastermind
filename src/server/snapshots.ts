import fs from 'node:fs/promises'
import path from 'node:path'
import { SNAPSHOT_KEEP } from '../shared/constants'

/** Compact local stamp — lexically sortable, no colons (macOS-hostile). */
function snapshotStamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}T${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
}

function historyDir(filePath: string): string {
  return path.join(path.dirname(filePath), '.mastermind', 'history', path.basename(filePath))
}

/** Write a hand-back snapshot next to the file; prune to the newest N. */
export async function writeSnapshot(filePath: string, content: string, date = new Date()): Promise<string> {
  const dir = historyDir(filePath)
  await fs.mkdir(dir, { recursive: true })
  let id = snapshotStamp(date)
  // same-second handbacks: suffix instead of overwrite
  const existing = new Set(await fs.readdir(dir))
  if (existing.has(`${id}.md`)) {
    let n = 2
    while (existing.has(`${id}-${n}.md`)) n++
    id = `${id}-${n}`
  }
  await fs.writeFile(path.join(dir, `${id}.md`), content)
  await prune(dir)
  return id
}

async function prune(dir: string): Promise<void> {
  const entries = (await fs.readdir(dir)).filter((f) => f.endsWith('.md')).sort()
  const excess = entries.length - SNAPSHOT_KEEP
  for (let i = 0; i < excess; i++) {
    await fs.unlink(path.join(dir, entries[i]!)).catch(() => {})
  }
}

export interface SnapshotInfo {
  id: string
  mtimeMs: number
  size: number
}

export async function listSnapshots(filePath: string): Promise<SnapshotInfo[]> {
  const dir = historyDir(filePath)
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  const out: SnapshotInfo[] = []
  for (const f of entries.filter((f) => f.endsWith('.md')).sort().reverse()) {
    const st = await fs.stat(path.join(dir, f)).catch(() => null)
    if (st) out.push({ id: f.slice(0, -3), mtimeMs: st.mtimeMs, size: st.size })
  }
  return out
}

export async function readLatestSnapshot(filePath: string): Promise<{ id: string; content: string } | null> {
  const [latest] = await listSnapshots(filePath)
  if (!latest) return null
  try {
    const content = await fs.readFile(path.join(historyDir(filePath), `${latest.id}.md`), 'utf8')
    return { id: latest.id, content }
  } catch {
    return null
  }
}
