import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { clearServerState, readServerState, writeServerState } from '../src/server/statefile'
import { stateFilePath } from '../src/server/paths'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mastermind-test-'))
  process.env.MASTERMIND_CONFIG_DIR = tmpDir
})

afterEach(() => {
  delete process.env.MASTERMIND_CONFIG_DIR
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('statefile', () => {
  it('round-trips a server state', () => {
    const state = { port: 5173, pid: 12345, version: '0.1.0', startedAt: 1700000000000 }
    writeServerState(state)
    expect(readServerState()).toEqual(state)
  })

  it('returns null when missing', () => {
    expect(readServerState()).toBeNull()
  })

  it('returns null on corrupt JSON', () => {
    fs.mkdirSync(tmpDir, { recursive: true })
    fs.writeFileSync(stateFilePath(), '{not json')
    expect(readServerState()).toBeNull()
  })

  it('returns null on wrong shape', () => {
    fs.writeFileSync(stateFilePath(), JSON.stringify({ port: 'nope' }))
    expect(readServerState()).toBeNull()
  })

  it('clears unconditionally', () => {
    writeServerState({ port: 1, pid: 2, version: 'x', startedAt: 3 })
    clearServerState()
    expect(readServerState()).toBeNull()
  })

  it('clearServerState(pid) leaves a newer daemon state alone', () => {
    writeServerState({ port: 1, pid: 999, version: 'x', startedAt: 3 })
    clearServerState(111) // someone else's pid
    expect(readServerState()?.pid).toBe(999)
  })

  it('clearServerState(pid) removes its own state', () => {
    writeServerState({ port: 1, pid: 111, version: 'x', startedAt: 3 })
    clearServerState(111)
    expect(readServerState()).toBeNull()
  })
})
