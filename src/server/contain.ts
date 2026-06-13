import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Resolve `rel` inside `rootReal` (an already-realpath'd directory), returning
 * the realpath of the target ONLY if it stays within the root. Returns null on
 * any escape, missing target, or lexical attack.
 *
 * This is the single containment chokepoint for the workspace file-tree. A
 * traversal or symlink escape here would turn a localhost markdown tool into an
 * arbitrary-file-read server, so it stacks two independent defenses:
 *
 *   1. Lexical (before touching disk): reject absolute paths and any leading
 *      `..` segment. Cheap, and it means a malicious `rel` never even reaches
 *      the filesystem.
 *   2. Physical: realpath the candidate — which *follows symlinks* — and require
 *      the result to be the root itself or live under `root + path.sep`. This is
 *      the same idiom static.ts uses; the trailing separator is what defeats the
 *      sibling-prefix attack (`/foo/bar` must not match `/foo/bar-evil`), and
 *      realpath is what defeats a symlink inside the root that points outside it.
 *
 * `rel === ''` (or '.') resolves to the root itself — the tree's top level.
 */
export async function resolveWithin(rootReal: string, rel: string): Promise<string | null> {
  // 1. lexical defense — never let an absolute path or `..` escape reach disk
  if (path.isAbsolute(rel)) return null
  const normalized = path.normalize(rel)
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) return null

  // 2. physical containment — realpath collapses symlinks to their true target,
  //    so a link pointing outside the root resolves there and fails the check
  let real: string
  try {
    real = await fs.realpath(path.resolve(rootReal, normalized))
  } catch {
    return null // ENOENT / EACCES / dangling symlink — treat as not found
  }
  if (real !== rootReal && !real.startsWith(rootReal + path.sep)) return null
  return real
}

/**
 * If `realPath` is inside `rootReal`, return its forward-slashed path relative
 * to the root ('' for the root itself); otherwise null. Both inputs must be
 * already-realpath'd. Used to map an open session back onto a workspace's tree.
 */
export function relWithin(rootReal: string, realPath: string): string | null {
  if (realPath === rootReal) return ''
  if (!realPath.startsWith(rootReal + path.sep)) return null
  return realPath.slice(rootReal.length + 1).split(path.sep).join('/')
}
