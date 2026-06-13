import fs from 'node:fs/promises'
import path from 'node:path'
import { SNAPSHOT_KEEP } from '../shared/constants'
import { group, reviewCounts, scan } from '../shared/critic/scanner'
import type { ReviewCountsDetail } from '../shared/critic/types'
import { codeRanges } from '../shared/markdown/exclusions'
import { stripSummary } from '../shared/summary'

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

/** Sort by id (extension stripped) — `X-2.md` must sort AFTER `X.md`. */
function sortedIds(files: string[]): string[] {
  return files
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -3))
    .sort()
}

async function prune(dir: string): Promise<void> {
  const ids = sortedIds(await fs.readdir(dir))
  const excess = ids.length - SNAPSHOT_KEEP
  for (let i = 0; i < excess; i++) {
    await fs.unlink(path.join(dir, `${ids[i]!}.md`)).catch(() => {})
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
  for (const id of sortedIds(entries).reverse()) {
    const st = await fs.stat(path.join(dir, `${id}.md`)).catch(() => null)
    if (st) out.push({ id, mtimeMs: st.mtimeMs, size: st.size })
  }
  return out
}

export async function readLatestSnapshot(filePath: string): Promise<{ id: string; content: string } | null> {
  const [latest] = await listSnapshots(filePath)
  if (!latest) return null
  return readSnapshot(filePath, latest.id)
}

/** Read one snapshot by id. Id is validated to a bare stamp (no traversal). */
export async function readSnapshot(filePath: string, id: string): Promise<{ id: string; content: string } | null> {
  if (!/^[0-9T-]+$/.test(id)) return null
  try {
    const content = await fs.readFile(path.join(historyDir(filePath), `${id}.md`), 'utf8')
    return { id, content }
  } catch {
    return null
  }
}

export interface RoundInfo extends SnapshotInfo {
  counts: ReviewCountsDetail
}

/**
 * Snapshots enriched with mark counts — recomputed from the marks themselves
 * (the same scan→group→reviewCounts pipeline handback uses), NOT parsed from
 * the localized prose summary block. Robust to translation and summary drift.
 */
export async function listRounds(filePath: string): Promise<RoundInfo[]> {
  const snaps = await listSnapshots(filePath)
  const out: RoundInfo[] = []
  for (const snap of snaps) {
    const read = await readSnapshot(filePath, snap.id)
    const body = read ? stripSummary(read.content) : ''
    const counts = reviewCounts(group(scan(body, codeRanges(body)), body))
    out.push({ ...snap, counts })
  }
  return out
}
