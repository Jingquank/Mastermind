# Mastermind design system

> Distilled from docs/spec/mastermind-theme-pinoc-editorial.md (the reference theme; its token set is the schema every theme satisfies). Components reference `var(--*)` only — no hardcoded values outside themes/*/tokens.css.

## Tokens (PINOC Editorial, the reference)

- Surfaces: `--color-bg #F3F0EB` (warm paper), `--color-bg-elevated #FAF9F6` (cards, popovers, top bar), hairline `--color-border #D5D3CE`.
- Text: `--color-text #1A1A1A`, muted `#6C675E` (AA at 11px metadata), faint `#918D85` (**decorative/placeholders only** — below AA for text).
- Accent family: `--color-accent #00E05A` (electric green — fills/washes/CTA ink only, never text on paper), text-safe `--color-accent-dim #006E30` (AA on bg and on the insert wash; the spec's original `#00B848` measured 2.32:1 and was retuned in the round-1 critique), wash `--color-accent-surface`, CTA = dark pill (`#1A1A1A`) with green ink.
- `--focus-ring`: ink on light themes, accent on Night (the green outline measured 1.56:1 on paper). `--color-selection`: neutral ink wash — selected text must not read as an insertion.
- Inversion family (dark-band devices, seeds the Night theme): `--color-invert-bg #0E0D0B` etc.
- Review semantics: `--review-insert-*` (green), `--review-delete-*` (warm brick `#A03E22`, AA on its wash), `--review-highlight-*` (gold `rgba(212,160,23,…)`), `--review-comment-anchor` (accent-dim dotted underline), `--review-comment-active-bg`.
- Green's jobs are scoped: review semantics + brand moments. Chrome affordances de-greened in round 1 (blockquote rule → faint ink, focus ring → ink, selection → neutral).

## Typography

- Display: Ancho UltraBold — weight 800 ONLY, line-height ≥1.05, ALL-CAPS by nature (no lowercase), h1–h3 only. Long headings wrap multi-line caps: that's the editorial voice.
- Body: Outfit variable, 16px base, line-height 1.6 for long-form; don't go below 14px (`--font-size-sm`); micro = 11px for labels only.
- Mono: Geist Mono for filenames, code, CriticMarkup source.
- Letterspacing: tight negative on display (−0.03em), +0.06em caps on buttons/toggles, +0.08em on eyebrow labels.

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

Theme = `themes/<id>/theme.json` + `tokens.css`; the token names above are the contract. Ships: pinoc-editorial (reference), paper (warm serif), night (dark, from the inversion family).
