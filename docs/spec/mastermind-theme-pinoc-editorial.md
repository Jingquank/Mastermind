# Mastermind Theme 01 — "PINOC Editorial"

> Append this to the first-shot prompt, replacing the "ship 3 premade themes" bullet's first slot. This is the reference theme: build the theme engine so that *this* file's token set is the schema every other theme must satisfy.

Derived from the P.I.N.O.C. editorial design system: warm paper base, electric-green accent, Ancho UltraBold display headings, Outfit body, 4px corner ceiling, optional film grain. Tokens are mandatory — components reference `var(--*)` only, no hardcoded values. Alpha variants derive via `color-mix(in srgb, var(--token) NN%, transparent)`.

## theme.json

```json
{
  "id": "pinoc-editorial",
  "name": "PINOC Editorial",
  "appearance": "light",
  "fonts": [
    { "family": "Ancho", "src": "/fonts/Ancho-UltraBold.woff2", "weight": 800 },
    { "family": "Outfit", "src": "/fonts/Outfit-Variable.woff2", "weight": "100 900" },
    { "family": "Geist Mono", "src": "/fonts/GeistMono-Variable.woff2", "weight": "100 900" }
  ],
  "grain": { "enabled": true, "opacity": 0.12, "blend": "multiply", "tint": "accent", "tintOpacity": 0.3 }
}
```

## tokens.css

```css
[data-theme="pinoc-editorial"] {
  /* ---- Surfaces & text (verbatim from design system) ---- */
  --color-bg: #F3F0EB;                /* page */
  --color-bg-elevated: #FAF9F6;       /* comment cards, popovers, top bar */
  --color-text: #1A1A1A;
  --color-text-muted: #736E65;        /* metadata, comment timestamps */
  --color-text-faint: #918D85;        /* placeholders, counters */
  --color-border: #D5D3CE;

  /* ---- Accent family (verbatim) ---- */
  --color-accent: #00E05A;
  --color-accent-dim: #00B848;
  --color-accent-surface: rgba(0, 224, 90, 0.12);
  --color-on-accent: #002B12;
  --color-cta-bg: #1A1A1A;            /* primary buttons: dark pill */
  --color-cta-text: #00E05A;          /* …with green ink */

  /* ---- Inversion family (verbatim; reserved for future dark bands / dark theme seed) ---- */
  --color-invert-bg: #0E0D0B;
  --color-invert-bg-elevated: #1A1816;
  --color-invert-text: #F0EDE6;
  --color-invert-text-muted: rgba(240, 237, 230, 0.62);
  --color-invert-border: rgba(240, 237, 230, 0.12);

  /* ---- Review semantics (NET-NEW for Mastermind — not in the source system) ---- */
  /* Insertion = the brand green, naturally. */
  --review-insert-text: var(--color-accent-dim);     /* green text on cream passes contrast; #00E05A does not */
  --review-insert-bg: var(--color-accent-surface);
  --review-insert-border: var(--color-accent);
  /* Deletion = a warm brick red, harmonized with the paper palette. */
  --review-delete-text: #B5482A;
  --review-delete-bg: rgba(181, 72, 42, 0.10);
  --review-delete-border: rgba(181, 72, 42, 0.45);
  /* Highlight = warm gold (the system's reserved-but-unused accent-warm slot). */
  --review-highlight-bg: rgba(212, 160, 23, 0.22);
  --review-highlight-border: rgba(212, 160, 23, 0.55);
  /* Comment anchor underline + active states */
  --review-comment-anchor: var(--color-accent-dim);
  --review-comment-active-bg: var(--color-accent-surface);

  /* ---- Typography ---- */
  --font-display: 'Ancho', 'Outfit', sans-serif;     /* ALL-CAPS only, weight 800 only */
  --font-body: 'Outfit', -apple-system, sans-serif;
  --font-mono: 'Geist Mono', ui-monospace, monospace; /* code spans/blocks — the product app's face */

  --font-size-body: 1rem;             /* 16px */
  --font-size-sm: 0.875rem;           /* 14px — Outfit reads small; don't go to 12 */
  --font-size-micro: 0.6875rem;       /* 11px */
  --lh-display: 1.05;                 /* FLOOR for Ancho — never tighter */
  --lh-title: 1.2;
  --lh-snug: 1.4;
  --lh-body: 1.6;                     /* long-form reading; looser than the landing's 1.5 */
  --ls-heading: -0.03em;
  --ls-title: -0.02em;
  --ls-normal: 0;
  --ls-caps: 0.06em;                  /* buttons, view-mode toggle */
  --ls-label: 0.08em;                 /* eyebrow-style metadata */

  /* ---- Shape & layout ---- */
  --radius-xs: 2px;
  --radius-md: 4px;                   /* the ceiling — no lg/xl anywhere */
  --radius-full: 9999px;              /* circular elements only */
  --content-max-width: 46rem;         /* ~736px reading measure */
  --space-unit: 4px;                  /* spacing scale = 4px base, steps ×1,2,3,4,6,8,12,16,24 */
}
```

