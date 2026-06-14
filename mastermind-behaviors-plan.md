# Plan — Default "designed behaviors" for every Mastermind install

**Goal.** When anyone installs Mastermind, they also get a set of agent behaviors:
a `setup` flow, a `demo`, one-command visualization of any `.md`, and automatic
bilingual plan reviews — all routed through Mastermind's existing translate-toggle.

Decisions already made: **(1) Multi-agent** — ship files for Claude Code, Cursor,
Gemini (+ the portable `.agents/` format), logic pushed into the CLI. **(2) Reuse
`langPair`** — Preferred = `langPair.a`, Secondary = `langPair.b`. **(3) Plan-mode
fires globally** — written into each agent's global instruction config.

---

## What changed across review rounds

- **Round 3 (this pass):** "translate first" is now a **Skill guardrail backed by an
  offline cache write** — the agent translates up front and writes the translation cache
  file directly, so the toggle is warm on open with no live serve loop. (Resolves @ke's
  two comments: guardrail it via Skill; don't design it as Mastermind heuristics.)
- **Round 2 (drill):** corrected two wrong claims — there is no headless translation
  backend (the agent *is* the backend), and the `ExitPlanMode` hook can't inject context
  (so plan-mode is a global instruction, not a hook). Added concrete file-level detail.

---

## What already exists (the leverage)

- **`config.langPair = { a, b }` already IS Preferred/Secondary**; Settings has a
  searchable picker bound to it (`SettingsPanel.tsx:352`).
- **The translate pill already toggles two versions** (`TopBar.tsx` → `TranslatedView`):
  version 1 = file as written, version 2 = its translation.
- **The translation cache is a plain on-disk map** — `.mastermind/translations/<file>.<lang>.json`,
  `{ blockHash: translatedText }`, read by `loadCache()` before any agent call. **Pre-writing
  it = an instant-warm toggle with no agent serving** (the unlock for "translate first").
- **`segmentBlocks()` / `hashBlock()` are isomorphic** (`src/shared/blocks.ts`) — the CLI
  can segment + hash a doc identically to the browser, so cache keys match.
- **Translation routes only to the coding agent** (no API keys); CriticMarkup structure
  validated on each block.

### Genuinely missing

The `/mastermind` skill, a setup flow, preferred-browser support, a config primitive, the
two offline `translate-blocks` helpers, and a bundled demo.

---

## Architecture (4 layers)

```
Per-agent skill files      ← thin: drive the conversation, translate offline,
   (.claude/.cursor/.gemini/.agents: skills + GLOBAL instruction blocks)   call CLI
            │
Mastermind CLI             ← NEW: config, browsers, themes, typefaces,
   (src/cli)                  translate-blocks, open --browser, install-agents
            │
HTTP daemon + server       ← + GET /api/browsers, browser detection
   (src/server)
            │
Config + shared data       ← + `browser` field; move font/code registries + pickTarget
   (src/shared, ~/.config/mastermind/config.json, src/ui/settings)   to src/shared
```

Principle: **CLI does everything deterministic; each agent file only "asks the user"
(native question UI), "translates the doc" (its own LLM), and "states the rules"
(global instruction block).**

---

## Config schema (`src/shared/types.ts`, `src/server/config.ts`)

| Field | Type | Default | Purpose |
| --- | --- | --- | --- |
| `browser` | `string` | `''` | App name / bundle id to open in. `''` = system default. |
| `langPair.a` | `string` | `'English'` | **Preferred language** (same field, relabeled). |
| `langPair.b` | `string` | `'Simplified Chinese'` | **Secondary language** (same field, relabeled). |

`readConfig()` merges over `DEFAULT_CONFIG`, so old files gain `browser: ''` free —
no migration. `browser` flows through `ConfigPatch` / `redactConfig` automatically.

---

## CLI primitives (`src/cli/index.ts`)

| Command | Behavior (verified) |
| --- | --- |
| `config get [key]` | Read via `readConfig()` directly — always daemon-free. |
| `config set <k=v…>` | **Daemon up → `PUT /api/config`** (fires SSE so open tabs live-update). **Daemon down → `updateConfig()` direct.** Never raw-write while daemon runs. Dotted keys. |
| `browsers [--json]` | Installed browsers (macOS) — shared with `GET /api/browsers`. |
| `themes [--json]` | Color themes via `scanThemes()`. |
| `typefaces [--json]` | Type sets + code schemes from the new `src/shared` registries. |
| `translate-blocks <file>` | **Emit** mode: `segmentBlocks()` + shared `pickTarget` → prints `{ targetLang, cachePath, blocks:[{hash,text}] }` (translatable only). |
| `translate-blocks <file> --save <json>` | **Write** mode: writes `.mastermind/translations/<file>.<lang>.json` in the exact `loadCache` format. No daemon, no browser. |
| `open … --browser <id>` | Honor `config.browser`; `--browser` overrides. Replaces the macOS-only `spawn('open', …)` at `cli/index.ts:27-29` with an app-aware launcher (`open -a <App>`). |
| `install-agents` / `uninstall-agents` | Provision/remove skill files + global instruction blocks per detected agent. |

`config.ts` + `paths.ts` import cleanly into the CLI (no Hono pulled in) — the cli→server
import direction already ships (`cli/daemon.ts`, `cli/index.ts`).

---

## "Translate first" — Skill guardrail + offline cache write

The agent **is** the translator, so "prepare both versions before visualizing" is a Skill
protocol, realized as a pure offline file op — no serve loop, no browser round-trip:

1. `mastermind translate-blocks <file>` → emits the target language + translatable blocks.
2. The agent translates each block itself.
3. `mastermind translate-blocks <file> --save '[{hash,text}]'` → writes the cache file.
4. `mastermind open --browser … <file>` → on open, `translateBlocks` finds every block in
   the cache (all hits, **zero assist requests, no agent need be serving**); the toggle is
   instantly warm.

Why this is the clean realization of the review comments:

- **No circularity.** Round 2's blocker (one process can't both drive *and* answer live
  translation) disappears — translation happens offline, agent → file.
