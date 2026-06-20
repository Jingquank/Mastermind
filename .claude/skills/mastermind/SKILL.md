---
name: mastermind
description: Visualize and review a Markdown file in Mastermind — configure preferences (/mastermind setup), run the bilingual demo (/mastermind demo), or open any .md (/mastermind <file>, or bare = the most recent .md from this chat). Always pre-translates the doc into both reading languages first. Use whenever the user wants to open, visualize, or review a doc in Mastermind.
---

# Mastermind

Mastermind shows one `.md` as a reviewable document whose reading-language toggle flips
between the user's **Preferred** (`langPair.a`) and **Secondary** (`langPair.b`) languages.
**You are the translator** — there is no API key. The rule for every path below: **translate
first, then open**, so the toggle is warm the instant the page loads.

Dispatch on `$ARGUMENTS`:

## `/mastermind setup`
Configure the five defaults. Pull the option lists from the CLI, then ask the user with your
native question UI (one round, multiple-choice where possible):

```sh
mastermind browsers --json    # installed browsers → "Preferred browser"
mastermind themes --json      # color themes → "Color theme"
mastermind typefaces --json   # type sets → "Font theme"
```

Ask for: **Preferred language**, **Secondary language**, **Preferred browser**, **Color
theme**, **Font theme**. Apply in one call (a = Preferred, b = Secondary):

```sh
mastermind config set langPair.a="<Preferred>" langPair.b="<Secondary>" \
  browser="<app or empty>" theme="<themeId>" typeSet="<typeSetId>"
```

Numeric/unknown keys are rejected with exit 2 — surface the message if a set fails. Confirm
what you set.

## `/mastermind demo`
Localize the showcase template in `reference/demo.md` **into the Preferred language** (keep
every CriticMarkup mark intact), write it to `./mastermind-demo.md`, then run the **Visualize
flow** on it. The toggle reveals the Secondary-language version.

## `/mastermind <file>`  (bare `/mastermind` → most recent `.md` you wrote this chat)
Run the **Visualize flow** on the given file. With no argument, use the most recent `.md` you
created or edited in this conversation; if there is none, ask which file.

## Visualize flow — ALWAYS TRANSLATE FIRST
1. `mastermind translate-blocks <file>` → prints `{ "targetLang", "cachePath", "blocks":[{"hash","text"}] }`.
   - If `blocks` is empty, the cache is already warm — skip to step 4.
   - If it errors that `langPair` is unset, tell the user to run `/mastermind setup` first.
2. Translate each block's `text` into `targetLang`. **Preserve all Markdown + CriticMarkup
   syntax exactly** (`{++ ++}`, `{-- --}`, `{~~ ~> ~~}`, `{== ==}`, `{>> <<}`); translate only
   human-readable text; leave `@name:` author tags untranslated.
3. Write them to the cache via stdin:
   ```sh
   printf '%s' '[{"hash":"…","text":"<translated>"},…]' | mastermind translate-blocks <file> --save
   ```
   It reports how many cached (and skips stale-hash / CriticMarkup-mismatch entries).
4. Open it: `mastermind open <file>` (uses the configured browser; toggle is warm). `open`
   enforces this flow — it refuses a cold cache (exit 2) and points back to steps 1–3, because
   the reading-language toggle is cache-only and never fetches on demand. (`--no-translate`
   bypasses the guard for docs you don't need translated.)
   - **Plan you want reviewed?** Run steps 1–3 first as always, then use `mastermind open --wait
     <file>` instead of plain open, and follow the plan-review protocol: when it returns, re-read
     the file, apply/argue each CriticMarkup mark and comment, remove the resolved marks + the
     `mastermind:summary` block, and re-translate + re-open for the next round until approved.
