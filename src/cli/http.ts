import type { HealthResponse } from '../shared/types'

export type HealthProbe = HealthResponse | 'free' | 'foreign'

function isConnRefused(err: unknown): boolean {
  const cause = (err as { cause?: unknown }).cause
  if (!cause) return false
  const code = (cause as NodeJS.ErrnoException).code
  if (code === 'ECONNREFUSED') return true
  const errors = (cause as { errors?: NodeJS.ErrnoException[] }).errors
  return Array.isArray(errors) && errors.some((e) => e.code === 'ECONNREFUSED')
}

/**
 * Probe a port: a healthy mastermind daemon, nothing at all ('free'), or
 * something else / hung ('foreign').
 */
export async function probeHealth(port: number): Promise<HealthProbe> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return 'foreign'
    const j = (await res.json()) as Partial<HealthResponse>
    if (j.ok === true && typeof j.pid === 'number' && typeof j.version === 'string') {
      return j as HealthResponse
    }
    return 'foreign'
  } catch (err) {
    return isConnRefused(err) ? 'free' : 'foreign'
  }
}

export async function postJson<T>(port: number, pathName: string, body: unknown): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${port}${pathName}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) {
    let detail = `${res.status}`
    try {
      const j = (await res.json()) as { error?: string }
      if (j.error) detail = j.error
    } catch {
      /* not json */
    }
    throw new Error(detail)
  }
  return (await res.json()) as T
}

/** POST that tolerates a 204/empty body (used by assist-result / assist-error). */
export async function postNoContent(port: number, pathName: string, body: unknown): Promise<void> {
  const res = await fetch(`http://127.0.0.1:${port}${pathName}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) {
    let detail = `${res.status}`
    try {
      const j = (await res.json()) as { error?: string }
      if (j.error) detail = j.error
    } catch {
      /* not json */
    }
    throw new Error(detail)
  }
}

export async function requestShutdown(port: number): Promise<void> {
  try {
    await fetch(`http://127.0.0.1:${port}/api/admin/shutdown`, {
      method: 'POST',
      signal: AbortSignal.timeout(1500),
    })
  } catch {
    /* it may die mid-response; that's fine */
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
