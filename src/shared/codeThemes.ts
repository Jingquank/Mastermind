/**
 * Code-color schemes — a cross-theme USER preference, exactly like the font
 * registry (`fonts.ts`). The reading view's code blocks are normally monochrome
 * (the document body reserves color for CriticMarkup review marks); turning on a
 * scheme is an explicit opt-in that paints syntax tokens via `--code-*` CSS
 * variables, set at runtime by `ThemeProvider`.
 *
 * Isomorphic / browser-safe (pure data + lookups, no DOM) so the CLI can list the
 * schemes for the setup picker; re-exported from src/ui/theme/codeThemes.ts.
 *
 * Each scheme carries a `light` and `dark` palette so the same choice reads well
 * on the light (grid / sepia) and dark (nacht) app themes — selection keys off the
 * active theme's `appearance`. `none` keeps the current uncolored look.
 *
 * `tokenize()` (./highlight) emits exactly these seven colorable token types;
 * `text` falls through to the base `--color-text`.
 */

import type { HlToken } from './highlight'

export type ColorTok = Exclude<HlToken['type'], 'text'>
export const COLOR_TOKS: ColorTok[] = ['comment', 'keyword', 'string', 'number', 'function', 'property', 'constant']

type Appearance = 'light' | 'dark'
type Palette = Record<ColorTok, string>

export interface CodeTheme {
  id: string
  name: string
  /** null → no coloring (the default, current behavior) */
  palettes: Record<Appearance, Palette> | null
}

export const CODE_THEMES: CodeTheme[] = [
  { id: 'none', name: 'None', palettes: null },
  {
    // low-saturation, editorial — quietest of the three
    id: 'soft',
    name: 'Soft',
    palettes: {
      light: { comment: '#9aa0a6', keyword: '#9a6fb0', string: '#5f8a5f', number: '#b0844f', function: '#5a86b8', property: '#6b7785', constant: '#b06a6a' },
      dark: { comment: '#6f757d', keyword: '#c4a7e7', string: '#a3c9a8', number: '#e0bb7a', function: '#8fb6e8', property: '#aab4c0', constant: '#e0a0a0' },
    },
  },
  {
    // the One Light / One Dark palette — balanced and widely loved
    id: 'vivid',
    name: 'Vivid',
    palettes: {
      light: { comment: '#a0a1a7', keyword: '#a626a4', string: '#50a14f', number: '#986801', function: '#4078f2', property: '#e45649', constant: '#986801' },
      dark: { comment: '#7f848e', keyword: '#c678dd', string: '#98c379', number: '#d19a66', function: '#61afef', property: '#e06c75', constant: '#d19a66' },
    },
  },
  {
    // warm / earthy (Gruvbox) — pairs naturally with the sepia theme
    id: 'warm',
    name: 'Warm',
    palettes: {
      light: { comment: '#a89984', keyword: '#9d0006', string: '#79740e', number: '#8f3f71', function: '#b57614', property: '#076678', constant: '#8f3f71' },
      dark: { comment: '#928374', keyword: '#fb4934', string: '#b8bb26', number: '#d3869b', function: '#fabd2f', property: '#83a598', constant: '#d3869b' },
    },
  },
]

export const DEFAULT_CODE_THEME = 'none'

export function codeThemeById(id: string | undefined): CodeTheme {
  return CODE_THEMES.find((c) => c.id === id) ?? CODE_THEMES[0]!
}

/** The `--code-*` custom properties for a scheme on a given appearance, or null for `none`. */
export function codeThemeVars(theme: CodeTheme, appearance: Appearance): Record<string, string> | null {
  const pal = theme.palettes?.[appearance]
  if (!pal) return null
  return Object.fromEntries(COLOR_TOKS.map((tok) => [`--code-${tok}`, pal[tok]]))
}
