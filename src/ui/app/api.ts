import type { FileResponse, SessionMeta } from '../../shared/types'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    let detail = res.statusText
    let data: unknown
    try {
      const j = (await res.json()) as { error?: string }
      data = j
      if (j.error) detail = j.error
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, detail, data)
  }
  return (await res.json()) as T
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

export function getSession(sessionId: string): Promise<SessionMeta> {
  return request<SessionMeta>(`/api/sessions/${sessionId}`)
}

export function getFile(sessionId: string): Promise<FileResponse> {
  return request<FileResponse>(`/api/sessions/${sessionId}/file`)
}

export function putFile(sessionId: string, content: string, baseMtimeMs?: number): Promise<{ mtimeMs: number }> {
  return request<{ mtimeMs: number }>(`/api/sessions/${sessionId}/file`, jsonInit('PUT', { content, baseMtimeMs }))
}

export interface HandbackResponse {
  mtimeMs: number
  counts: { comments: number; edits: number; highlights: number }
  summaryLine: string
}

export function postHandback(sessionId: string, content: string, baseMtimeMs: number): Promise<HandbackResponse> {
  return request<HandbackResponse>(`/api/sessions/${sessionId}/handback`, jsonInit('POST', { content, baseMtimeMs }))
}

export function postRename(sessionId: string, filename: string): Promise<{ path: string; displayName: string }> {
  return request<{ path: string; displayName: string }>(
    `/api/sessions/${sessionId}/rename`,
    jsonInit('POST', { filename }),
  )
}

export function openEvents(sessionId: string): EventSource {
  return new EventSource(`/api/sessions/${sessionId}/events?role=ui`)
}
