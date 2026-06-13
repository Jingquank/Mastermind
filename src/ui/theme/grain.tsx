import type { GrainIntensity, GrainTexture, ThemeInfo } from '../../shared/types'

/**
 * Film-grain presets, shared by the live overlay (ThemeProvider) and the
 * settings glyphs (SettingsPanel) so both agree on what each step renders.
 *
 * Intensity scales the theme's authored base opacity; texture swaps the
 * feTurbulence parameters. Keeping these here means the swatch a user picks in
 * settings is the exact same filter that paints the page.
 */

/** Multiplier applied to the theme's base grain opacity, per step. */
export const INTENSITY_SCALE: Record<GrainIntensity, number> = {
  off: 0,
  low: 0.5,
  medium: 1,
  high: 1.7,
}

/** feTurbulence parameters per texture. Higher baseFrequency → finer, denser grain. */
export const TEXTURES: Record<GrainTexture, { baseFrequency: number; numOctaves: number; type: 'fractalNoise' | 'turbulence' }> = {
  fine: { baseFrequency: 0.85, numOctaves: 2, type: 'fractalNoise' },
  soft: { baseFrequency: 0.55, numOctaves: 2, type: 'fractalNoise' },
  coarse: { baseFrequency: 0.4, numOctaves: 3, type: 'turbulence' },
}

export const INTENSITY_STEPS: GrainIntensity[] = ['off', 'low', 'medium', 'high']
export const TEXTURE_STEPS: GrainTexture[] = ['fine', 'soft', 'coarse']

export interface GrainSettings {
  intensity: GrainIntensity
  texture: GrainTexture
}

/**
 * Resolve the effective grain from the theme default plus the user's per-theme
 * override. Honors the legacy `enabled` boolean from configs written before the
 * stepped controls existed (true → medium, false → off).
 */
export function resolveGrain(
  theme: ThemeInfo | undefined,
  override: { enabled?: boolean; intensity?: GrainIntensity; texture?: GrainTexture } | undefined,
): GrainSettings {
  const themeOn = theme?.grain?.enabled ?? false
  let intensity: GrainIntensity
  if (override?.intensity) intensity = override.intensity
  else if (override?.enabled === true) intensity = 'medium'
  else if (override?.enabled === false) intensity = 'off'
  else intensity = themeOn ? 'medium' : 'off'
  return { intensity, texture: override?.texture ?? 'fine' }
}

/**
 * A self-illustrating swatch: real feTurbulence noise at the given texture,
 * shown at a cosmetic display opacity. Each instance needs a document-unique
 * `id` (SVG filter ids are global).
 */
export function GrainSwatch({ id, texture, opacity }: { id: string; texture: GrainTexture; opacity: number }) {
  const tx = TEXTURES[texture]
  return (
    <svg width={17} height={17} viewBox="0 0 17 17" aria-hidden focusable={false}>
      <filter id={id} x="0" y="0" width="100%" height="100%">
        <feTurbulence type={tx.type} baseFrequency={tx.baseFrequency} numOctaves={tx.numOctaves} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect x={1} y={1} width={15} height={15} rx={3} filter={`url(#${id})`} opacity={opacity} />
    </svg>
  )
}

/** The "off" step: an empty tile with a slash, following the line-glyph aesthetic. */
export function GrainOffGlyph() {
  return (
    <svg width={17} height={17} viewBox="0 0 17 17" aria-hidden focusable={false}>
      <rect x={1} y={1} width={15} height={15} rx={3} fill="none" stroke="currentColor" strokeOpacity={0.35} />
      <line x1={3.5} y1={13.5} x2={13.5} y2={3.5} stroke="currentColor" strokeWidth={1.2} />
    </svg>
  )
}
