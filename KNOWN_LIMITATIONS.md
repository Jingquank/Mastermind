# Known limitations (v0.2)

Edge cases punted deliberately, with the behavior you get instead.

## CriticMarkup parsing

- **Marks cannot span block boundaries.** A span may contain newlines but never a blank line; an opener whose closer sits past a blank line renders literally. (By design — also keeps the scanner's blank-line termination rule simple.)
- **Marks do not nest.** `{++a {--b--} c++}` parses the outer insertion with literal braces inside.
- **Delimiter pairs at different inline depths render literally.** e.g. an opener in plain text whose closer lives inside a link's text. Both delimiters show as text; nothing is lost.
- **Block-level syntax inside ins/del/highlight content degrades.** `{++\n- item\n++}` (a list inside a mark) renders the delimiters literally.
- **Files using U+E000–U+E04F private-use codepoints** can collide with the masking sentinels; five fallback pools are tried, then the file renders without mark support.
- Substitution arms and comment bodies are **plain text** (no bold/links inside them); inline markdown inside insertions/deletions/highlights renders fully.

## Editing (WYSIWYG)

- **Byte-exact saves are guaranteed only for unedited documents** (including type-then-undo). Any real edit reserializes the whole document in house style: `-` bullets, `*` emphasis, backtick fences, one-space list indents, `\~`-escaped tildes, normalized table padding. Untouched-block byte preservation is a v0.3 goal.
- **Substitutions are atomic in Editing mode** — accept/reject works, but to edit a sub's arms use Source mode.
- **Accept/reject hover actions work in Reading and Editing modes.** On an unedited document the resolve is a byte-exact source splice; once you've typed (a dirty editor) it becomes a ProseMirror edit and the document follows the house-style serialization above.
- Boundary spaces inside marks (`{++word ++}`) may normalize outward on edited saves (`{++word++} `), which is semantically identical.
- Typing never creates suggestions — WYSIWYG edits are plain edits. Suggested edits are authored from the Reading-mode toolbar or by hand in Source mode.

## Selection & comments

- Selecting **across block boundaries** is supported: a mark can't cross a block in CriticMarkup, so the selection is split into one mark per spanned block (each block's slice wrapped independently; a comment anchors to the first block). Selecting **across existing marks** is still refused (the toolbar doesn't appear), as is a slice that can't be unambiguously mapped.
- Selections inside text whose source contains escapes/entities fall back to substring search; ambiguous matches are refused rather than guessed.
- Anchored-comment adjacency is strict: `{==span==}{>>note<<}` with zero characters between the marks.

## Translated view

- Body text is **read-only**; only block-granularity comments are available (highlighting from the translated view is not — use the source-language view). Comments append to the end of the corresponding source block.
- The comment rail, selection toolbar, and accept/reject are hidden while translated view is active.
- Reading-language direction uses a CJK-vs-Latin script heuristic; same-script pairs (e.g. en ⇄ fr) translate toward `langPair.b`.
- The mastermind summary block's blockquote is translated like any other block.

## Workspaces (file tree)

- **The tree is read-only and strictly contained.** Listing and per-file metadata go through one resolver (`resolveWithin`) that rejects absolute paths and `..` lexically, then realpath-resolves and requires the result to stay under the root. A symlink is followed only if its target resolves back inside the root; one pointing outside is dropped from the tree, not an error.
- **The tree is not a live filesystem mirror.** Mark badges and open/agent dots update over the workspace SSE channel (save, hand-back, agent attach) and on window-focus; a file created or deleted *outside* Mastermind appears/disappears on the next focus or directory refresh, not instantly.
- **Opening a file is still a single-file session.** A workspace is a directory context, not a multi-document editor — there is one active document at a time, and a file opened with `mastermind open` outside any root is a plain session that never joins a tree.
- `.git`, `.mastermind`, `node_modules`, and all dotfiles are hidden from the tree (they can still be opened directly with `mastermind open`).

## Agent-channel provider & inline suggestions

- **A plain `--wait` agent is not a provider.** Answering translate/suggest requests needs an assist-capable listener: `mastermind assist <file>` or `mastermind open --wait --serve-assist`. Without one the reading toggle is disabled (with a tooltip) and a suggest request fails fast rather than hanging; requests time out after 120s.
- **Agent-channel translations are session-scoped and never written to the on-disk cache** — one agent's answers must not masquerade as another's cache hit. Switching back to an API provider repopulates the persistent cache.
- **Inline suggestions are a staging gate.** Proposed marks live in the browser only; the server validates that returned markup contains only ins/del/sub *and* reduces (all-rejected) back to the exact original selection, so a "suggestion" can never smuggle a silent rewrite to disk. Nothing is written until you accept, and what lands is plain user-approved text.

## Files & platform

- One file per session; one daemon per machine. Mixed-EOL files normalize to the dominant flavor on save.
- Relative images in documents don't resolve (the document's directory isn't served).
- Raw HTML blocks render as source text, not as HTML; HTML comments are hidden.
- Reference-style links render as plain text of their label.
- The localhost API trusts local processes (it binds 127.0.0.1 with Host/Origin guards and random session ids, but any local process can talk to it).
- The translation API key is stored in plaintext at `~/.config/mastermind/config.json` (chmod 600).
- Desktop browsers only; macOS is the tested platform.
