import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listRounds, listSnapshots, readLatestSnapshot, readSnapshot, writeSnapshot } from '../src/server/snapshots'

let dir: string
let file: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-snap-'))
  file = path.join(dir, 'plan.md')
  fs.writeFileSync(file, 'v0')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('snapshots', () => {
  it('writes next to the file and reads back the latest', async () => {
    await writeSnapshot(file, 'content-1', new Date(2026, 0, 1, 10, 0, 0))
    await writeSnapshot(file, 'content-2', new Date(2026, 0, 1, 11, 0, 0))
    const latest = await readLatestSnapshot(file)
    expect(latest?.content).toBe('content-2')
    const histDir = path.join(dir, '.mastermind', 'history', 'plan.md')
    expect(fs.existsSync(histDir)).toBe(true)
  })

  it('same-second hand-backs get suffixes instead of overwriting', async () => {
    const when = new Date(2026, 0, 1, 10, 0, 0)
    await writeSnapshot(file, 'a', when)
    await writeSnapshot(file, 'b', when)
    const list = await listSnapshots(file)
    expect(list).toHaveLength(2)
    expect((await readLatestSnapshot(file))?.content).toBe('b')
  })

  it('prunes to the newest 20', async () => {
    for (let i = 0; i < 23; i++) {
      await writeSnapshot(file, `v${i}`, new Date(2026, 0, 1, 8, 0, i))
    }
    const list = await listSnapshots(file)
    expect(list).toHaveLength(20)
    expect((await readLatestSnapshot(file))?.content).toBe('v22')
    // oldest three are gone
    const ids = list.map((s) => s.id)
    expect(ids).not.toContain('20260101T080000')
    expect(ids).not.toContain('20260101T080002')
  })

  it('readSnapshot fetches by id and refuses traversal-ish ids', async () => {
    const id = await writeSnapshot(file, 'content', new Date(2026, 0, 1, 9, 0, 0))
    expect((await readSnapshot(file, id))?.content).toBe('content')
    expect(await readSnapshot(file, '../escape')).toBeNull()
    expect(await readSnapshot(file, 'nonexistent')).toBeNull()
  })

  it('listRounds recounts marks from each snapshot body (not the prose summary)', async () => {
    const body =
      'A {++ins++} B {--del--} C {~~x~>y~~} D {==hl==} E {>>@ke: note<<} F\n\n' +
      '<!-- mastermind:summary -->\n> **Review summary** (2026-01-01 09:00)\n> wildly wrong prose counts\n<!-- /mastermind:summary -->\n'
    await writeSnapshot(file, body, new Date(2026, 0, 1, 9, 0, 0))
    const rounds = await listRounds(file)
    expect(rounds).toHaveLength(1)
    // recounted from the marks, ignoring the bogus prose summary
    expect(rounds[0]!.counts).toEqual({ comments: 1, edits: 3, highlights: 1 })
  })
})
