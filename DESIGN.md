# Mastermind design system

> Swiss International, in service of reading. The token NAMES are the schema every theme satisfies; components reference `var(--*)` only — no hardcoded values outside themes/*/tokens.css. **Grid** (light) is the reference theme.

## Tokens (Grid, the reference)

- Surfaces: `--color-bg #FCFCFA` (off-white paper), `--color-bg-elevated #F2F2EF` (chrome: top bar, navigator, panels — a hair cooler than paper), hairline `--color-border #E2E1DB`.
- Text: `--color-text #141414`, muted `#66665F` (AA at 11px metadata), faint `#9A968C` (**decorative/placeholders only** — below AA for text).
- Accent family (**chrome only** — CTA / active / focus, never document ink): `--color-accent #E5241B` (Swiss red), text-safe `--color-accent-dim #C01A12` (AA on bg), wash `--color-accent-surface`, CTA = red pill with white ink. Per theme: Nacht = electric blue, Sepia = ochre (ink-pill CTA).
- `--focus-ring`: ink on light themes, the accent on Nacht. `--color-selection`: neutral ink wash — selected text must not read as an insertion.
- Inversion family (the dark-band device — the selection toolbar): `--color-invert-bg #141414` etc. (light themes invert to dark; Nacht inverts to light).
- Review semantics: `--review-insert-*` (green), `--review-delete-*` (brick, kept browner than the accent red), `--review-highlight-*` (gold), `--review-comment-anchor` (blue dotted underline; **violet on Nacht** so it doesn't collide with the blue accent), `--review-comment-active-bg`. Marks are the only color in the document; the accent stays in the chrome.

## Typography

- One grotesque carries everything: **Schibsted Grotesk** (variable, OFL). Display = weight 800, line-height ~1.08, sentence case (the Swiss voice is weight + tight tracking, not caps), h1–h3.
- Body: Schibsted Grotesk, 16px base, line-height 1.6 for long-form; don't go below 14px (`--font-size-sm`); micro = 11px for labels only.
- Mono: Geist Mono for filenames, code, CriticMarkup source.
- Letterspacing: tight negative on display (−0.02em), +0.06em caps on buttons/toggles, +0.08em on eyebrow labels.

## Shape & layout

- Radius ceiling 4px (`--radius-md`); 2px (`--radius-xs`) for chips; `--radius-full` only for circular elements (the 6px dirty dot).
- Reading measure: `--content-max-width` 46rem (~736px), centered. Right margin rail for comment cards.
- Spacing scale: 4px base, steps ×1,2,3,4,6,8,12,16,24.

## Iconography

- Tiny stroke SVGs on currentColor (src/ui/icons.tsx), 1.5px strokes. Never emoji or dingbat glyphs in chrome.

## Component treatments

- Top bar: elevated surface, bottom hairline; filename in mono sm; dirty indicator = 6px accent dot.
- Primary CTA ("Save & hand back"): dark pill, green ink, uppercase, `--ls-caps`.
- Secondary/ghost buttons + view-mode toggle: muted ink, active segment gains text color + elevated fill.
- Selection toolbar: the dark band device miniaturized (invert-bg surface, invert-text ink).
- Focus ring: 2px `--color-accent`, offset 2px — the one sanctioned green outline.
- Optional film grain overlay (feTurbulence, multiply, 0.12) per theme.

## Themes

Theme = `themes/<id>/theme.json` + `tokens.css`; the token names above are the contract. Ships: **grid** (light, Swiss red — the reference/default), **nacht** (dark, electric blue), **sepia** (warm paper, ochre). All flat (grain off by default). Fonts live in `themes/grid/fonts/` and the other themes reference them by absolute `/themes/grid/fonts/…` URL.
