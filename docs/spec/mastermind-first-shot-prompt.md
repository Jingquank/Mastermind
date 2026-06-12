# Mastermind — First Shot Prompt

Build **Mastermind**, a local-first markdown viewer/editor for reviewing and discussing documents with AI coding agents. The core loop: an agent writes a plan as a `.md` file → the user opens it in Mastermind → reads, edits, highlights, and comments using CriticMarkup → saves → the agent re-reads the same file and continues. The file on disk is the single source of truth and the only communication channel.

## Core principles

1. **The file is the protocol.** No database, no sync layer, no proprietary format. Mastermind reads and writes plain `.md` files. Comments and suggested changes are stored inline as CriticMarkup, so the file stays fully usable in VS Code, Vim, Cursor, or any agent's context window.
2. **Local-first, zero cloud.** No account, no telemetry, no network calls except localhost — with one explicit opt-in exception: the user may configure a translation provider (see Language toggle). Until they do, the app makes zero outbound requests.
3. **Reviewer-grade reading experience.** This is a tool for thinking about documents. Typography and rendering quality matter as much as features.
4. **Agent-friendly by construction.** An agent should be able to launch it with one shell command and consume its output by reading one file.

## Tech stack

- **UI**: Vite + React + TypeScript, single-page app
- **Server/CLI**: Node.js (>=20). A small CLI binary `mastermind` that serves the UI on localhost and exposes a minimal file API to the frontend
- **Markdown**: unified/remark pipeline for parsing and rendering; write a remark plugin (or post-processing pass) for CriticMarkup
- **Editor**: CodeMirror 6 for source mode
- **Styling**: CSS custom properties for theming (themes are just variable sets)
- No Electron, no Tauri in v0.1. Native shell wrap is a later step.

## CLI

```
mastermind open <path/to/file.md>   # start server if not running, open browser tab focused on this file
mastermind open --wait <file.md>    # same, but BLOCK until the user clicks "Save & hand back", then exit 0
mastermind new [path]               # create a blank draft and open it
mastermind --port <n>              # optional port override (default 5173 or next free)
```

- If the server is already running, `open` reuses it (talk to the running instance via a localhost endpoint, then `open` the browser URL).
- Print the URL to stdout so agents can surface it to the user.
- **`--wait` semantics**: the process blocks until the user clicks "Save & hand back" in that file's tab, then prints a one-line machine-readable summary to stdout (e.g. `mastermind: review complete — 3 comments, 2 suggested edits`) and exits 0. Ctrl+C or closing the tab without handing back exits 130/1. This makes a review a synchronous step in an agent's loop: run the command, and when it returns, re-read the file.
- Watch the open file with a file watcher; if the agent edits it on disk while it's open, show a non-blocking "file changed on disk — reload / keep mine" banner. After reload, if a hand-back snapshot exists for this file, the banner also offers **"Show what changed since your last review"** (see Revision history).

## UI layout

Three-zone layout:

- **Top bar**: file name + dirty indicator, view mode toggle (Reading / Editing / Source), theme switcher, language settings, "Save & hand back" button
- **Main column**: the rendered document, max-width ~720px, centered
- **Right margin rail**: comment cards anchored to their inline positions (Google-Docs-style), collapsible

View modes:

1. **Reading** — fully rendered markdown. CriticMarkup renders as visual diff: insertions green, deletions red strikethrough, substitutions paired, highlights with a marker background, comments as margin cards. Selecting any text pops a floating toolbar: Comment / Suggest deletion / Highlight. GFM task lists (`- [ ]`) render as live checkboxes — clicking toggles the `[ ]`/`[x]` in the source buffer and marks the document dirty.
2. **Editing** — true WYSIWYG, built on **Milkdown** (ProseMirror-based, remark-compatible). Typing edits the rendered document directly and serializes back to markdown source. CriticMarkup requires a custom Milkdown plugin: register the five mark types as inline nodes backed by the same remark CriticMarkup parser used in Reading mode, render them with the same visual diff treatment, and guarantee **byte-exact round-trip** — opening a file in Editing mode and saving without changes must produce an identical file (marks, whitespace, and all). This plugin is the project's hardest component; build and test it before wiring up the rest of Editing mode.
3. **Source** — CodeMirror 6 with markdown syntax highlighting and CriticMarkup token highlighting.

All three modes operate on the same source string; mode switches never lose unsaved changes.

