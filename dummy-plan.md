# Plan: Add a dark mode toggle

A short, dummy plan to show how Mastermind renders a document with review marks.

## Goal

Let users switch between light and dark themes from the top bar, with the choice persisted across reloads. The toggle should be keyboard-accessible and respect the OS preference on first load.

## Approach

1. Read the saved theme from `localStorage` on boot, falling back to `prefers-color-scheme`.
2. Expose a `ThemeContext` so any component can read the current theme.
3. Render a toggle button in the top bar that flips the value.
4. {--Inline the theme variables on every component.--}

## Files to touch

- `src/theme/ThemeContext.tsx` — new provider + hook
- `src/ui/TopBar.tsx` — the toggle button
- `src/theme/tokens.css` — {==dark-mode color tokens==}

```ts
type Theme = 'light' | 'dark'

function useTheme(): [Theme, () => void] {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme outside provider')
  return [ctx.theme, ctx.toggle]
}
```

## Open questions

- Should the toggle animate the transition, or switch instantly? {>>I'd lean instant to avoid jank on large pages.<<}
- Do we need a third "auto / follow system" state, or is the two-way toggle enough?

## Out of scope

Per-component theme overrides, high-contrast mode, and custom user palettes.

<!-- mastermind:summary -->
> **Review summary** (2026-06-14 01:54)
> 1 comment, 1 suggested edit, 1 highlight. Open the CriticMarkup marks above for details.
<!-- /mastermind:summary -->
