import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveWithin } from '../src/server/contain'
import { createApp } from '../src/server/app'
import { AssistRegistry } from '../src/server/assist/index'
import { SessionRegistry } from '../src/server/sessions'
import { WorkspaceRegistry } from '../src/server/workspaces'
import type { CreateWorkspaceResponse, FileMeta, TreeResponse } from '../src/shared/types'

/**
 * The whole open-source story rests on containment: a traversal or symlink
 * escape turns this localhost tool into an arbitrary-file-read server. This is
 * the dedicated security battery for resolveWithin() and the routes that use it.
 */

let raw: string
let root: string // realpath of the workspace root
let outsideDir: string
let outsideFile: string
let evilSibling: string

beforeEach(() => {
  raw = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-ws-'))
  root = fs.realpathSync(raw) // mirror the route: macOS /tmp is itself a symlink

  fs.writeFileSync(path.join(root, 'a.md'), '# A\n\nHi {>>a note<<} there {++added++}.\n')
  fs.writeFileSync(path.join(root, 'plain.txt'), 'not markdown\n')
  fs.mkdirSync(path.join(root, 'sub'))
  fs.writeFileSync(path.join(root, 'sub', 'b.md'), '# B\n')
  fs.mkdirSync(path.join(root, 'node_modules'))
  fs.writeFileSync(path.join(root, 'node_modules', 'pkg.md'), '# dep\n')
  fs.mkdirSync(path.join(root, '.git'))
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=1\n')

  // a sibling with a shared name prefix — the classic startsWith() footgun
  evilSibling = `${root}-evil`
  fs.mkdirSync(evilSibling)
  fs.writeFileSync(path.join(evilSibling, 'secret.md'), '# sibling secret\n')

  // a file genuinely outside the root
  outsideDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mm-out-')))
  outsideFile = path.join(outsideDir, 'secret.md')
  fs.writeFileSync(outsideFile, '# outside secret\n')

  // symlinks: one contained, one escaping to a file, one escaping to the sibling dir
  fs.symlinkSync(path.join(root, 'sub', 'b.md'), path.join(root, 'link-in'))
  fs.symlinkSync(outsideFile, path.join(root, 'link-out'))
  fs.symlinkSync(evilSibling, path.join(root, 'sibling-link'))
})

afterEach(() => {
  fs.rmSync(raw, { recursive: true, force: true })
  fs.rmSync(evilSibling, { recursive: true, force: true })
  fs.rmSync(outsideDir, { recursive: true, force: true })
})

describe('resolveWithin', () => {
  it('resolves a normal file inside the root', async () => {
    expect(await resolveWithin(root, 'a.md')).toBe(path.join(root, 'a.md'))
  })

  it('resolves a nested file', async () => {
    expect(await resolveWithin(root, 'sub/b.md')).toBe(path.join(root, 'sub', 'b.md'))
  })

  it("treats '' and '.' as the root itself", async () => {
    expect(await resolveWithin(root, '')).toBe(root)
    expect(await resolveWithin(root, '.')).toBe(root)
  })

  it('resolves dotfiles (hiding is the route’s job, not containment’s)', async () => {
    expect(await resolveWithin(root, '.env')).toBe(path.join(root, '.env'))
  })

  it('BLOCKS a leading-.. traversal', async () => {
    expect(await resolveWithin(root, '../secret.md')).toBeNull()
    expect(await resolveWithin(root, '..')).toBeNull()
    expect(await resolveWithin(root, 'sub/../../etc/hosts')).toBeNull()
  })

  it('BLOCKS an absolute path injection', async () => {
    expect(await resolveWithin(root, '/etc/passwd')).toBeNull()
    expect(await resolveWithin(root, outsideFile)).toBeNull()
  })

  it('BLOCKS a sibling-prefix escape via symlink', async () => {
    // sibling-link -> <root>-evil ; without the trailing-sep guard this would
    // pass a naive startsWith(root) check
    expect(await resolveWithin(root, 'sibling-link/secret.md')).toBeNull()
  })

  it('BLOCKS a symlink pointing outside the root', async () => {
    expect(await resolveWithin(root, 'link-out')).toBeNull()
  })

  it('ALLOWS a symlink that resolves back inside the root', async () => {
    expect(await resolveWithin(root, 'link-in')).toBe(path.join(root, 'sub', 'b.md'))
  })

  it('returns null for a nonexistent path (ENOENT)', async () => {
    expect(await resolveWithin(root, 'nope.md')).toBeNull()
  })
})

describe('workspace routes (containment wired end-to-end)', () => {
  let app: ReturnType<typeof createApp>
  const HOST = { host: '127.0.0.1' }

  beforeEach(() => {
    const sessions = new SessionRegistry({ graceMs: 50_000, neverOpenedMs: 50_000 })
    app = createApp({
      registry: sessions,
      workspaces: new WorkspaceRegistry(),
      assist: new AssistRegistry(sessions, 1000),
      version: 'test',
      startedAt: 0,
      requestShutdown: () => {},
      touch: () => {},
    })
  })

  async function openWorkspace(): Promise<string> {
    const res = await app.request('/api/workspaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...HOST },
      body: JSON.stringify({ root }),
    })
    expect(res.status).toBe(200)
    return ((await res.json()) as CreateWorkspaceResponse).workspaceId
  }

  it('lists one level, hiding node_modules / .git / dotfiles and escaping symlinks', async () => {
    const wid = await openWorkspace()
    const res = await app.request(`/api/workspaces/${wid}/tree`, { headers: HOST })
    expect(res.status).toBe(200)
    const body = (await res.json()) as TreeResponse
    const names = body.entries.map((e) => e.name)
    expect(names).toContain('a.md')
    expect(names).toContain('sub')
    expect(names).toContain('plain.txt')
    expect(names).toContain('link-in') // contained symlink survives
    expect(names).not.toContain('node_modules')
    expect(names).not.toContain('.git')
    expect(names).not.toContain('.env')
    expect(names).not.toContain('link-out') // escaping symlink dropped
    expect(names).not.toContain('sibling-link')
    // directories sort first
    expect(body.entries[0]!.isDir).toBe(true)
    expect(body.entries.find((e) => e.name === 'a.md')!.isMarkdown).toBe(true)
    expect(body.entries.find((e) => e.name === 'plain.txt')!.isMarkdown).toBe(false)
  })

  it('rejects a traversal in the tree dir param (403)', async () => {
    const wid = await openWorkspace()
    const res = await app.request(`/api/workspaces/${wid}/tree?dir=${encodeURIComponent('../..')}`, { headers: HOST })
    expect(res.status).toBe(403)
  })

  it('returns review counts for a markdown file', async () => {
    const wid = await openWorkspace()
    const res = await app.request(`/api/workspaces/${wid}/file-meta?path=a.md`, { headers: HOST })
    expect(res.status).toBe(200)
    const meta = (await res.json()) as FileMeta
    expect(meta.counts).toEqual({ comments: 1, edits: 1, highlights: 0 })
  })

  it('rejects file-meta for a path outside the root (403)', async () => {
    const wid = await openWorkspace()
    for (const evil of ['../mm-out-x/secret.md', 'link-out', 'sibling-link/secret.md', '/etc/passwd']) {
      const res = await app.request(`/api/workspaces/${wid}/file-meta?path=${encodeURIComponent(evil)}`, {
        headers: HOST,
      })
      expect(res.status, `should block ${evil}`).toBe(403)
    }
  })

  it('404s an unknown workspace id', async () => {
    const res = await app.request('/api/workspaces/not-a-real-id/tree', { headers: HOST })
    expect(res.status).toBe(404)
  })
})
