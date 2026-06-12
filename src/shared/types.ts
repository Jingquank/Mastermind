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
}

export interface FileResponse {
  content: string
  mtimeMs: number
}

export type SessionCloseReason = 'tabs-closed' | 'never-opened' | 'shutdown'

export interface ReviewCounts {
  comments: number
  edits: number
  highlights: number
}

/* ---- config ---- */

export interface ProviderConfig {
  type: 'anthropic' | 'openai-compatible'
  baseUrl?: string
  apiKey?: string
  model?: string
}

export interface MastermindConfig {
  version: 1
  theme: string
  /** px */
  fontSize: number
  lineHeight: number
  /** px */
  contentWidth: number
  authorTag: string
  uiLang: 'en' | 'zh-CN'
  /** the reading-language toggle pair */
  langPair: { a: string; b: string }
  keepOriginalFeedback: boolean
  /** per-theme grain overrides */
  grain: Record<string, { enabled?: boolean }>
  provider: ProviderConfig | null
}

/** What the browser sees — never the API key. */
export interface ClientConfig extends Omit<MastermindConfig, 'provider'> {
  provider: { type: ProviderConfig['type']; baseUrl?: string; model?: string; configured: boolean } | null
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
}

export type SseEvent =
  | { event: 'ping'; data: Record<string, never> }
  | { event: 'file-changed'; data: { mtimeMs: number } }
  | { event: 'file-deleted'; data: Record<string, never> }
  | { event: 'handback'; data: { summaryLine: string; counts: ReviewCounts; snapshotId: string } }
  | { event: 'session-closed'; data: { reason: SessionCloseReason } }
  | { event: 'config-changed'; data: Record<string, never> }

export type SseEventName = SseEvent['event']
