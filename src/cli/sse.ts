export interface SseRecord {
  event: string
  data: string
}

/** Minimal SSE client over fetch (Node has no EventSource). Shared by wait + assist. */
export async function* sseRecords(url: string, signal?: AbortSignal): AsyncGenerator<SseRecord> {
  const res = await fetch(url, { headers: { accept: 'text/event-stream' }, signal })
  if (!res.ok || !res.body) throw new Error(`sse connect failed: ${res.status}`)
  const decoder = new TextDecoder()
  let buf = ''
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk as Uint8Array, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const record = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      if (record.startsWith(':')) continue // comment/ping
      let event = 'message'
      let data = ''
      for (const line of record.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      yield { event, data }
    }
  }
}
