/**
 * App-level font registry DATA — the single source of truth for typeface selection.
 *
 * Isomorphic / browser-safe (pure data + lookups, no DOM, no asset imports) so the
 * CLI can list type sets for the setup picker. The DOM/asset side — the `@font-face`
 * URL table (`FONT_FACES`) and the CSS font-family stack builders — lives in
 * src/ui/theme/fonts.ts and re-exports these.
 *
 * Font choice is a cross-theme USER preference (like font size); it overrides the
 * --font-* tokens at runtime rather than living in any one theme.json.
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

export function typeSetById(id: string | undefined): TypeSet {
  return TYPE_SETS.find((s) => s.id === id) ?? TYPE_SETS[0]!
}
export function monoById(id: string | undefined): MonoFont {
  return MONO_FONTS.find((m) => m.id === id) ?? MONO_FONTS[0]!
}
