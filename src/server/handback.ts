import fs from 'node:fs/promises'
import { group, reviewCounts, scan } from '../shared/critic/scanner'
import { codeRanges } from '../shared/markdown/exclusions'
import { stripSummary, summaryLine, upsertSummary } from '../shared/summary'
import type { ReviewCounts } from '../shared/types'
import { sha256hex } from './files'
import type { Session } from './sessions'
import { writeSnapshot } from './snapshots'

export interface HandbackResult {
  ok: true
  mtimeMs: number
  counts: ReviewCounts
  summaryLine: string
  snapshotId: string
}

export type HandbackOutcome = HandbackResult | { ok: false; currentMtimeMs: number }

/**
 * The hand-back contract: strip any stale summary, count marks with the same
 * scanner the UI uses, write content + fresh summary block, snapshot the
 * saved bytes, and report the one-line summary the CLI prints. The in-file
 * block and the --wait stdout line always agree by construction.
 */
export async function performHandback(
  session: Session,
  content: string,
  baseMtimeMs: number | undefined,
): Promise<HandbackOutcome> {
  if (baseMtimeMs !== undefined) {
    const st = await fs.stat(session.path).catch(() => null)
    if (st && Math.abs(st.mtimeMs - baseMtimeMs) > 0.001) {
      return { ok: false, currentMtimeMs: st.mtimeMs }
    }
  }

  const body = stripSummary(content)
  const counts = reviewCounts(group(scan(body, codeRanges(body)), body))
  const final = upsertSummary(content, counts, new Date())

  session.lastSelfWriteHash = sha256hex(final)
  await fs.writeFile(session.path, final)
  const st = await fs.stat(session.path)
  const snapshotId = await writeSnapshot(session.path, final)

  return { ok: true, mtimeMs: st.mtimeMs, counts, summaryLine: summaryLine(counts), snapshotId }
}
