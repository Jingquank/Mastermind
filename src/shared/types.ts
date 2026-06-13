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

export type ProviderType = 'anthropic' | 'openai-compatible' | 'agent-channel'

export interface ProviderConfig {
  /** 'agent-channel' = the user's own coding agent answers via the SSE/--wait channel (no key, no model). */
  type: ProviderType
  baseUrl?: string
  apiKey?: string
  model?: string
  /** agent-channel only: how long to wait for the agent to answer a request. */
  agentTimeoutMs?: number
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
  provider: { type: ProviderType; baseUrl?: string; model?: string; configured: boolean } | null
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
  | { event: 'waiters-changed'; data: { count: number } }
  /** an assist-capable agent (mastermind assist) is/ isn't listening on this session */
  | { event: 'assist-availability'; data: { available: boolean } }
  /** server → agent: please do this LLM task and POST the result back */
  | { event: 'assist-request'; data: AssistRequestEvent }
  /** server → ui: a suggest request settled (translate results return on the HTTP response) */
  | { event: 'assist-result'; data: { id: string; kind: 'suggest'; ok: boolean } }

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
