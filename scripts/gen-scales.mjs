// One-shot generator (NOT committed): emits 12-step OKLCH gray+accent scales per
// theme, anchored to the existing Swiss values so the look is preserved, then
// writes each themes/<id>/tokens.css. Also prints a round-trip + WCAG check.
import { writeFileSync } from 'node:fs'

/* ---------- sRGB hex <-> OKLCH ---------- */
const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lin2srgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)
function hex2oklch(hex) {
  const h = hex.replace('#', '')
  const r = srgb2lin(parseInt(h.slice(0, 2), 16) / 255)
  const g = srgb2lin(parseInt(h.slice(2, 4), 16) / 255)
  const b = srgb2lin(parseInt(h.slice(4, 6), 16) / 255)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  let H = (Math.atan2(B, A) * 180) / Math.PI
  if (H < 0) H += 360
  return { l: L, c: Math.hypot(A, B), h: H }
}
function oklch2rgb({ l: L, c: C, h: H }) {
  const a = C * Math.cos((H * Math.PI) / 180)
  const b = C * Math.sin((H * Math.PI) / 180)
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const r = lin2srgb(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_)
  const g = lin2srgb(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_)
  const bch = lin2srgb(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_)
  return [r, g, bch].map((x) => Math.max(0, Math.min(1, x)))
}
const oklch2hex = (lch) =>
  '#' + oklch2rgb(lch).map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')
