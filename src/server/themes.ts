import fs from 'node:fs/promises'
import path from 'node:path'
import type { ThemeFontInfo, ThemeInfo } from '../shared/types'
import { log } from './log'
import { themesDir } from './paths'

interface ThemeJson {
  id?: string
  name?: string
  appearance?: string
  fonts?: Array<{ family?: string; src?: string; weight?: string | number }>
  grain?: { enabled?: boolean; opacity?: number; tintOpacity?: number }
}

/**
 * Font srcs in theme.json are theme-relative ("/fonts/X.woff2" lives in the
 * theme's own folder); an explicit "/themes/..." src may reference another
 * theme's files (Night borrows the Editorial faces).
 */
function resolveFontUrl(themeId: string, src: string): string {
  if (src.startsWith('/themes/')) return src
  return `/themes/${themeId}${src.startsWith('/') ? '' : '/'}${src}`
}

/** Scan themes/<id>/{theme.json,tokens.css}; dropping a folder in registers it. */
export async function scanThemes(): Promise<ThemeInfo[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(themesDir)
  } catch {
    return []
  }
  const out: ThemeInfo[] = []
  for (const id of entries.sort()) {
    const dir = path.join(themesDir, id)
    try {
      const st = await fs.stat(dir)
      if (!st.isDirectory()) continue
      const [jsonRaw] = await Promise.all([
        fs.readFile(path.join(dir, 'theme.json'), 'utf8'),
        fs.access(path.join(dir, 'tokens.css')), // both files required
      ])
      const parsed = JSON.parse(jsonRaw) as ThemeJson
      const fonts: ThemeFontInfo[] = []
      for (const f of parsed.fonts ?? []) {
        if (!f.family || !f.src) continue
        fonts.push({ family: f.family, url: resolveFontUrl(id, f.src), weight: f.weight ?? 400 })
      }
      out.push({
        id,
        name: parsed.name ?? id,
        appearance: parsed.appearance === 'dark' ? 'dark' : 'light',
        grain: parsed.grain
          ? { enabled: parsed.grain.enabled ?? false, opacity: parsed.grain.opacity, tintOpacity: parsed.grain.tintOpacity }
          : null,
        fonts,
      })
    } catch (err) {
      log(`theme ${id} skipped:`, err instanceof Error ? err.message : err)
    }
  }
  return out
}
