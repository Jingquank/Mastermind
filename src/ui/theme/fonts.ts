/**
 * App-level font registry — the single source of truth for typeface selection.
 *
 * Font choice is a cross-theme USER preference (like font size), so it lives here
 * and overrides the --font-* tokens at runtime, rather than in any one theme.json.
 * Every face is a self-hosted `.woff2` under /themes/… — local-first, no CDN at
 * runtime (the binaries were vendored in at build time). `@font-face` only fetches
 * a family once text actually renders in it, so unselected sets cost nothing.
 */

export interface FontFace {
  family: string
  url: string
  /** CSS font-weight descriptor — a range for variable faces, a single value for static. */
  weight: string
}

export interface TypeSet {
  id: string
  name: string
  displayFamily: string
  /** display weight → --weight-bold (Fraunces wants less than Schibsted's 800) */
  displayWeight: number
  /** display letter-spacing → --ls-heading */
  displayTracking: string
  bodyFamily: string
}

export interface MonoFont {
  id: string
  name: string
  family: string
}

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

/** Curated display+body pairings. `grid` is the default and matches the base tokens. */
export const TYPE_SETS: TypeSet[] = [
  { id: 'grid', name: 'Grid', displayFamily: 'Schibsted Grotesk', displayWeight: 800, displayTracking: '-0.02em', bodyFamily: 'Schibsted Grotesk' },
  { id: 'geist', name: 'Geist', displayFamily: 'Geist', displayWeight: 700, displayTracking: '-0.02em', bodyFamily: 'Geist' },
  { id: 'bricolage', name: 'Bricolage', displayFamily: 'Bricolage Grotesque', displayWeight: 700, displayTracking: '-0.02em', bodyFamily: 'Inter' },
  { id: 'lora', name: 'Lora', displayFamily: 'Lora', displayWeight: 600, displayTracking: '-0.01em', bodyFamily: 'Lora' },
  { id: 'crimson', name: 'Crimson', displayFamily: 'Crimson Pro', displayWeight: 600, displayTracking: '0', bodyFamily: 'Crimson Pro' },
  { id: 'manrope', name: 'Manrope', displayFamily: 'Manrope', displayWeight: 700, displayTracking: '-0.02em', bodyFamily: 'Manrope' },
  { id: 'outfit', name: 'Outfit', displayFamily: 'Outfit', displayWeight: 700, displayTracking: '-0.02em', bodyFamily: 'Outfit' },
]

export const MONO_FONTS: MonoFont[] = [
  { id: 'geist', name: 'Geist Mono', family: 'Geist Mono' },
  { id: 'jetbrains', name: 'JetBrains Mono', family: 'JetBrains Mono' },
  { id: 'spline', name: 'Spline Sans Mono', family: 'Spline Sans Mono' },
  { id: 'ubuntu', name: 'Ubuntu Sans Mono', family: 'Ubuntu Sans Mono' },
]

export const DEFAULT_TYPE_SET = 'grid'
export const DEFAULT_MONO = 'geist'

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

export function typeSetById(id: string | undefined): TypeSet {
  return TYPE_SETS.find((s) => s.id === id) ?? TYPE_SETS[0]!
}
export function monoById(id: string | undefined): MonoFont {
  return MONO_FONTS.find((m) => m.id === id) ?? MONO_FONTS[0]!
}
