# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Mastermind is a local-first markdown viewer/editor for reviewing documents with AI coding agents. **The file on disk is the single source of truth and the only communication channel** — no database, no sync layer, no accounts, no network except localhost (the one exception is an opt-in translation provider the user configures). An agent writes a plan as `.md` → the user reviews/edits/comments using [CriticMarkup](https://github.com/CriticMarkup/CriticMarkup-toolkit) in the browser → "Save & hand back" → the agent re-reads the same file. Keep that invariant in mind for any change: review feedback must round-trip through the file as CriticMarkup, and marks flow one direction only (user → agent for edits).

## Commands

```sh
npm run dev        # tsx-watched daemon on :5199 + Vite dev server on :5173 (proxies to daemon)
npm test           # vitest run — full suite
npm run test:watch # vitest watch
npm run typecheck  # tsc against tsconfig.json (browser) AND tsconfig.node.json (cli/server) — both must pass
npm run build      # rm -rf dist && vite build (UI) && tsup (cli + server) — required before the bin works
```

Run a single test file or test:
```sh
npx vitest run tests/critic-scanner.test.ts
npx vitest run -t "name of the test"
```

Running the CLI from a clone (not npm-linked): `node bin/mastermind.js <cmd>` (the bin refuses to run until `npm run build` has produced `dist/`). Key subcommands: `open [--wait] [--serve-assist] <file>`, `workspace <dir>` (alias `ws`), `assist <file>`, `new`, `status`, `stop`. `open --wait` is the synchronous agent protocol — it blocks until hand-back, then prints `mastermind: review complete — N comments, M suggested edits` and exits 0 (1 = closed without handback / no connection, 130 = Ctrl+C, 2 = bad invocation). See `AGENT_SETUP.md` for the full agent/assist protocol.

## Workflow: dogfood plan reviews through Mastermind

This repo *is* Mastermind, so use it to review your own plans. When asked to plan a change, write the plan to a `.md` file instead of chat, then run:

```sh
node bin/mastermind.js open --wait <plan-file>.md   # or `mastermind open --wait …` if npm-linked
```

The command blocks while the user reviews. When it returns, **re-read the file** — CriticMarkup marks (`{++ ++}`, `{-- --}`, `{~~ ~> ~~}`, `{== ==}`, `{>> <<}`) and the `<!-- mastermind:summary -->` block carry the user's feedback. Revise the document directly — apply or argue each suggested edit, address every comment, then remove the resolved marks and the summary block. Do **not** add CriticMarkup of your own (the user sees your changes through Mastermind's revision diff). Re-open with the same command for the next round until approved. Full protocol and exit-code contract: `AGENT_SETUP.md`.

If the user sets the translation provider to "Your coding agent", you can also serve as the LLM provider over the same file channel — run `mastermind assist <file>` (or `open --serve-assist`) and answer `translate`/`suggest` tasks as documented in `AGENT_SETUP.md`.

## Architecture

Three layers under `src/`, each with its own tsconfig:

- **`src/cli/`** — the `mastermind` command (commander). It is a thin client: `daemon.ts` ensures a single shared background daemon is running (spawns `src/server/index.ts` if not), then everything goes over HTTP (`http.ts`) and SSE (`sse.ts`). `wait.ts` implements the `--wait`/`--serve-assist` blocking loops. The CLI holds almost no logic — it creates sessions/workspaces via the API and waits on events.
- **`src/server/`** — a Hono HTTP server (`app.ts`) plus the daemon lifecycle (`index.ts`: port-scan from 5173, idle self-exit, statefile in `~/.config/mastermind`). One daemon serves all sessions. Core registries: `sessions.ts` (open files, keyed by real path), `workspaces.ts` (file-tree roots), `assist/` (agent-as-LLM-provider task queue), `translate/` (translation providers + on-disk cache). `handback.ts` + `snapshots.ts` implement Save & hand back and the `.mastermind/history/` rounds. `contain.ts` enforces that workspace trees never escape their root (symlinks must resolve back inside; `.git`/`.mastermind`/`node_modules`/dotfiles hidden). `watch.ts` (chokidar) drives "file changed on disk" banners.
- **`src/ui/`** — React 19 + Vite SPA, Zustand stores. Two views over one buffer (`Cmd+E` toggles): **Reading** (`modes/reading/Renderer.tsx`, rendered markdown with CriticMarkup as a visual diff) and **Source** (`modes/source/SourceEditor.tsx`, CodeMirror — opening+saving an unchanged file must be byte-identical). `review/` holds the comment rail, hover/keyboard accept/reject, find bar, rounds panel, and the inline-suggestion proposal store.

**`src/shared/`** is the heart and is imported by all three layers (so it must stay isomorphic / browser-safe):
- `critic/scanner.ts` parses CriticMarkup into typed marks; `critic/resolve.ts` accepts/rejects marks as exact source splices; `critic/mask.ts` and `critic/suggest.ts` support find and inline suggestions. This is the most test-covered code — touch it only with the corpus tests green.
- `markdown/` is the remark/mdast pipeline (`processor.ts`, `remark-critic.ts`, `critic-mdast.ts`, `critic-to-markdown.ts`) that lets CriticMarkup survive the round-trip through the AST.
- `blocks.ts`, `edits.ts`, `eol.ts`, `summary.ts`, `types.ts`, `constants.ts` — shared block model, EOL preservation, the hand-back summary block, and the API/type contract shared between client and server.

### Invariants worth preserving (the tests enforce these)
- **Byte-exact round-trips.** Open→save with no edits must reproduce the file byte-for-byte (EOL and all). Accept/reject of a mark on an unedited document is an exact source splice, not a re-render. See `critic-resolve.test.ts` and `selection-ranges.test.ts`.
- **Marks flow one direction.** Agent/assist suggestions render on-screen only; nothing reaches disk until the user accepts each one. The file only gains user-approved edits.
- **Workspace containment.** `workspace-contain.test.ts` — the tree must never list or follow paths outside its root.

## Theming
Themes are data, not code: `themes/<id>/{theme.json,tokens.css}`. Components reference `var(--*)` only — **no hardcoded colors/spacing outside `themes/*/tokens.css`** (enforced by `theme-token-consistency.test.ts`). The token names in `DESIGN.md` are the schema every theme must satisfy; `grid` (light) is the reference. The accent color lives in chrome only — CriticMarkup review marks are the only color allowed in the document body. `scripts/gen-scales.mjs` generates the 12-step OKLCH palettes.

## Reference docs
`README.md` (feature tour), `DESIGN.md` (design-system token contract), `AGENT_SETUP.md` (agent + assist-channel protocol — the paste-block for agent instruction files), `KNOWN_LIMITATIONS.md` (punted edge cases), `docs/spec/` (product spec).
