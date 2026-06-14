## Mastermind: always visualize bilingually

Whenever you open, visualize, or review any Markdown file or plan in Mastermind, you MUST
**translate it into both reading languages first, then open it** — so the reading-language
toggle is warm. Use the `mastermind` skill's Visualize flow: `mastermind translate-blocks
<file>` → translate the emitted blocks (preserving Markdown + CriticMarkup) → pipe them to
`mastermind translate-blocks <file> --save` → `mastermind open <file>`.

After you finish making a plan, write it to a `.md` file and run that same flow — preparing
both the chat-language version and the secondary-language translation — using `mastermind open
--wait <file>` when you want the user to review and hand it back. Set the language pair once
with `/mastermind setup`.