## Markdown element mapping

| Element | Treatment |
|---|---|
| `h1` | `--font-display`, `clamp(2rem, 3.6vw, 2.75rem)`, `--lh-display`, `--ls-heading`. Renders ALL-CAPS (Ancho has no lowercase). |
| `h2` | `--font-display`, `clamp(1.5rem, 2.4vw, 1.875rem)`, `--lh-display`, `--ls-heading` |
| `h3` | `--font-display`, `clamp(1.25rem, 2vw, 1.5rem)`, `--lh-title`, `--ls-title` |
| `h4`–`h6` | `--font-body` weight 600, `--lh-snug`, `--ls-normal` — Ancho stops at h3 |
| Body, lists | `--font-body` 400, `--font-size-body`, `--lh-body` |
| `strong` | weight 600 (Outfit variable axis), same color |
| Links | `--color-accent-dim` text, underline `color-mix(accent-dim 40%, transparent)`; hover → full `--color-accent-dim` underline |
| Inline code | `--font-mono` at 0.875em, `--color-bg-elevated` chip, `--color-border` hairline, `--radius-xs` |
| Code blocks | `--font-mono` 0.875rem, `--color-bg-elevated` surface, `--color-border` hairline, `--radius-md` |
| Blockquote | 2px left border `--color-accent`, text `--color-text-muted` |
| `hr` | 1px `--color-border` |
| Tables | hairline `--color-border` rows, header row `--font-body` 600 + `--ls-label` uppercase at `--font-size-sm` |

> **Ancho caveats baked into the engine:** never request a weight other than 800 from `--font-display`; never set its line-height below 1.05; long markdown headings will display as multi-line caps — that's the editorial voice, don't fight it with `text-transform`.

## CriticMarkup rendering

| Mark | Reading mode treatment |
|---|---|
| `{++ins++}` | `--review-insert-text`, `--review-insert-bg` wash, no underline |
| `{--del--}` | `--review-delete-text`, strikethrough, `--review-delete-bg` wash |
| `{~~a~>b~~}` | deletion style + insertion style, joined with a thin `→` glyph in `--color-text-faint` |
| `{==hl==}` | `--review-highlight-bg` marker wash, rounded `--radius-xs` |
| `{>>c<<}` | margin card: `--color-bg-elevated` surface, `--color-border` hairline, `--radius-md`; anchored span gets a 2px dotted underline in `--review-comment-anchor`; active/hover state washes the span with `--review-comment-active-bg` |
| Accept / Reject | Accept = `--color-accent-dim` ghost button; Reject = `--review-delete-text` ghost button; both `--radius-md`, `--font-size-sm`, `--ls-caps` uppercase |

## Chrome

- **Top bar**: `--color-bg-elevated`, bottom hairline `--color-border`. File name in `--font-mono` `--font-size-sm` (a deliberate nod to the product app), dirty indicator a 6px `--color-accent` dot.
- **Primary button** ("Save & hand back"): `--color-cta-bg` fill, `--color-cta-text` ink, `--radius-md`, `--font-body` 500, `--ls-caps`, uppercase.
- **Secondary buttons / view toggle**: ghost, `--color-text-muted` ink, active segment `--color-text` + `--color-bg-elevated` fill.
- **Focus ring**: 2px `--color-accent`, offset 2px — the one place green outline is sanctioned.
- **Selection toolbar** (floating): `--color-invert-bg` surface, `--color-invert-text` ink, `--radius-md` — the dark band device, miniaturized.
- **Grain**: the optional `GrainOverlay` — fixed inset-0, `pointer-events: none`, SVG `feTurbulence` fractalNoise desaturated, opacity 0.12, `mix-blend-mode: multiply`, plus a 30% accent tint layer at `mix-blend-mode: color`. Expose as a per-theme toggle in settings (`grain.enabled`), defaulting on for this theme.

## Theme engine requirements this file implies

1. A theme = `theme.json` (metadata, font manifest, grain config) + `tokens.css` (one `[data-theme="…"]` block). Dropping both into `themes/<id>/` registers it.
2. The token names above are the contract — Reading/Editing/Source modes and all chrome must style exclusively through them, so every future theme is a pure token swap.
3. Source mode (CodeMirror) maps its syntax theme from the same tokens: markdown syntax in `--color-text-muted`, CriticMarkup tokens in their `--review-*` colors, font `--font-mono`.
