import type { ProviderConfig } from '../../shared/types'

export const PROMPT_VERSION = 1

function systemPrompt(sourceLang: string, targetLang: string): string {
  return [
    `You translate Markdown blocks from ${sourceLang} to ${targetLang}.`,
    'Rules:',
    '- Output ONLY the translated block. No preamble, no code fences, no commentary.',
    '- Preserve ALL Markdown syntax: heading markers, list bullets, emphasis markers, links (translate link text, never URLs), inline code spans stay verbatim untranslated.',
    '- Preserve CriticMarkup syntax EXACTLY: {++text++}, {--text--}, {~~old~>new~~}, {==text==}, {>>comment<<}. Keep every marker pair present, in place, and in order; translate only the human text inside the markers.',
    '- In {>>comments<<}, keep @name: author tags untranslated.',
    '- Do not add or remove blank lines.',
  ].join('\n')
}

function trimEdges(s: string): string {
  return s.replace(/^\n+/, '').replace(/\s+$/, '')
}

async function anthropicTranslate(
  provider: ProviderConfig,
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': provider.apiKey ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: 4096,
      system: systemPrompt(sourceLang, targetLang),
      messages: [{ role: 'user', content: text }],
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
  const part = json.content?.find((c) => c.type === 'text')
  if (!part?.text) throw new Error('anthropic: empty response')
  return trimEdges(part.text)
}

async function openaiCompatTranslate(
  provider: ProviderConfig,
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const base = (provider.baseUrl ?? 'http://localhost:11434/v1').replace(/\/+$/, '')
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (provider.apiKey) headers.authorization = `Bearer ${provider.apiKey}`
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: 'system', content: systemPrompt(sourceLang, targetLang) },
        { role: 'user', content: text },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) throw new Error(`provider ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new Error('provider: empty response')
  return trimEdges(content)
}

export function translateBlock(
  provider: ProviderConfig,
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  return provider.type === 'anthropic'
    ? anthropicTranslate(provider, text, sourceLang, targetLang)
    : openaiCompatTranslate(provider, text, sourceLang, targetLang)
}
