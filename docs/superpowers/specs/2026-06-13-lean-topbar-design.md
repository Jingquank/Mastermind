# Lean topbar: drop the overflow menu, remove rounds, float translation

**Date:** 2026-06-13
**Status:** Approved (design)

## Problem

The topbar's three-dot ("More") button opens a `DropdownMenu` that, on a typical
document, collapses to a single item — so reaching Settings is two clicks for one
action. The overflow also lumps together controls of different kinds (view
toggles vs. panels vs. global config), which makes the grouping feel arbitrary.

## Goals

1. **No overflow dropdown.** Surface remaining controls as individual, always-visible
   icon buttons.
2. **Remove the Rounds feature entirely** — UI *and* backend — to keep the app lean.
3. **Move the translation toggle out of the topbar** into a floating pill in the
   reading view, close to the content it transforms.

Non-goals: changing the Save / Hand back flow, the mode switch, or the
CriticMarkup round-trip. Translation *provider* configuration in Settings is
unchanged; only the in-app toggle moves.

## Design

### Topbar (`src/ui/app/TopBar.tsx`)

After the changes, the right cluster is:

```
[review bulk?] [Comments icon?] [Settings icon] [Save] [HAND BACK]
```

- The `overflow: OverflowItem[]` array, the `DropdownMenu` block, and the
  single-item fallback button all go away.
- **Settings** — always-present `btn-ghost` icon button (gear), opens the panel.
- **Comments** — `btn-ghost` icon button (chat bubble) that toggles the comment
  rail. Keeps its current conditional: shown only in Reading mode when threads
  exist (driven by `onToggleRail` being defined). Active state styles when the
  rail is open.
- Icons sit left of Save / Hand back; primary actions stay anchored far right.
- Remove now-unused props from `TopBarProps`: `roundCount`, `onToggleRounds`,
  `translation`. Remove unused imports (`DropdownMenu`, `MoreIcon`, `SwapIcon`,
  and the speculative `CodeIcon`/`EyeIcon`/`PencilIcon`/`SendIcon` that aren't used).
- `topbar-more` class usage changes: `SettingsPanel`/`RoundsPanel` use
  `.topbar-more` as their click-outside `ignoreSelector`. The Settings button must
  keep a class the SettingsPanel ignores (rename to e.g. `.topbar-settings` and
  update `SettingsPanel`'s `ignoreSelector`, or keep `.topbar-more`). RoundsPanel
  is being deleted, so its selector goes with it.

### Translation pill (reading view)

- New small component rendered inside the reading view (`src/ui/modes/reading/`,
  wired from `SessionView`), positioned absolute top-right of the reading content.
- Visible only when `mode === 'reading'` **and** a provider is configured
  (`providerConfigured`) — same gating that currently decides whether `translation`
  is passed to the topbar.
- Shows the target-language label (e.g. `中文`), swap icon, highlights when active,
  click flips between original/translated. Renders loading text while translating
  and a disabled state when the agent channel isn't listening
  (`!translationReady && !transActive`), reusing the existing
  `useTranslation` store logic moved out of `SessionView`'s topbar `translation`
  prop.
- Styling via theme tokens only (no hardcoded colors), per `DESIGN.md`.

### Remove Rounds (full removal)

UI:
- Delete `src/ui/review/RoundsPanel.tsx` and `src/ui/diff/DiffView.tsx` (DiffView
  exists only to view rounds).
- `src/ui/app/SessionView.tsx`: remove `roundsOpen`, `rounds`, `toggleRounds`,
  `loadRounds`, `diffOpen`/`diffLeftSnapshotId` branch, the `<RoundsPanel>` and
  `<DiffView>` renders, and related keyboard/escape handling.
- `src/ui/app/store.ts`: remove `rounds`, `roundsOpen`, `setRoundsOpen`,
  `loadRounds`, `diffOpen`, `setDiffOpen`, `diffLeftSnapshotId` state/actions.
- `src/ui/app/api.ts` / `route.ts`: remove rounds/snapshot fetch endpoints and
  any diff route.
- `src/ui/app/app.css`: remove rounds/diff styles.
- `src/ui/i18n/index.ts`: remove `rounds`, `roundsTitle`, and diff-related strings.

Server:
- Delete `src/server/snapshots.ts`.
- `src/server/handback.ts`: stop calling `writeSnapshot`; drop `snapshotId` from
  the handback result.
- `src/server/app.ts`: remove the snapshot/rounds HTTP endpoints (drop the
  `listRounds, readLatestSnapshot, readSnapshot` import from `./snapshots` and the
  routes that use them).
- `src/shared/types.ts`: remove `snapshotId` from the handback SSE event payload
  (`types.ts:170`) and any rounds/snapshot types.
- `src/shared/constants.ts`: remove `SNAPSHOT_KEEP`.

The handback SSE event carries `snapshotId`, but the CLI `--wait` loop does **not**
read it (verified: no `snapshotId` reference under `src/cli/`), so dropping it
doesn't change the agent completion contract.

Note: `.mastermind/history/` snapshots are no longer written. Existing on-disk
history is left untouched (not actively deleted), but nothing reads it anymore.

### Tests

- Remove/adjust tests that assert snapshot writing, `snapshotId` in handback
  results, or rounds endpoints.
- Verify the byte-exact round-trip invariants still hold (handback without
  snapshotting must still produce the same file bytes).
- `npm run typecheck` (both tsconfigs) and `npm test` must pass.

## Risks

- **Handback result contract.** `snapshotId` is part of the handback result
  consumed by the CLI `--wait` flow. Removing it requires updating the CLI/server
  result handling so the agent protocol still prints its completion line.
- **Click-outside selector.** Missing the `ignoreSelector` rename would make the
  Settings panel close immediately when clicking its trigger.
- **Translation state.** Logic currently lives in `SessionView` as the `translation`
  prop; moving it into a component must preserve the disabled/loading gating.
