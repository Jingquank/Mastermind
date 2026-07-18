## Mastermind: always visualize bilingually

Whenever you open, visualize, or review any Markdown file or plan in Mastermind, you MUST
**translate it into both reading languages first, then open it** — so the reading-language
toggle is warm. Use the `mastermind` skill's Visualize flow: `mastermind translate-blocks
<file>` → translate the emitted blocks (preserving Markdown + CriticMarkup) → pipe them to
`mastermind translate-blocks <file> --save` → `mastermind open <file>`. The toggle is
cache-only (a click never triggers a live translation), so `open` refuses a cold cache
(exit 2) — translate first, or pass `--no-translate` for a doc you don't need translated.

Treat routine Mastermind language work as affordable-model work. Delegate each complete batch of
missing translation blocks through the host's native fast/affordable model tier when possible; in
Claude Code, use the `sonnet` alias. If native delegation is unavailable, use only an already
installed and authenticated CLI from the same host/vendor, then fall back to the active agent.
Never install or authenticate tooling, change provider configuration, send unrelated repository
context, or delegate plan authoring, ambiguous rewrites, or review-feedback interpretation. If a
delegated result is malformed, incomplete, or fails Mastermind validation, immediately finish it
with the active agent.

After you finish making a plan, write it to a `.md` file and run that same flow — preparing
both the chat-language version and the secondary-language translation — using `mastermind open
--wait <file>` when you want the user to review and hand it back. Set the language pair once
with `/mastermind setup`.
