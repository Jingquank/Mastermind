/**
 * DOM/asset side of the font registry — the `@font-face` URL table and the CSS
 * font-family stack builders. The cross-theme DATA (type sets, mono fonts, ids,
 * lookups) lives in src/shared/fonts.ts and is re-exported here so existing
 * `theme/fonts` importers keep working unchanged.
 *
 * Every face is a self-hosted `.woff2` under /themes/… — local-first, no CDN at
 * runtime (the binaries were vendored in at build time). `@font-face` only fetches
 * a family once text actually renders in it, so unselected sets cost nothing.
 */

import type { FontFace, MonoFont, TypeSet } from '../../shared/fonts'

export * from '../../shared/fonts'

const SANS_FALLBACK = 'system-ui, -apple-system, sans-serif'
const SERIF_FALLBACK = 'Georgia, Cambria, "Times New Roman", serif'
const MONO_FALLBACK = 'ui-monospace, SFMono-Regular, Menlo, monospace'

/** Every bundled face. Schibsted Grotesk + Geist Mono ship with the grid theme; the rest live in /themes/fonts/. */
export const FONT_FACES: FontFace[] = [
  { family: 'Schibsted Grotesk', url: '/themes/grid/fonts/SchibstedGrotesk-Variable.woff2', weight: '400 900' },
  { family: 'Geist Mono', url: '/themes/grid/fonts/GeistMono-Variable.woff2', weight: '100 900' },
  { family: 'Geist', url: '/themes/fonts/GeistSans-Variable.woff2', weight: '100 900' },
  { family: 'Bricolage Grotesque', url: '/themes/fonts/BricolageGrotesque-Variable.woff2', weight: '200 800' },
  { family: 'Inter', url: '/themes/fonts/Inter-Variable.woff2', weight: '100 900' },
  { family: 'Lora', url: '/themes/fonts/Lora-Variable.woff2', weight: '400 700' },
  { family: 'Crimson Pro', url: '/themes/fonts/CrimsonPro-Variable.woff2', weight: '200 900' },
  { family: 'Manrope', url: '/themes/fonts/Manrope-Variable.woff2', weight: '200 800' },
  { family: 'Outfit', url: '/themes/fonts/Outfit-Variable.woff2', weight: '100 900' },
  { family: 'JetBrains Mono', url: '/themes/fonts/JetBrainsMono-Variable.woff2', weight: '100 800' },
  { family: 'Spline Sans Mono', url: '/themes/fonts/SplineSansMono-Variable.woff2', weight: '300 700' },
  { family: 'Ubuntu Sans Mono', url: '/themes/fonts/UbuntuSansMono-Variable.woff2', weight: '100 800' },
]

const SERIF_FAMILIES = new Set(['Lora', 'Crimson Pro'])

function stack(family: string, fallback: string): string {
  return `'${family}', ${fallback}`
}

export function displayStack(set: TypeSet): string {
  return stack(set.displayFamily, SERIF_FAMILIES.has(set.displayFamily) ? SERIF_FALLBACK : SANS_FALLBACK)
}
export function bodyStack(set: TypeSet): string {
  return stack(set.bodyFamily, SERIF_FAMILIES.has(set.bodyFamily) ? SERIF_FALLBACK : SANS_FALLBACK)
}
export function monoStack(m: MonoFont): string {
  return stack(m.family, MONO_FALLBACK)
}