const lum = (lch) => {
  const [r, g, b] = oklch2rgb(lch) // already linear-ish? no, these are srgb 0..1
  const lin = [r, g, b].map(srgb2lin)
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}
const contrast = (a, b) => {
  const la = lum(a),
    lb = lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
const r3 = (n) => Math.round(n * 1000) / 1000
const fmt = ({ l, c, h }) => `oklch(${r3(l)} ${r3(c)} ${r3(h)})`

/* ---------- ramps ---------- */
const lerp = (a, b, t) => a + (b - a) * t
// chroma curve for the accent scale (relative to the anchored accent chroma), peak at step 9
const ACC_CURVE = [0.09, 0.16, 0.28, 0.4, 0.53, 0.66, 0.79, 0.9, 1.0, 0.97, 0.9, 0.74]
const ACC_L_LIGHT = [0.984, 0.968, 0.943, 0.913, 0.877, 0.832, 0.776, 0.702, null, 0.552, null, 0.353]
const ACC_L_DARK = [0.205, 0.245, 0.3, 0.36, 0.42, 0.485, 0.56, 0.65, null, 0.74, null, 0.93]

function buildGray(anchors, accentH, mode) {
  // anchors: {index(1-based): hex}; interpolate the gaps in L; small chroma tint toward accentH
  const idx = Object.keys(anchors).map(Number).sort((a, b) => a - b)
  const known = {}
  for (const i of idx) known[i] = hex2oklch(anchors[i])
  const tintC = mode === 'light' ? 0.004 : 0.006
  const out = []
  for (let i = 1; i <= 12; i++) {
    if (known[i]) {
      out.push(known[i]) // anchored = exact current value (lossless)
      continue
    }
    let lo = idx.filter((k) => k < i).pop()
    let hi = idx.find((k) => k > i)
    const t = (i - lo) / (hi - lo)
    out.push({ l: lerp(known[lo].l, known[hi].l, t), c: tintC, h: accentH })
  }
  return out
}
function buildAccent(accentHex, dimHex, mode) {
  const a9 = hex2oklch(accentHex)
  const a11 = hex2oklch(dimHex)
  const Lr = mode === 'light' ? ACC_L_LIGHT : ACC_L_DARK
  const out = []
  for (let i = 0; i < 12; i++) {
    if (i === 8) out.push(a9)
    else if (i === 10) out.push(a11)
    else out.push({ l: Lr[i], c: a9.c * ACC_CURVE[i], h: a9.h })
  }
  return out
}

/* ---------- per-theme definitions (anchored to current tokens.css) ---------- */
const THEMES = {
  grid: {
    mode: 'light',
    gray: { 1: '#fcfcfa', 2: '#f2f2ef', 6: '#e2e1db', 10: '#9a968c', 11: '#66665f', 12: '#141414' },
    accent: '#e5241b',
    dim: '#c01a12',
    lit: {
      '--color-on-accent': '#ffffff',
      '--color-cta-bg': 'var(--accent-9)',
      '--color-cta-text': '#ffffff',
      '--focus-ring': 'var(--gray-12)',
      '--color-selection': 'color-mix(in oklab, var(--color-text) 12%, transparent)',
      '--color-accent-surface': 'color-mix(in oklab, var(--color-accent) 10%, transparent)',
      '--color-invert-bg': '#141414',
      '--color-invert-bg-elevated': '#1f1f1e',
      '--color-invert-text': '#f4f4f1',
      '--color-invert-text-muted': 'rgba(244, 244, 241, 0.66)',
      '--color-invert-border': 'rgba(244, 244, 241, 0.16)',
    },
    review: {
      '--review-insert-text': '#1b7a35',
      '--review-insert-bg': 'rgba(27, 122, 53, 0.1)',
      '--review-insert-border': '#1b7a35',
      '--review-delete-text': '#a23618',
      '--review-delete-bg': 'rgba(162, 54, 24, 0.1)',
      '--review-delete-border': 'rgba(162, 54, 24, 0.45)',
      '--review-highlight-bg': 'rgba(224, 176, 18, 0.22)',
      '--review-highlight-border': 'rgba(224, 176, 18, 0.55)',
      '--review-comment-anchor': '#2f5fd0',
      '--review-comment-active-bg': 'rgba(47, 95, 208, 0.1)',
    },
    scheme: 'light',
    note: 'Swiss International — Grid (light, red flagship). The default theme.',
  },
  nacht: {
    mode: 'dark',
    gray: { 1: '#0e0f12', 2: '#16181c', 6: '#292a2d', 10: '#67686b', 11: '#989a9c', 12: '#eceef2' },
    accent: '#3d7dff',
    dim: '#7aa6ff',
    lit: {
      '--color-on-accent': '#06122e',
      '--color-cta-bg': 'var(--accent-9)',
      '--color-cta-text': '#06122e',
      '--focus-ring': 'var(--accent-8)',
      '--color-selection': 'color-mix(in oklab, var(--color-text) 16%, transparent)',
      '--color-accent-surface': 'color-mix(in oklab, var(--color-accent) 16%, transparent)',
      '--color-invert-bg': '#f4f4f1',
      '--color-invert-bg-elevated': '#ffffff',
      '--color-invert-text': '#141414',
      '--color-invert-text-muted': 'rgba(20, 20, 20, 0.62)',
      '--color-invert-border': 'rgba(20, 20, 20, 0.14)',
    },
    review: {
      '--review-insert-text': '#4fc76e',
      '--review-insert-bg': 'rgba(79, 199, 110, 0.16)',
      '--review-insert-border': '#4fc76e',
      '--review-delete-text': '#f0664a',
      '--review-delete-bg': 'rgba(240, 102, 74, 0.16)',
      '--review-delete-border': 'rgba(240, 102, 74, 0.5)',
      '--review-highlight-bg': 'rgba(232, 190, 58, 0.2)',
      '--review-highlight-border': 'rgba(232, 190, 58, 0.55)',
      '--review-comment-anchor': '#9a86ff',
      '--review-comment-active-bg': 'rgba(154, 134, 255, 0.16)',
    },
    scheme: 'dark',
    note: 'Swiss International — Nacht (dark, electric blue).',
  },
  sepia: {
    mode: 'light',
    gray: { 1: '#f1ece0', 2: '#f8f4ea', 6: '#dcd5c6', 10: '#9a9082', 11: '#6e655a', 12: '#1e1813' },
    accent: '#c8841c',
    dim: '#8a5a0c',
    lit: {
      '--color-on-accent': '#2a1b06',
      '--color-cta-bg': 'var(--gray-12)',
      '--color-cta-text': 'var(--gray-1)',
      '--focus-ring': 'var(--gray-12)',
      '--color-selection': 'color-mix(in oklab, var(--color-text) 12%, transparent)',
      '--color-accent-surface': 'color-mix(in oklab, var(--color-accent) 14%, transparent)',
      '--color-invert-bg': '#1e1813',
      '--color-invert-bg-elevated': '#2a231b',
      '--color-invert-text': '#f4efe4',
      '--color-invert-text-muted': 'rgba(244, 239, 228, 0.66)',
      '--color-invert-border': 'rgba(244, 239, 228, 0.16)',
    },
    review: {
      '--review-insert-text': '#2c7a3f',
      '--review-insert-bg': 'rgba(44, 122, 63, 0.12)',
      '--review-insert-border': '#2c7a3f',
      '--review-delete-text': '#a8431f',
      '--review-delete-bg': 'rgba(168, 67, 31, 0.12)',
      '--review-delete-border': 'rgba(168, 67, 31, 0.45)',
      '--review-highlight-bg': 'rgba(168, 150, 40, 0.24)',
      '--review-highlight-border': 'rgba(168, 150, 40, 0.6)',
      '--review-comment-anchor': '#345fc0',
      '--review-comment-active-bg': 'rgba(52, 95, 192, 0.12)',
    },
    scheme: 'light',
    note: 'Swiss International — Sepia (warm paper, ochre).',
  },
}

for (const [id, def] of Object.entries(THEMES)) {
  const accentH = hex2oklch(def.accent).h
  const gray = buildGray(def.gray, accentH, def.mode)
  const accent = buildAccent(def.accent, def.dim, def.mode)
  const grayLines = gray.map((s, i) => `  --gray-${i + 1}: ${fmt(s)};`).join('\n')
  const accentLines = accent.map((s, i) => `  --accent-${i + 1}: ${fmt(s)};`).join('\n')
  const litLines = Object.entries(def.lit).map(([k, v]) => `  ${k}: ${v};`).join('\n')
  const reviewLines = Object.entries(def.review).map(([k, v]) => `  ${k}: ${v};`).join('\n')

  const css = `[data-theme='${id}'] {
  /* ${def.note}
     v0.4: Radix-rigor 12-step OKLCH scales (anchored to the v0.3 Swiss values),
     with semantic tokens mapped onto the steps. Marks stay hand-tuned. */

  /* ---- Layer 1: raw scales (values differ per theme) ---- */
${grayLines}
${accentLines}

  /* ---- Layer 2: semantic mapping (identical names across all themes) ---- */
  --color-bg: var(--gray-1);
  --color-bg-elevated: var(--gray-2);
  --color-text: var(--gray-12);
  --color-text-muted: var(--gray-11);
  --color-text-faint: var(--gray-10);
  --color-border: var(--gray-6);
  --color-border-hover: var(--gray-7);
  --color-accent: var(--accent-9);
  --color-accent-dim: var(--accent-11);
${litLines}

  /* ---- Layer 3: review / mark semantics (hand-tuned, de-conflicted from accent) ---- */
${reviewLines}

  color-scheme: ${def.scheme};
}
`
  writeFileSync(new URL(`../themes/${id}/tokens.css`, import.meta.url), css)

  // ---- verification ----
  console.log(`\n=== ${id} (${def.mode}) ===`)
  for (const i of Object.keys(def.gray)) {
    const want = def.gray[i].toLowerCase()
    const got = oklch2hex(gray[i - 1]).toLowerCase()
    console.log(`  gray-${i}: want ${want}  got ${got}  ${want === got ? 'OK' : '~'}`)
  }
  console.log(`  accent-9: want ${def.accent}  got ${oklch2hex(accent[8])}`)
  console.log(`  accent-11: want ${def.dim}  got ${oklch2hex(accent[10])}`)
  const bg = gray[0],
    bgE = gray[1]
  console.log(`  CONTRAST muted/bg:  ${r3(contrast(gray[10], bg))}  (need >=4.5)`)
  console.log(`  CONTRAST text/bg:   ${r3(contrast(gray[11], bg))}  (need >=7)`)
  console.log(`  CONTRAST accent11/bg:    ${r3(contrast(accent[10], bg))}  (need >=4.5)`)
  console.log(`  CONTRAST accent11/bgElev:${r3(contrast(accent[10], bgE))}  (need >=4.5)`)
  console.log(`  CONTRAST faint/bg:  ${r3(contrast(gray[9], bg))}  (decorative ~3)`)
}
console.log('\nwrote themes/{grid,nacht,sepia}/tokens.css')
