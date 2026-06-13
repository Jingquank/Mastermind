# Mastermind

A local-first markdown viewer/editor for reviewing and discussing documents with AI coding agents.

The core loop: an agent writes a plan as a `.md` file → you open it in Mastermind → read, edit, highlight, and comment using [CriticMarkup](https://github.com/CriticMarkup/CriticMarkup-toolkit) → **Save & hand back** → the agent re-reads the same file and continues. **The file on disk is the single source of truth and the only communication channel.** No database, no sync layer, no accounts, no network calls except localhost (plus one opt-in exception: a translation provider you configure yourself).

## Install (local clone only — not published to npm)

```sh
git clone https://github.com/Jingquank/Mastermind.git
cd Mastermind
npm install
npm run build
npm link
```

Then:

```sh
mastermind open README.md          # open a file in a browser tab
mastermind open --wait plan.md     # block until "Save & hand back" (the agent protocol)
mastermind workspace .             # browse a directory as a file tree (alias: ws)
mastermind new                     # blank draft (prompts for a name on first save)
mastermind assist plan.md          # let your agent answer translate/suggest requests
mastermind status                  # daemon status
mastermind stop                    # shut the daemon down
```

`open` prints the review URL to stdout. The daemon serves on `127.0.0.1:5173` (or the next free port; `--port <n>` pins one) and is shared by all sessions.

## Works with your AI agent

`mastermind open --wait` turns a review into a synchronous step in an agent's loop: the command blocks while you review, then prints

```
mastermind: review complete — 3 comments, 2 suggested edits
```

and exits 0 when you hand back. See **[AGENT_SETUP.md](AGENT_SETUP.md)** for a paste-ready block for your `CLAUDE.md` / agent instructions, and the exit-code contract.

Your agent can also *be* the LLM provider. Run `mastermind open --wait --serve-assist plan.md` (one listener that both waits for your hand-back and answers requests) and the reading-language toggle and inline edit-suggestions route to your agent over the same file-is-the-protocol channel — no API key. See AGENT_SETUP.md for the request/response protocol.

## Reviewing

Three views over the same buffer (`Cmd+E` cycles, `Cmd+S` saves):

- **Reading** — rendered markdown with CriticMarkup as a visual diff: green insertions, struck deletions, paired substitutions, gold highlights, and comment threads in a margin rail. Select text → Comment / Suggest deletion / Highlight. Hover a suggestion → Accept / Reject (plus Accept all / Reject all in the top bar; `Cmd+Z` undoes review operations). Task-list checkboxes are live.
- **Editing** — true WYSIWYG (Milkdown). Opening a file and saving without changes produces a byte-identical file. Accept/reject hover chips work here too: on an unedited document the resolve is a byte-exact source splice; once you've typed it becomes a ProseMirror edit.
- **Source** — CodeMirror with CriticMarkup token highlighting.

All five CriticMarkup marks are supported, inline anywhere: `{++ins++}`, `{--del--}`, `{~~old~>new~~}`, `{==highlight==}`, `{>>comment<<}`. A highlight immediately followed by a comment (`{==span==}{>>note<<}`) anchors the comment to that span; consecutive comments form a thread; comments carry `@author:` tags.

**Reading at scale.** The left **navigator** carries both the file tree and the current document's **heading outline** (scroll-spy), switchable by a Files/Outline toggle; a **mark minimap** (right edge, one tick per review item) appears when the comment rail is closed. `Cmd+F` opens a mark-aware find that filters by kind (comments / edits / highlights) and cycles matches, augmenting the browser's own find. **Print / PDF** (`Cmd+P`) hides all chrome, prints ink-on-white regardless of theme, and renders comments as numbered footnotes.

**Inline AI suggestions (opt-in, staging gate).** With an agent listening (`mastermind assist`), select text and choose **Suggest edits**. The agent's proposed marks render distinctly on-screen only — nothing reaches disk until you Accept (or Edit, or Dismiss) each one. The file only ever gains edits you approved; marks still flow one direction, user → agent.

## Multi-round reviews

Every **Save & hand back** snapshots the file to `.mastermind/history/` next to it (last 20 kept). When the agent revises the file on disk, a banner offers a reload — and afterwards, **"Show what changed since your last review"**: a word-level diff against your last hand-back. A **Rounds** panel (top bar) lists every hand-back with its mark counts and a signed delta from the previous round; click one to diff it against the current document. You may want `.mastermind/` in your project's `.gitignore`.

## Workspaces (file tree)

`mastermind workspace .` (alias `ws`) opens a directory as a collapsible file tree at `/w/:id` (the Files tab of the left navigator) — markdown files show a live review-mark badge, the file you're reviewing is highlighted, and a per-file dot marks anything open or with an agent waiting on it (even in another tab). On narrow windows the navigator collapses to an off-canvas overlay so the document keeps its full measure. Clicking a file opens it as an ordinary session, so `--wait`, hand-back, snapshots, and every reviewing feature work unchanged. The tree is **strictly contained**: it lists only files under the root, follows symlinks only when they resolve back inside it, and hides `.git` / `.mastermind` / `node_modules` / dotfiles. A file opened directly with `mastermind open` (outside any root) stays a plain single-file session.

## Themes

`themes/<id>/{theme.json,tokens.css}` — drop a folder in and it appears in the navigator's Settings. A **Swiss International** set ships: **Grid** (light, Swiss red — the default), **Nacht** (dark, electric blue), and **Sepia** (warm paper, ochre). One grotesque (Schibsted Grotesk, OFL) carries display + body + labels; Geist Mono for code. Settings (in the `⋯` menu) cover theme, font size, line height, content width, author tag, languages, and the translation provider; persisted to `~/.config/mastermind/config.json`.

## Reading-language toggle (optional, off until configured)

Configure a translation provider in settings — **your own coding agent** (no API key; it answers over the `mastermind assist` channel), an Anthropic API key, or any OpenAI-compatible endpoint (Ollama and LM Studio work, keeping translation fully on-machine). A toggle then appears that switches the rendered document between its language and your configured pair (default EN ⇄ 中文), block by block with a per-document cache (`.mastermind/translations/`), so the second toggle is instant and editing one paragraph re-translates only that paragraph. CriticMarkup survives translation; blocks that fail validation fall back to the original with an indicator. (Agent-channel translations are session-scoped and not written to the on-disk cache.)

Comments you type in the "wrong" language are translated into the document's language on save (the agent reads feedback in the language it's working in); a settings toggle keeps your original text alongside.

## Development

```sh
npm run dev        # tsx-watched daemon on :5199 + Vite on :5173 with proxy
npm test           # vitest — scanner, round-trip corpus, e2e exit codes, …
npm run typecheck
```

Limits and punted edge cases are documented in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md). The full product spec lives in [docs/spec/](docs/spec/).