- **Minimal Mastermind code:** two thin `translate-blocks` helpers, not a daemon-driven
  pre-translate. The behavior lives in the **Skill guardrail**.
- **Agent-agnostic:** any agent runs the same CLI + its own translation — fits multi-agent.
- **Incremental:** hash-keyed cache → re-visualizing only re-translates *changed* blocks.
- The **live assist channel stays** for translating edits made inside the browser.

> Correctness detail: the CLI must write the cache under the **same target-language string
> the browser will request**. Move `pickTarget` (today in the UI store, uses isomorphic
> `detectDocScript`/`isCjkLang`) into `src/shared` so CLI and UI agree → guaranteed hit.

---

## Shared-data move (feeds setup picker + cache-key parity)

Move **data only** (browser-safe):

- **→ `src/shared/fonts.ts`**: `TypeSet`/`MonoFont`/`FontFace` types, `TYPE_SETS`,
  `MONO_FONTS`, `DEFAULT_TYPE_SET`, `DEFAULT_MONO`, `typeSetById`, `monoById`.
- **→ `src/shared/codeThemes.ts`**: `CodeTheme`, `CODE_THEMES`, `COLOR_TOKS`,
  `DEFAULT_CODE_THEME`, `codeThemeById` (`HlToken` import shortens to `./highlight`).
- **→ `src/shared/`**: `pickTarget` (for CLI/UI cache-key parity, see above).
- **Stays in `src/ui/theme/`**: `FONT_FACES`, `displayStack`/`bodyStack`/`monoStack`,
  `codeThemeVars` (DOM/asset presentation).
- **Update**: 2 import sites (`ThemeProvider.tsx:3-4`, `SettingsPanel.tsx:7-8`) +
  3 stale doc-comments (`types.ts:131,135`, `highlight.ts:8`). Barrel re-export keeps
  importer edits at zero.

---

## Server + Settings UI

- **`src/server/browsers.ts`** (new): macOS detection via `/Applications` +
  `mdfind kMDItemCFBundleIdentifier`, allowlisted (Safari, Chrome, Arc, Firefox, Brave,
  Edge, …). **`GET /api/browsers`** (template: `/api/themes` at `app.ts:133`).
- **Settings** (`SettingsPanel.tsx`):
  - **"Open in browser"** row (copy the UI-language chip pattern at `:334-351`), writing
    `config.browser`; browsers pre-loaded into the config store (mirror `themes`).
  - **Relabel** the two reading-pair slots — today both reuse `t('readingPair')` + " 1/2"
    (`:356,369`). Add `preferredLanguage` / `secondaryLanguage` keys to **both** `en` and
    `zh-CN` (`i18n/index.ts` ~`:113`/`:232`; `MsgKey` typing forces parity); point the two
    `LangSelect label=` props at them. `LangSelect` unchanged.

---

## The designed behaviors → implementation

