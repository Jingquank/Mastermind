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