## CriticMarkup support (P0)

Implement the full spec:

| Syntax | Meaning |
|---|---|
| `{++text++}` | insertion |
| `{--text--}` | deletion |
| `{~~old~>new~~}` | substitution |
| `{==text==}` | highlight |
| `{>>text<<}` | comment |

Behavior:

- A highlight immediately followed by a comment (`{==span==}{>>note<<}`) is treated as an anchored comment on that span; render the note as a margin card linked to the highlighted text.
- Each insertion/deletion/substitution gets hover actions: **Accept** (apply the change, strip the markup) and **Reject** (revert, strip the markup). Add document-level "Accept all / Reject all".
- Comment cards support reply threads. Encode replies as consecutive comment marks; prefix each comment's text with an author tag like `@ke:` or `@agent:` so multi-party threads survive as plain text. Default author tag is configurable in settings.
- The parser must be robust to CriticMarkup spanning multiple words and appearing inside list items and blockquotes. It does not need to handle marks spanning across block boundaries — document that limitation.

## Save & hand back

- `Cmd/Ctrl+S` writes the current source (including all CriticMarkup) back to the original path. That alone completes the loop — the agent re-reads the file.
- The **"Save & hand back"** button additionally appends a fenced summary block at the end of the file — exactly one: if a previous summary block exists, overwrite it in place. The agent is permitted to delete it while revising (see Agent setup snippet); Mastermind treats its absence as normal. Format:

```markdown
<!-- mastermind:summary -->
> **Review summary** (2026-06-12 14:30)
> 3 comments, 2 suggested edits, 1 highlight. Open the CriticMarkup marks above for details.
<!-- /mastermind:summary -->
```

- The summary's prose language follows the **feedback language** rule (see Language toggle & translation).

## Revision history & diff (P0)

The review loop is multi-round: user comments → agent revises → user reviews again. The second round's first question is always "what did the agent change?"

- On every "Save & hand back", snapshot the saved content to `.mastermind/history/<filename>/<timestamp>.md`. Keep the last 20 snapshots per file; prune older ones.
- When the file is reloaded after an on-disk change and a snapshot exists, offer **"Show what changed since your last review"**: a word-level diff between the latest snapshot and the current content, rendered with the same insertion/deletion visual language as CriticMarkup (reuse the `--review-*` tokens). Diff view is read-only with a "Back to document" exit.
- `.mastermind/` lives next to the opened file; add a note in the README that users may want it in `.gitignore`.

## Agent setup snippet

Ship an `AGENT_SETUP.md` in the repo root containing a paste-ready block for `CLAUDE.md` / agent instruction files, roughly:

```markdown
## Plan reviews via Mastermind
When asked to plan, write the plan to a `.md` file instead of chat, then run:
`mastermind open --wait <plan-file>.md`
The command blocks while the user reviews. When it returns, re-read the file:
CriticMarkup marks ({++ ++}, {-- --}, {~~ ~> ~~}, {== ==}, {>> <<}) and the
review summary block contain the user's feedback.
Revise the document DIRECTLY — apply or argue each suggested edit, address
every comment, then remove the resolved marks and the mastermind:summary
block. Do not add CriticMarkup of your own; the user sees your changes
through Mastermind's revision diff. Re-open with the same command for the
next round until the user approves.
```

Reference this file from the README's "Works with your AI agent" section.

## Theming & customization (P1)

