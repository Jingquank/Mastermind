import { detectDocScript } from '../shared/blocks'
import { applyTextEdits } from '../shared/edits'
import { parseAuthor, scan } from '../shared/critic/scanner'
import { codeRanges } from '../shared/markdown/exclusions'
import { stripSummary } from '../shared/summary'
import type { MastermindConfig, TextEdit } from '../shared/types'
import { log } from './log'
import { providerConfigured } from './translate/index'
import { translateBlock } from './translate/providers'

type Translate = typeof translateBlock

function hasCjk(text: string): boolean {
  return /[一-鿿]/.test(text)
}

function zhish(label: string): boolean {
  return /^(zh|中文)/i.test(label)
}

function sanitize(text: string): string {
  return text.replace(/\n[ \t]*\n+/g, '\n').replaceAll('<<}', '<< }').trim()
}

/**
 * Feedback language rule: comments return to the agent in the document's
 * language. A comment typed in the other script is translated on save via
 * the configured provider; `keepOriginalFeedback` appends the original
 * inside the mark. With no provider (or any failure), comments pass through
 * as typed — saving never blocks on translation.
 */
export async function processFeedbackLanguage(
  content: string,
  config: MastermindConfig,
  translate: Translate = translateBlock,
): Promise<string> {
  if (!providerConfigured(config)) return content

  const body = stripSummary(content)
  const docCjk = detectDocScript(body) === 'cjk'
  const docLang = docCjk
    ? zhish(config.langPair.a)
      ? config.langPair.a
      : config.langPair.b
    : zhish(config.langPair.a)
      ? config.langPair.b
      : config.langPair.a

  const spans = scan(content, codeRanges(content)).filter((s) => s.kind === 'comment')
  const edits: TextEdit[] = []

  for (const span of spans) {
    const inner = content.slice(span.innerStart, span.innerEnd)
    const { author, body: text } = parseAuthor(inner)
    if (!text.trim()) continue
    const commentCjk = hasCjk(text)
    if (commentCjk === docCjk) continue // already in the document's language

    try {
      const translated = sanitize(
        await translate(config.provider!, text, commentCjk ? 'Chinese' : 'English', docLang),
      )
      if (!translated) continue
      const keep = config.keepOriginalFeedback ? `${translated} (original: ${sanitize(text)})` : translated
      const replacement = author ? `@${author}: ${keep}` : keep
      edits.push({ from: span.innerStart, to: span.innerEnd, insert: replacement })
    } catch (err) {
      log('feedback translation failed (kept as typed):', err instanceof Error ? err.message : err)
    }
  }

  return edits.length > 0 ? applyTextEdits(content, edits) : content
}
