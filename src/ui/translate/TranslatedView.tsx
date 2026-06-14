import { useEffect, useMemo, useState } from 'react'
import { segmentBlocks, type SourceBlock } from '../../shared/blocks'
import { analyzeMarkdown } from '../../shared/markdown/analyze'
import type { TextEdit } from '../../shared/types'
import { useT } from '../i18n'
import { AlertIcon, ChatIcon, PendingDot } from '../icons'
import { CALLOUT_HEADING, MarkdownView, calloutKind, type CalloutKind } from '../modes/reading/Renderer'
import { useConfig } from '../app/configStore'
import { useTranslation } from './translationStore'

/** Heading depth + callout-ness from a block's SOURCE text (never the translation). */
function sourceHeading(block: SourceBlock): { depth: number; callout: boolean; kind: CalloutKind | null } | null {
  if (block.kind !== 'heading') return null
  const m = block.text.match(/^(#{1,6})\s+([^\n]*)/)
  if (!m) return null
  const title = m[2]!.trim()
  return { depth: m[1]!.length, callout: CALLOUT_HEADING.test(title), kind: calloutKind(title) }
}

type BlockGroup =
  | { callout: false; block: SourceBlock }
  | { callout: true; key: string; kind: CalloutKind | null; blocks: SourceBlock[] }

/**
 * Mirror MarkdownView's callout grouping, but key it on the ORIGINAL source text so
 * the card survives translation: a callout heading plus every following block until
 * the next heading of equal-or-shallower depth becomes one md-callout section.
 */
function groupBlocks(blocks: SourceBlock[]): BlockGroup[] {
  const groups: BlockGroup[] = []
  let i = 0
  while (i < blocks.length) {
    const head = sourceHeading(blocks[i]!)
    if (head?.callout) {
      let j = i + 1
      while (j < blocks.length) {
        const next = sourceHeading(blocks[j]!)
        if (next && next.depth <= head.depth) break
        j++
      }
      groups.push({ callout: true, key: `${blocks[i]!.hash}-${blocks[i]!.start}`, kind: head.kind, blocks: blocks.slice(i, j) })
      i = j
    } else {
      groups.push({ callout: false, block: blocks[i]! })
      i++
    }
  }
  return groups
}

interface Props {
  sessionId: string
  source: string
  authorTag: string
  onEdit: (edits: TextEdit[]) => void
}

function sanitize(text: string): string {
  return text.trim().replace(/\n[ \t]*\n+/g, '\n').replaceAll('<<}', '<< }')
}

function TransBlock({
  block,
  translated,
  failed,
  authorTag,
  onEdit,
}: {
  block: SourceBlock
  translated: string | undefined
  failed: boolean
  authorTag: string
  onEdit: (edits: TextEdit[]) => void
}) {
  const t = useT()
  const highlightCode = (useConfig((s) => s.config?.codeTheme) ?? 'none') !== 'none'
  const [composing, setComposing] = useState(false)
  const [comment, setComment] = useState('')
  const shown = translated ?? block.text
  const analysis = useMemo(() => analyzeMarkdown(shown), [shown])

  const submit = (): void => {
    if (!comment.trim()) return
    // block-granularity anchor: append the comment at the END of the SOURCE block
    onEdit([{ from: block.end, to: block.end, insert: `{>>@${authorTag}: ${sanitize(comment)}<<}` }])
    setComposing(false)
    setComment('')
  }

  return (
    <div className={`trans-block${failed ? ' failed' : ''}`}>
      <div className="trans-block-body md-root">
        <MarkdownView tree={analysis.tree} ctx={{ source: shown, highlightCode }} />
      </div>
      <div className="trans-block-side">
        {block.translatable && translated === undefined && (
          <span className="trans-miss" title={failed ? t('translationFailedBlock') : t('untranslated')}>
            {failed ? <AlertIcon /> : <PendingDot />}
          </span>
        )}
        <button
          type="button"
          className="trans-comment-btn"
          title={t('commentBlockTitle')}
          aria-label={t('commentBlockTitle')}
          onClick={() => setComposing((v) => !v)}
        >
          <ChatIcon />
        </button>
      </div>
      {composing && (
        <div className="trans-composer">
          <textarea
            autoFocus
            rows={2}
            value={comment}
            placeholder={t('commentBlockPlaceholder')}
            title={t('commentHint')}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
              if (e.key === 'Escape') {
                setComposing(false)
                e.stopPropagation()
              }
            }}
          />
          <div className="rail-actions">
            <button type="button" onClick={() => setComposing(false)}>
              {t('cancel')}
            </button>
            <button type="button" className="primary" disabled={!comment.trim()} onClick={submit}>
              {t('comment')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The reading-language toggle's view: body text is read-only and rendered
 * block-by-block from the translation cache; untranslated/failed blocks fall
 * back to the source with an indicator. Comments anchor at block granularity.
 */
export function TranslatedView({ sessionId, source, authorTag, onEdit }: Props) {
  const t = useT()
  const [blocks, setBlocks] = useState<SourceBlock[] | null>(null)
  const map = useTranslation((s) => s.map)
  const failed = useTranslation((s) => s.failed)
  const loading = useTranslation((s) => s.loading)
  const ensure = useTranslation((s) => s.ensure)

  useEffect(() => {
    let cancelled = false
    void segmentBlocks(source).then((b) => {
      if (!cancelled) setBlocks(b)
    })
    return () => {
      cancelled = true
    }
  }, [source])

  useEffect(() => {
    void ensure(sessionId, source)
  }, [sessionId, source, ensure])

  if (!blocks) return null

  const renderBlock = (b: SourceBlock) => (
    <TransBlock
      key={`${b.hash}-${b.start}`}
      block={b}
      translated={b.translatable ? map[b.hash] : undefined}
      failed={Boolean(failed[b.hash])}
      authorTag={authorTag}
      onEdit={onEdit}
    />
  )

  return (
    <article className="trans-view">
      {loading && <div className="trans-loading">{t('translating')}</div>}
      {groupBlocks(blocks).map((g) =>
        g.callout ? (
          <section key={g.key} className={g.kind ? `md-callout md-callout--${g.kind}` : 'md-callout'}>
            {g.blocks.map(renderBlock)}
          </section>
        ) : (
          renderBlock(g.block)
        ),
      )}
    </article>
  )
}
