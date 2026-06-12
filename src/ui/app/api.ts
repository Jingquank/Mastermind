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

export function putFile(sessionId: string, content: string, baseMtimeMs: number): Promise<{ mtimeMs: number }> {
  return request<{ mtimeMs: number }>(`/api/sessions/${sessionId}/file`, jsonInit('PUT', { content, baseMtimeMs }))
}

export function openEvents(sessionId: string): EventSource {
  return new EventSource(`/api/sessions/${sessionId}/events?role=ui`)
}
