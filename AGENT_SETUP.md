# Agent setup

Paste the block below into your `CLAUDE.md` / agent instruction file to make plan reviews flow through Mastermind.

```markdown
## Plan reviews via Mastermind
When asked to plan, write the plan to a `.md` file instead of chat. ALWAYS translate
it into the cache first, then open — `open` refuses a cold cache (the reading-language
toggle is cache-only and never fetches on demand):
`mastermind translate-blocks <plan-file>.md`   # → { targetLang, blocks:[{hash,text}] }
translate each block's text (preserve all Markdown + CriticMarkup), then:
`printf '%s' '[{"hash":"…","text":"…"}]' | mastermind translate-blocks <plan-file>.md --save`
`mastermind open --wait <plan-file>.md`        # cache is warm; the toggle flips instantly
The command blocks while the user reviews. When it returns, re-read the file:
CriticMarkup marks ({++ ++}, {-- --}, {~~ ~> ~~}, {== ==}, {>> <<}) and the
review summary block contain the user's feedback.
Revise the document DIRECTLY — apply or argue each suggested edit, address
every comment, then remove the resolved marks and the mastermind:summary
block. Do not add CriticMarkup of your own; the user sees your changes
through Mastermind's revision diff. Re-open with the same command for the
next round until the user approves.
```

## Automated setup & the `/mastermind` skills

Instead of pasting the block above by hand, run once (after `npm link`):

```sh
mastermind install-agents          # for detected agents; add --all for every supported agent
```

This installs two skills — `mastermind` and its `master` alias — for each detected coding
agent (`~/.claude`, `~/.cursor`, `~/.gemini`, `~/.agents`) and appends the always-translate-
first / plan→visualize instruction block to each agent's global memory (`~/.claude/CLAUDE.md`,
`~/.gemini/GEMINI.md`; skipped where the path is unknown). Undo with `mastermind
uninstall-agents`. Then, in any agent:

- `/mastermind setup` — pick Preferred + Secondary language, browser, and color/font theme (written via `mastermind config set`).
- `/mastermind demo` — open a bilingual showcase document.
- `/mastermind <file>` (bare = the latest `.md` from the chat) and `/master <file>` — visualize any doc.

### Translate first, offline (`translate-blocks`)

The skills pre-translate a doc into both reading languages **before** opening it, writing the
on-disk translation cache directly — no live assist loop required:

```sh
mastermind translate-blocks <file>          # → { "targetLang", "cachePath", "blocks":[{"hash","text"}] }
# translate each block's text (preserve all Markdown + CriticMarkup), then:
printf '%s' '[{"hash":"…","text":"<translated>"}]' | mastermind translate-blocks <file> --save
mastermind open <file>                       # the language toggle is warm; the cache survives offline
```

This is mandatory, not optional: the reading-language toggle is **cache-only** — clicking it
flips between the original and whatever is already cached and never sends a live request. So
`mastermind open` enforces a warm cache: it exits `2` on a cold/partial cache and points back
at the two commands above. Use `mastermind open --no-translate <file>` to open a doc you don't
need translated.

`mastermind config`, `browsers`, `themes`, and `typefaces` round out the CLI the skills drive.

## How the protocol behaves

- `mastermind open --wait <file>` prints the review URL to stdout immediately, then blocks. It **serves the assist channel by default** — a background warm-up that keeps the cache current (e.g. for blocks edited mid-review) by answering the `mastermind-assist:` lines it prints. This is a convenience on top of the mandatory translate-first step, not a substitute for it (the toggle click itself never asks the agent). Pass `--no-assist` to review without it.
- On **Save & hand back** it prints one machine-readable line and exits `0`:

  ```
  mastermind: review complete — 3 comments, 2 suggested edits
  ```

- Exit `1`: the tab was closed without handing back, the browser never connected, or the daemon went away. Exit `130`: Ctrl+C. Exit `2`: bad invocation (missing file, pinned port owned by another process, or a cold translation cache — pre-translate first, or pass `--no-translate`).
- The same wording lands in the file inside the summary block:

  ```markdown
  <!-- mastermind:summary -->
  > **Review summary** (2026-06-12 14:30)
  > 3 comments, 2 suggested edits, 1 highlight. Open the CriticMarkup marks above for details.
  <!-- /mastermind:summary -->
  ```

  Delete it while revising — Mastermind treats its absence as normal and rewrites it on the next hand-back.

- Comment threads are consecutive comment marks with author tags: `{==span==}{>>@ke: question<<}{>>@agent: answer<<}`. To reply in a thread, append another `{>>@agent: …<<}` immediately after — but prefer revising the document directly.
- While the file is open in a tab, your on-disk edits surface as a "file changed on disk" banner with a reload, so edit freely between rounds.

## Acting as Mastermind's LLM provider (agent-channel)

If the user sets the translation provider to **"Your coding agent"** in Settings, Mastermind routes translation to *you* through the file channel — no API key, no cloud.

Run a listener alongside the review (a background process is ideal — it streams one JSON line per task to stdout):

```
mastermind assist <plan-file>.md
```

Each task line is prefixed `mastermind-assist: ` followed by JSON. There is one kind:

1. **translate** — `mastermind-assist: {"id":"…","kind":"translate","sourceLang":"…","targetLang":"…","blocks":[{"hash":"…","text":"…"}]}`
   Translate each block's text. **Preserve all Markdown and CriticMarkup syntax exactly** (`{++ ++}`, `{-- --}`, `{~~ ~> ~~}`, `{== ==}`, `{>> <<}`); translate only the human-readable text, and keep `@name:` author tags untranslated. Reply:
   ```
   mastermind assist-result <id> --blocks '[{"hash":"…","text":"<translated>"}]'
   ```

If you can't fulfill a task: `mastermind assist-error <id> --reason "…"`. Tasks expire after ~2 minutes; a late reply is ignored.

### Serving assist alongside an open document

A `--wait` review serves the assist channel **by default**, so the common review flow already pre-translates:

- `mastermind open --wait <file>` — the blocking review loop; **serves assist by default**. Add `--no-assist` to review without it.
- `mastermind open --serve-assist <file>` — opens the doc and answers assist tasks **without blocking** on hand-back. Use this when you want translation to just work while the user reads but don't need the hand-back signal.
- `mastermind assist <file>` — a standalone listener (no browser tab of its own).

All bind to the same session by the file's real path, print the same `mastermind-assist:` lines, and auto-reconnect across transient drops so translation stays live for the whole review. **To actually pre-translate, answer those lines** — run the command as a background process and reply to each `translate` task with `mastermind assist-result`; left unanswered, the tasks simply expire and the toggle falls back to whatever is already cached.

The reading-language toggle is always clickable: it flips instantly to any translation already cached on disk (`.mastermind/translations/`, which survives reloads and works with no agent), and when a block isn't cached and nothing is serving assist, clicking it surfaces a "run `mastermind open --serve-assist`" notice.
