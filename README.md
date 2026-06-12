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
mastermind new                     # blank draft (prompts for a name on first save)
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

## Reviewing

Three views over the same buffer (`Cmd+E` cycles, `Cmd+S` saves):

- **Reading** — rendered markdown with CriticMarkup as a visual diff: green insertions, struck deletions, paired substitutions, gold highlights, and comment threads in a margin rail. Select text → Comment / Suggest deletion / Highlight. Hover a suggestion → Accept / Reject (plus Accept all / Reject all in the top bar; `Cmd+Z` undoes review operations). Task-list checkboxes are live.
- **Editing** — true WYSIWYG (Milkdown). Opening a file and saving without changes produces a byte-identical file.
- **Source** — CodeMirror with CriticMarkup token highlighting.

All five CriticMarkup marks are supported, inline anywhere: `{++ins++}`, `{--del--}`, `{~~old~>new~~}`, `{==highlight==}`, `{>>comment<<}`. A highlight immediately followed by a comment (`{==span==}{>>note<<}`) anchors the comment to that span; consecutive comments form a thread; comments carry `@author:` tags.

## Multi-round reviews

Every **Save & hand back** snapshots the file to `.mastermind/history/` next to it (last 20 kept). When the agent revises the file on disk, a banner offers a reload — and afterwards, **"Show what changed since your last review"**: a word-level diff against your last hand-back. You may want `.mastermind/` in your project's `.gitignore`.

## Themes

`themes/<id>/{theme.json,tokens.css}` — drop a folder in and it appears in the settings panel. Ships with **PINOC Editorial** (the reference theme), **Paper** (warm serif), and **Night** (dark). Settings (gear icon) cover theme, font size, line height, content width, author tag, languages, and the translation provider; persisted to `~/.config/mastermind/config.json`.

> The Editorial/Night display font (Ancho) is commercial and not in this repo — drop `Ancho-UltraBold.woff2` into `themes/pinoc-editorial/fonts/` if you have it; the Outfit fallback covers its absence.

## Reading-language toggle (optional, off until configured)

Configure a translation provider in settings — an Anthropic API key, or any OpenAI-compatible endpoint (Ollama and LM Studio work, keeping translation fully on-machine). A toggle then appears that switches the rendered document between its language and your configured pair (default EN ⇄ 中文), block by block with a per-document cache (`.mastermind/translations/`), so the second toggle is instant and editing one paragraph re-translates only that paragraph. CriticMarkup survives translation; blocks that fail validation fall back to the original with an indicator.

Comments you type in the "wrong" language are translated into the document's language on save (the agent reads feedback in the language it's working in); a settings toggle keeps your original text alongside.

## Development

```sh
npm run dev        # tsx-watched daemon on :5199 + Vite on :5173 with proxy
npm test           # vitest — scanner, round-trip corpus, e2e exit codes, …
npm run typecheck
```

Limits and punted edge cases are documented in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md). The full product spec lives in [docs/spec/](docs/spec/).