- Ship 3 premade themes: **PINOC Editorial** (the reference theme — full spec in the companion file `mastermind-theme-pinoc-editorial.md`; its token set is the schema every theme must satisfy), **Paper** (warm light, serif body), and **Night** (dark — derive its palette from the Editorial theme's inversion family: `--color-invert-*` becomes the base surface/text set). Each theme is a `theme.json` + `tokens.css` bundle as defined in the companion file.
- Settings panel exposes: theme picker, font size slider, line-height, content width. Persist settings to a local config file at `~/.config/mastermind/config.json` (and read it on boot).
- Theme files live in a `themes/` directory so users can drop in their own later — structure for it, no theme-editing UI in v0.1.

## Language toggle & translation (P1)

Three language concerns, kept separate:

### 1. Reading-language toggle (the headline feature)

A one-click toggle in the top bar switches the rendered document between its source language and a target language (default pair: EN ⇄ 中文; the pair is user-configurable in settings, any two languages).

- **Provider**: translation runs through an LLM. Settings offer two provider types: an Anthropic API key, or an OpenAI-compatible endpoint (base URL + key) — the latter means Ollama/LM Studio work, keeping translation fully on-machine for users who want it. The toggle is hidden until a provider is configured.
- **Granularity & caching**: translate block-by-block (paragraph/heading/list-item level), keyed by a content hash per block. Cache to `.mastermind/translations/<doc-hash>/<lang>.json` next to nothing else — after the first pass the toggle is instant, and editing one paragraph re-translates only that block.
- **CriticMarkup survives translation**: the translation prompt must instruct the model to preserve all `{++ ++}` / `{-- --}` / `{~~ ~> ~~}` / `{== ==}` / `{>> <<}` syntax verbatim in structure while translating the text inside the marks. Validate the output parses; on failure, fall back to showing that block untranslated with a small indicator.
- **Translated view is read-only for body text** in v0.1 (editing happens in the source language). Commenting and highlighting remain available; marks made in translated view anchor at **block granularity** back to the source block — document this limitation.

### 2. Feedback language — what goes back to the agent

Default: **match the document** — feedback returns in the language the user was already using with the agent. If the user composes a comment in another language (e.g. typing 中文 comments while reviewing an English plan), Mastermind translates the comment into the document's language on save, via the same provider. A settings toggle "keep original text alongside" appends the untranslated original inside the comment mark for traceability (default off). The summary block follows the same rule. With no provider configured, comments are written back as typed.

### 3. UI language

English / 简体中文 for all chrome strings, via a simple i18n dictionary structured for more locales. Independent of the two settings above.

## New draft flow (P1)

`mastermind new` or a "+ New draft" button creates an untitled `.md` in the current working directory (prompt for filename on first save) and opens it in Editing mode.

## Non-goals for v0.1

- Multi-file tabs, file tree, or workspace concept (one file per session)
- Real-time multi-user collaboration
- MCP server or websocket agent protocol (the file is the protocol)
- Export to PDF/HTML
- Mobile layout (desktop browser only)
- Plugin system

## Quality bar & acceptance

- `npm install && npm run build` then `mastermind open README.md` works end-to-end on macOS
- `mastermind open --wait` blocks, prints the summary line, and exits 0 on hand-back
- A file containing all five CriticMarkup mark types renders correctly in all three view modes, and accept/reject round-trips to clean markdown
- **WYSIWYG round-trip**: open a CriticMarkup-laden file in Editing mode, save with no changes → output is byte-identical to input
- Hand back, modify the file externally, reload → the revision diff correctly shows the external change
- Editing in any mode, saving, and reopening in VS Code shows clean, human-readable markdown
- Keyboard: Cmd/Ctrl+S save, Cmd/Ctrl+E cycle view modes, Esc closes popovers
- Comment with the rendering and parsing edge cases you chose to punt on in a `KNOWN_LIMITATIONS.md`

Start by scaffolding the project, then implement in this order: CLI + file serving → markdown rendering (incl. task-list checkboxes) → CriticMarkup remark parser → Milkdown CriticMarkup plugin (with round-trip tests) → selection toolbar + comments → accept/reject → save loop + `--wait` → revision snapshots + diff → themes → translation provider + reading-language toggle → UI i18n. Commit at each working milestone.

---

## Decision log

- **Editing = true WYSIWYG via Milkdown**; the CriticMarkup plugin with byte-exact round-trip is the acknowledged hard part, built early with tests. No fallback mode.
- **Single file per session confirmed** — no tabs, no file tree in v0.1. The agent re-invokes `mastermind open` per file.
- **`--wait` is the agent protocol** — review completion is signaled by process exit, keeping "the file is the protocol" intact.
- **Revision diff is in scope (P0)** — multi-round review is the core use case, and "what changed" is its first question.
- **Translation provider**: Anthropic API key or OpenAI-compatible endpoint, both first-class; feature dormant until configured.
- **Agent response model = direct rewrite.** The agent never writes its own CriticMarkup; the user reviews agent revisions through the revision diff. Marks flow one direction: user → agent.
- **Theme lineup: PINOC Editorial (reference) + Paper + Night.** Night derives from the Editorial inversion family.
- **Personal tool, no distribution.** Install from a local clone via `npm link` — do not publish to npm (the name `mastermind` is taken there anyway). Bundling the commercial Ancho font is fine for personal use; the theme's built-in Outfit fallback covers any machine without it.
