# Agent setup

Paste the block below into your `CLAUDE.md` / agent instruction file to make plan reviews flow through Mastermind.

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

## How the protocol behaves

- `mastermind open --wait <file>` prints the review URL to stdout immediately, then blocks.
- On **Save & hand back** it prints one machine-readable line and exits `0`:

  ```
  mastermind: review complete — 3 comments, 2 suggested edits
  ```

- Exit `1`: the tab was closed without handing back, the browser never connected, or the daemon went away. Exit `130`: Ctrl+C. Exit `2`: bad invocation (missing file, pinned port owned by another process).
- The same wording lands in the file inside the summary block:

  ```markdown
  <!-- mastermind:summary -->
  > **Review summary** (2026-06-12 14:30)
  > 3 comments, 2 suggested edits, 1 highlight. Open the CriticMarkup marks above for details.
  <!-- /mastermind:summary -->
  ```

  Delete it while revising — Mastermind treats its absence as normal and rewrites it on the next hand-back.

- Comment threads are consecutive comment marks with author tags: `{==span==}{>>@ke: question<<}{>>@agent: answer<<}`. To reply in a thread, append another `{>>@agent: …<<}` immediately after — but prefer revising the document directly.
- While the file is open in a tab, your on-disk edits surface as a "file changed on disk" banner with a reload + revision diff, so edit freely between rounds.

## Acting as Mastermind's LLM provider (agent-channel)

If the user sets the translation provider to **"Your coding agent"** in Settings, Mastermind routes translation (and inline edit-suggestions) to *you* through the file channel — no API key, no cloud.

Run a listener alongside the review (a background process is ideal — it streams one JSON line per task to stdout):

```
mastermind assist <plan-file>.md
```

Each task line is prefixed `mastermind-assist: ` followed by JSON. Two kinds:

1. **translate** — `mastermind-assist: {"id":"…","kind":"translate","sourceLang":"…","targetLang":"…","blocks":[{"hash":"…","text":"…"}]}`
   Translate each block's text. **Preserve all Markdown and CriticMarkup syntax exactly** (`{++ ++}`, `{-- --}`, `{~~ ~> ~~}`, `{== ==}`, `{>> <<}`); translate only the human-readable text, and keep `@name:` author tags untranslated. Reply:
   ```
   mastermind assist-result <id> --blocks '[{"hash":"…","text":"<translated>"}]'
   ```

2. **suggest** — `mastermind-assist: {"id":"…","kind":"suggest","scope":"selection|section|document","selection":"<raw md>","context":"<surrounding>"}`
   Propose improvements **as CriticMarkup over the selection only** — insertions `{++…++}`, deletions `{--…--}`, substitutions `{~~old~>new~~}`. Do **not** add comments or highlights, and do not rewrite text outside the marks (Mastermind rejects any markup whose rejected form differs from the original selection). Return the selection with your marks inline. Reply:
   ```
   mastermind assist-result <id> --markup '<selection-with-criticmarkup>'
   ```
   The user reviews every proposed mark and accepts/edits/dismisses each before it enters the document — your suggestions never touch the file directly.

If you can't fulfill a task: `mastermind assist-error <id> --reason "…"`. Tasks expire after ~2 minutes; a late reply is ignored.

### Serving assist alongside an open document

Prefer opening the document with assist already attached — that's what lights up the reading-language toggle (it stays disabled until an agent is listening on *that* session):

- `mastermind open --serve-assist <file>` — opens the doc for review **and** answers assist tasks **without blocking** on hand-back. Use this whenever you want translation / inline suggestions to just work while the user reads.
- `mastermind open --wait --serve-assist <file>` — the blocking review loop that *also* answers assist tasks.
- `mastermind assist <file>` — a standalone listener (no browser tab of its own).

All three bind to the same session by the file's real path, print the same `mastermind-assist:` lines, and auto-reconnect across transient drops so the toggle stays live for the whole review. If the toggle shows "Run `mastermind open --serve-assist`", no agent is currently serving that session.
