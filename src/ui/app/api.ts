import type { FileResponse, SessionMeta } from '../../shared/types'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = (await res.json()) as { error?: string }
      if (j.error) detail = j.error
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, detail)
  }
  return (await res.json()) as T
}

export function getSession(sessionId: string): Promise<SessionMeta> {
  return request<SessionMeta>(`/api/sessions/${sessionId}`)
}

export function getFile(sessionId: string): Promise<FileResponse> {
  return request<FileResponse>(`/api/sessions/${sessionId}/file`)
}

export function openEvents(sessionId: string): EventSource {
  return new EventSource(`/api/sessions/${sessionId}/events?role=ui`)
}