| Behavior | How |
| --- | --- |
| `/mastermind setup` | Skill asks (native question UI) Preferred lang, Secondary lang, Browser, Font theme, Color theme — options from `mastermind browsers/themes/typefaces --json`. Applies via `mastermind config set …`. |
| `/mastermind demo` | Agent writes a short showcase doc **in the Preferred language** (localized from a bundled template, in a writable cwd so `.mastermind/` lands beside it), translates it offline, opens it. |
| `/mastermind` (bare) | Agent resolves the **most recent `.md` it wrote/edited this session**; if none, ask. Then translate-then-open. |
| `/master "file"` | Alias skill delegating to `mastermind` with an explicit path. |
| Plan mode → 2 versions | **Global instruction** (`~/.claude/CLAUDE.md` + Cursor/Gemini global equivalents): after a plan, write it to `.md` in the chat language, translate offline, open. Block kept tight (≤ ~25 lines; global memory targets <200 total). |
| Always translate first | **Skill guardrail**: every visualize path runs `translate-blocks` (emit → translate → `--save`) before `open`. Pure offline cache write; no Mastermind heuristic. |
| Reading pair ↔ Pref/Secondary | Already one field; setup writes it, Settings relabels it. |

---

## Multi-agent provisioning (`mastermind install-agents`)

Layout confirmed from the existing `impeccable` skill dirs. Runs from `npm` postinstall,
re-runnable. For each present agent (`~/.claude`, `~/.cursor`, `~/.gemini`, `.agents/`):

- Write `skills/mastermind/SKILL.md` (+ a `master` alias skill). Frontmatter per agent:
  all take `name`+`description` (Cursor adds `version`+`license`, Gemini `version`);
  subcommand dispatch via `$0`/`$1`/`$ARGUMENTS`.
- Append a **global instruction block** to each agent's global memory, wrapped in
  `<!-- mastermind:begin --> … <!-- mastermind:end -->` markers (idempotent, removable).
- **Confirm at impl time**: Claude global = `~/.claude/CLAUDE.md` ✓ (loaded everywhere);
  Cursor/Gemini *global*-instruction paths still need verifying (drill confirmed their
  *skill* dirs, not global-memory paths).
- Claude `settings.json` is left untouched — the instruction block is the cross-agent
  baseline (the `ExitPlanMode` hook can't inject context anyway).

---

## Translation direction (unchanged, documented)

Docs are authored in the chat language (≈ Preferred); the toggle swaps to the other side
of `langPair`, direction picked by the now-shared `pickTarget()` CJK heuristic. **Known
edge:** two same-script languages assume side `a` is source — a doc written in Secondary
still renders as-is and toggles to Preferred. Acceptable; note in `KNOWN_LIMITATIONS.md`.

---

## Phased implementation

- **P1 — Config + shared data.** `browser` field; move font/code registries **and
  `pickTarget`** to `shared` (2 imports + 3 comments); `config get/set` (daemon up/down).
- **P2 — Browser + Settings.** `src/server/browsers.ts` + `/api/browsers`; rewrite
  `openBrowser`; `open --browser`; Settings "Open in browser" row + reading-pair relabel.
- **P3 — translate-blocks + demo.** `translate-blocks` emit/`--save` (offline cache write,
  shared `segmentBlocks`+`pickTarget`); bundled demo template + localization. Tests:
  hash + cache-path + target-lang parity with the browser.
- **P4 — Skills + provisioning.** Author `mastermind` (+ `master`) skill for the 4 formats;
  global instruction blocks; `install-agents`/`uninstall-agents`. Verify Cursor/Gemini paths.
- **P5 — Docs + e2e.** `AGENT_SETUP.md`, `README.md`, `KNOWN_LIMITATIONS.md`; e2e of
  setup → demo → plan-mode round-trip.

---

## Testing

- `config get/set`: dotted keys; daemon-up PUTs (open tab sees SSE), daemon-down writes file.
- **`translate-blocks` parity**: CLI-written cache produces all-hits on the browser's
  `POST /api/translate` (same hashes + same target-lang string); survives no agent serving.
- Browser detection against a mocked `/Applications`; `openBrowser` honors `config.browser`.
- `typefaces/themes` listing matches the shared registries (one source of truth).
- `install-agents` idempotent + marker-wrapped; `uninstall` removes cleanly.
- Byte-exact + mark-direction invariants untouched (translation engine unchanged).

---

## Risks & open questions

- **Big-doc token cost** — "always translate first" makes the agent translate every block
  on first visualize; amortized by the hash-cache (only changed blocks re-translate). Cap?
- **Cursor/Gemini global-instruction paths** unverified — small impl risk for "every plan
  globally" on non-Claude agents.
- **Global agent-config writes** are invasive by design — marker-wrapped + uninstall path.
- **Demo content**: generate per-run in Preferred language (authentic) vs static sample?
- **Plan-mode** only fires once a plan is written to `.md`; chat-only plans are skipped.
- **macOS-only browser launch** for v1 (matches today's code).

---

## Out of scope

Windows/Linux browser launching; >2 languages in the pair; a Claude Code *plugin* package
(chose plain multi-agent files); a settings.json `ExitPlanMode` hook (can't inject context).
