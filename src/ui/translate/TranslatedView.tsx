import { useEffect, useMemo, useState } from 'react'
import { segmentBlocks, type SourceBlock } from '../../shared/blocks'
import { analyzeMarkdown } from '../../shared/markdown/analyze'
import type { TextEdit } from '../../shared/types'
import { MarkdownView } from '../modes/reading/Renderer'
import { useTranslation } from './translationStore'

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
        <MarkdownView tree={analysis.tree} ctx={{ source: shown }} />
      </div>
      <div className="trans-block-side">
        {block.translatable && translated === undefined && (
          <span className="trans-miss" title={failed ? 'Translation failed — showing the original' : 'Not translated'}>
            {failed ? '⚠' : '·'}
          </span>
        )}
        <button
          type="button"
          className="trans-comment-btn"
          title="Comment on this block (anchors to the source block)"
          onClick={() => setComposing((v) => !v)}
        >
          💬
        </button>
      </div>
      {composing && (
        <div className="trans-composer">
          <textarea
            autoFocus
            rows={2}
            value={comment}
            placeholder="Comment on this block…"
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
              Cancel
            </button>
            <button type="button" className="primary" disabled={!comment.trim()} onClick={submit}>
              Comment
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

  return (
    <article className="trans-view">
      {loading && <div className="trans-loading">Translating…</div>}
      {blocks.map((b) => (
        <TransBlock
          key={`${b.hash}-${b.start}`}
          block={b}
          translated={b.translatable ? map[b.hash] : undefined}
          failed={Boolean(failed[b.hash])}
          authorTag={authorTag}
          onEdit={onEdit}
        />
      ))}
    </article>
  )
}
