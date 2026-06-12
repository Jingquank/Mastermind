import fs from 'node:fs/promises'
import path from 'node:path'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}

/**
 * Serve `relPath` from inside `root`, or return null when missing/escaping.
 * Hand-rolled (rather than serveStatic middleware) so cwd never matters and
 * traversal is contained explicitly.
 */
export async function serveFile(
  root: string,
  relPath: string,
  cache: 'immutable' | 'no-cache' | 'no-store' = 'no-cache',
): Promise<Response | null> {
  const abs = path.normalize(path.join(root, relPath))
  if (abs !== root && !abs.startsWith(root + path.sep)) return null
  let data: Buffer
  try {
    data = await fs.readFile(abs)
  } catch {
    return null
  }
  const headers: Record<string, string> = {
    'content-type': MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream',
    'cache-control':
      cache === 'immutable' ? 'public, max-age=31536000, immutable' : cache === 'no-store' ? 'no-store' : 'no-cache',
  }
  return new Response(new Uint8Array(data), { status: 200, headers })
}
