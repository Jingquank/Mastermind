# Implementation plan: lean topbar

Derived from `2026-06-13-lean-topbar-design.md`. Three independent changes that
can land in one pass: **(1)** remove Rounds end-to-end, **(2)** move Translation
to a floating pill, **(3)** strip the topbar overflow down to icon buttons.

Order matters: do the removals first (they shrink the surface), then rebuild the
topbar, then add the pill. Run `npm run typecheck` after each step as a guardrail.

---

## Step 1 — Remove Rounds (server + shared)

1. Delete `src/server/snapshots.ts`.
2. `src/server/handback.ts`: remove the `writeSnapshot` import and call; drop
   `snapshotId` from the `HandbackResult` shape and the returned object.
3. `src/server/app.ts`: remove the `listRounds, readLatestSnapshot, readSnapshot`
   import and the three routes that use them
   (`GET /api/sessions/:id/snapshots`, `.../snapshots/latest`, `.../snapshots/:id`).
4. `src/shared/types.ts`: remove `snapshotId` from the handback SSE event payload
   (line ~170) and any `RoundInfo` / `SnapshotInfo` types.
5. `src/shared/constants.ts`: remove `SNAPSHOT_KEEP`.
6. **Delete stale history.** On session open (`src/server/sessions.ts`, where the
   file path is resolved), best-effort remove the existing
   `.mastermind/history/<basename>` directory
   (`fs.rm(dir, { recursive: true, force: true })`, ignore errors). If that leaves
   `.mastermind/` empty, remove it too. This clears snapshots written before this
   change, so no orphaned history lingers once the feature is gone.

**Verify:** `npm run typecheck` (node tsconfig) — server compiles with no snapshot refs.

## Step 2 — Remove Rounds (UI)

1. Delete `src/ui/review/RoundsPanel.tsx` and `src/ui/diff/DiffView.tsx`.
2. `src/ui/app/api.ts`: remove `getLatestSnapshot`, `getSnapshot`, `getRounds`
   (the `/snapshots*` calls) and the `RoundInfo` import/type usage.
3. `src/ui/app/store.ts`: remove `rounds`, `roundsOpen`, `setRoundsOpen`,
   `loadRounds`, `diffOpen`, `setDiffOpen`, `diffLeftSnapshotId`, and the
   `getLatestSnapshot` import (line ~9 / ~279).
4. `src/ui/app/SessionView.tsx`: remove the `RoundsPanel`/`DiffView` imports, the
   `roundsOpen`/`rounds`/`toggleRounds`/`loadRounds` wiring, the `if (diffOpen)`
   render branch, the `<RoundsPanel>` render, and any rounds-related Escape/keyboard
   handling (lines ~14, ~21, ~59-60, ~84, ~89-92, ~114, ~250, ~296, ~372-384, ~431).
5. `src/ui/app/route.ts`: remove any diff route.
6. `src/ui/app/app.css`: remove rounds/diff styles.
7. `src/ui/i18n/index.ts`: remove `rounds`, `roundsTitle`, and diff strings.

**Verify:** `npm run typecheck` (browser tsconfig) passes; app still loads.

## Step 3 — Rebuild the topbar

Edit `src/ui/app/TopBar.tsx`:

1. Delete the `overflow` array, the `OverflowItem` interface, the `DropdownMenu`
   block, and the single-item fallback button.
2. Remove props no longer used: `roundCount`, `onToggleRounds`, `translation`
   (and their destructuring). Keep `onToggleRail`, `railOpen`, `onToggleSettings`.
3. Render two ghost icon buttons just before the Save button:
   - **Comments** — `ChatIcon`; rendered only when `onToggleRail` is defined;
     `aria-label`/`title` = show/hide comments; `active` class when `railOpen`.
   - **Settings** — `GearIcon`; rendered when `onToggleSettings` is defined.
4. Fix imports: drop `DropdownMenu`, `MoreIcon`, `SwapIcon`, and the unused
   `CodeIcon`/`EyeIcon`/`PencilIcon`/`SendIcon`; add `ChatIcon`.
5. **Click-outside selector:** rename the Settings button class from `topbar-more`
   to `topbar-settings`, and update `SettingsPanel`'s `ignoreSelector` (`SlideOver`
   prop) from `.topbar-more` to `.topbar-settings`. (`RoundsPanel`, the other
   `.topbar-more` user, is deleted in Step 2.)
6. `app.css`: remove `.topbar-more-menu` / `.more-item` rules; add a small
   `.topbar-icon-btn` (or reuse `btn-ghost`) + `.active` style using theme tokens.

**Verify:** `npm run typecheck`; clicking Settings opens/closes the panel without
the immediate re-close bug.

## Step 4 — Floating translation pill

1. New component `src/ui/modes/reading/TranslationPill.tsx`:
   - Props or store-derived: `label`, `active`, `loading`, `disabled`,
     `disabledTitle`, `onToggle` — the same fields the topbar `translation` prop
     carried.
   - Renders a pill (swap icon + label), `active` style when translated, loading
     text while translating, disabled state when the agent channel isn't ready.
2. Move the `translation={...}` construction out of `SessionView`'s `<TopBar>` and
   render `<TranslationPill>` inside the reading view instead, gated by
   `providerConfigured && mode === 'reading'` (same condition as today).
3. Pin it **sticky** to the top-right of the reading view so it stays visible as
   the document scrolls (`position: sticky; top: <offset>; align-self: flex-end`,
   or a sticky wrapper) rather than scrolling away with the content. Add
   `.translation-pill` styles in `app.css` (or a reading-scoped css) using theme
   tokens only — no hardcoded colors. Mind the z-index so it sits above the text
   but below the topbar.

**Verify:** In Reading mode with a provider configured, the pill appears, stays
pinned while scrolling a long doc, and toggles translation; it's absent in
Editing/Source and when no provider is set.

## Step 5 — Tests & final checks

1. Update/remove tests referencing snapshots, `snapshotId`, rounds endpoints, or
   `SNAPSHOT_KEEP`.
2. Confirm the byte-exact round-trip tests still pass (handback no longer
   snapshots, but file bytes are unchanged).
3. Run the full gate: `npm run typecheck && npm test`.
4. `npm run build` to confirm the bundle builds.

---

## Decisions (resolved in review)

- **`.mastermind/history/` cleanup:** delete it. Existing snapshots are removed on
  session open (Step 1.6), not just abandoned.
- **Comments icon when no threads:** keep current behavior — hidden unless threads
  exist in Reading mode.
- **Pill placement on long docs:** sticky to the top-right so it stays visible while
  scrolling (Step 4.3).
