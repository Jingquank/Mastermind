# Known limitations (v0.1)

Edge cases punted deliberately, with the behavior you get instead.

## CriticMarkup parsing

- **Marks cannot span block boundaries.** A span may contain newlines but never a blank line; an opener whose closer sits past a blank line renders literally. (By design — also keeps the scanner's blank-line termination rule simple.)
- **Marks do not nest.** `{++a {--b--} c++}` parses the outer insertion with literal braces inside.
- **Delimiter pairs at different inline depths render literally.** e.g. an opener in plain text whose closer lives inside a link's text. Both delimiters show as text; nothing is lost.
- **Block-level syntax inside ins/del/highlight content degrades.** `{++\n- item\n++}` (a list inside a mark) renders the delimiters literally.
- **Files using U+E000–U+E04F private-use codepoints** can collide with the masking sentinels; five fallback pools are tried, then the file renders without mark support.
- Substitution arms and comment bodies are **plain text** (no bold/links inside them); inline markdown inside insertions/deletions/highlights renders fully.

## Editing (WYSIWYG)

- **Byte-exact saves are guaranteed only for unedited documents** (including type-then-undo). Any real edit reserializes the whole document in house style: `-` bullets, `*` emphasis, backtick fences, one-space list indents, `\~`-escaped tildes, normalized table padding. Untouched-block byte preservation is a v0.2 goal.
- **Substitutions are atomic in Editing mode** — accept/reject or edit their arms in Source mode.
- **Accept/reject hover actions live in Reading mode**; switch modes to resolve marks while editing.
- Boundary spaces inside marks (`{++word ++}`) may normalize outward on edited saves (`{++word++} `), which is semantically identical.
- Typing never creates suggestions — WYSIWYG edits are plain edits. Suggested edits are authored from the Reading-mode toolbar or by hand in Source mode.

## Selection & comments

- Selecting **across block boundaries** or **across existing marks** is refused (the toolbar simply doesn't appear).
- Selections inside text whose source contains escapes/entities fall back to substring search; ambiguous matches are refused rather than guessed.
- Anchored-comment adjacency is strict: `{==span==}{>>note<<}` with zero characters between the marks.

## Translated view

- Body text is **read-only**; only block-granularity comments are available (highlighting from the translated view is not — use the source-language view). Comments append to the end of the corresponding source block.
- The comment rail, selection toolbar, and accept/reject are hidden while translated view is active.
- Reading-language direction uses a CJK-vs-Latin script heuristic; same-script pairs (e.g. en ⇄ fr) translate toward `langPair.b`.
- The mastermind summary block's blockquote is translated like any other block.

## Files & platform

- One file per session; one daemon per machine. Mixed-EOL files normalize to the dominant flavor on save.
- Relative images in documents don't resolve (the document's directory isn't served).
- Raw HTML blocks render as source text, not as HTML; HTML comments are hidden.
- Reference-style links render as plain text of their label.
- The localhost API trusts local processes (it binds 127.0.0.1 with Host/Origin guards and random session ids, but any local process can talk to it).
- The translation API key is stored in plaintext at `~/.config/mastermind/config.json` (chmod 600).
- Desktop browsers only; macOS is the tested platform.
