/** A single splice on a source string. `from`/`to` are UTF-16 code-unit offsets. */
export interface TextEdit {
  from: number
  to: number
  insert: string
}

export interface ServerState {
  port: number
  pid: number
  version: string
  startedAt: number
}

export interface HealthResponse {
  ok: true
  pid: number
  version: string
  startedAt: number
}

export interface CreateSessionRequest {
  /** Absolute path of an existing file to open. */
  path?: string
  /** Create an untitled draft in `dir` instead of opening `path`. */
  draft?: boolean
  dir?: string
}

export interface CreateSessionResponse {
  sessionId: string
  url: string
  /** false when an existing session for the same realpath was reused */
  created: boolean
  isDraft: boolean
}

export interface SessionMeta {
  sessionId: string
  path: string
  displayName: string
  isDraft: boolean
  mtimeMs: number
  /** A `mastermind open --wait` is currently blocked on this session. */
  agentWaiting: boolean
  /** An assist-capable agent (`mastermind assist`) is listening on this session. */
  assistAvailable: boolean
}

export interface FileResponse {
  content: string
  mtimeMs: number
}

/* ---- workspace (file tree) ---- */

export interface CreateWorkspaceRequest {
  /** Absolute (or cwd-relative) path of a directory to browse. */
  root?: string
}

export interface CreateWorkspaceResponse {
  workspaceId: string
  url: string
  /** realpath of the root */
  root: string
  displayName: string
}

export interface WorkspaceMeta {
  workspaceId: string
  root: string
  displayName: string
}

/** One entry in a single directory level of the tree (client recurses lazily). */
export interface TreeEntry {
  name: string
  /** path relative to the workspace root (forward-slashed, never absolute) */
  rel: string
  isDir: boolean
  isMarkdown: boolean
}

export interface TreeResponse {
  /** the directory listed, relative to root ('' = root) */
  dir: string
  entries: TreeEntry[]
}

/** Lazy per-file review badge — counts are null for non-markdown or unreadable files. */
export interface FileMeta {
  rel: string
  counts: ReviewCounts | null
  mtimeMs: number
}

/** An open session whose file lives under a workspace root (drives tree dots). */
export interface WorkspaceSessionInfo {
  rel: string
  sessionId: string
  agentWaiting: boolean
  assistAvailable: boolean
  isDraft: boolean
}

export type SessionCloseReason = 'tabs-closed' | 'never-opened' | 'shutdown'

export interface ReviewCounts {
  comments: number
  edits: number
  highlights: number
}

/* ---- config ---- */

/** Film-grain density steps; `off` supersedes the legacy on/off toggle. */
export type GrainIntensity = 'off' | 'low' | 'medium' | 'high'
/** Film-grain texture presets (feTurbulence parameter sets). */
export type GrainTexture = 'fine' | 'soft' | 'coarse'

export interface MastermindConfig {
  version: 1
  theme: string
  /** px */
  fontSize: number
  lineHeight: number
  /** px */
  contentWidth: number
  authorTag: string
  /** id of the chosen curated type set (display + body); see src/shared/fonts.ts */
  typeSet: string
  /** id of the chosen monospace face (code, filenames, CriticMarkup source) */
  monoFont: string
  /** id of the chosen code-color scheme; `none` = uncolored (see src/shared/codeThemes.ts) */
  codeTheme: string
  uiLang: 'en' | 'zh-CN'
  /** the reading-language toggle pair (a = Preferred, b = Secondary; routes to the user's agent) */
  langPair: { a: string; b: string }
  /** app name / bundle id to open Mastermind in; '' = the system default browser */
  browser: string
  /** per-theme grain overrides; `enabled` is the legacy on/off, superseded by `intensity` */
  grain: Record<string, { enabled?: boolean; intensity?: GrainIntensity; texture?: GrainTexture }>
}

/** What the browser sees. No secrets to redact — translation is agent-only, no keys stored. */
export type ClientConfig = MastermindConfig

/** An installed, launchable browser (macOS); `id` is the `open -a <id>` app name. */
export interface BrowserInfo {
  id: string
  name: string
}

export interface ThemeFontInfo {
  family: string
  url: string
  weight: string | number
}

export interface ThemeInfo {
  id: string
  name: string
  appearance: 'light' | 'dark'
  grain: { enabled: boolean; opacity?: number; tintOpacity?: number } | null
  fonts: ThemeFontInfo[]
  /** Preview hexes for the picker swatch (theme's own bg / muted ink / accent). */
  swatch: { bg: string; ink: string; accent: string } | null
}

export type SseEvent =
  | { event: 'ping'; data: Record<string, never> }
  | { event: 'file-changed'; data: { mtimeMs: number } }
  | { event: 'file-deleted'; data: Record<string, never> }
  | { event: 'handback'; data: { summaryLine: string; counts: ReviewCounts } }
  | { event: 'session-closed'; data: { reason: SessionCloseReason } }
  | { event: 'config-changed'; data: Record<string, never> }
  | { event: 'waiters-changed'; data: { count: number } }
  /** an assist-capable agent (mastermind assist) is/ isn't listening on this session */
  | { event: 'assist-availability'; data: { available: boolean } }
  /** server → agent: please do this LLM task and POST the result back */
  | { event: 'assist-request'; data: AssistRequestEvent }
  /** server → ui: a suggest request settled (translate results return on the HTTP response) */
  | { event: 'assist-result'; data: { id: string; kind: 'suggest'; ok: boolean } }
  /** workspace → tree: a directory's listing changed (add/remove/rename) */
  | { event: 'file-list-changed'; data: { dir: string } }
  /** workspace → tree: one file's review badge changed (re-fetch its file-meta) */
  | { event: 'file-badge-changed'; data: { rel: string } }

export type SseEventName = SseEvent['event']

/* ---- agent-channel (assist) ---- */

export interface AssistBlock {
  hash: string
  text: string
}

export type AssistRequestEvent =
  | { id: string; kind: 'translate'; sourceLang: string; targetLang: string; blocks: AssistBlock[] }
  | { id: string; kind: 'suggest'; scope: 'selection' | 'section' | 'document'; selection: string; context?: string }

export type AssistResultPayload = { kind: 'translate'; blocks: AssistBlock[] } | { kind: 'suggest'; markup: string }
