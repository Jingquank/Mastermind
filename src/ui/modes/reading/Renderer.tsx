import type {
  AlignType,
  BlockContent,
  DefinitionContent,
  List,
  ListItem,
  PhrasingContent,
  Root,
  RootContent,
} from 'mdast'
import { Fragment, type ReactNode, createElement } from 'react'
import type { CriticCommentNode, CriticSubNode, CriticWrapNode } from '../../../shared/markdown/critic-mdast'
import { toggleTaskEdit } from '../../../shared/markdown/tasklist'
import type { TextEdit } from '../../../shared/types'

export interface RenderCtx {
  source: string
  /** Absent → interactive affordances (task checkboxes) are disabled. */
  onEdit?: (edit: TextEdit) => void
  /** spanIndexes of highlights that anchor a comment thread (dotted underline). */
  anchoredHighlights?: ReadonlySet<number>
}

function renderCritic(node: { type: string }, key: number, ctx: RenderCtx): ReactNode | undefined {
  switch (node.type) {
    case 'criticInsert': {
      const n = node as CriticWrapNode
      return (
        <ins key={key} className="critic critic-ins" data-span-index={n.data.spanIndex}>
          {renderInline(n.children, ctx)}
        </ins>
      )
    }
    case 'criticDelete': {
      const n = node as CriticWrapNode
      return (
        <del key={key} className="critic critic-del" data-span-index={n.data.spanIndex}>
          {renderInline(n.children, ctx)}
        </del>
      )
    }
    case 'criticHighlight': {
      const n = node as CriticWrapNode
      const anchored = ctx.anchoredHighlights?.has(n.data.spanIndex)
      return (
        <mark
          key={key}
          className={`critic critic-hl${anchored ? ' critic-anchor' : ''}`}
          data-span-index={n.data.spanIndex}
        >
          {renderInline(n.children, ctx)}
        </mark>
      )
    }
    case 'criticSub': {
      const n = node as CriticSubNode
      return (
        <span key={key} className="critic critic-sub" data-span-index={n.data.spanIndex}>
          <del>{n.data.old}</del>
          <span className="critic-sub-arrow" aria-hidden>
            →
          </span>
          <ins>{n.data.new}</ins>
        </span>
      )
    }
    case 'criticComment': {
      const n = node as CriticCommentNode
      return (
        <span
          key={key}
          className="critic critic-comment-marker"
          data-span-index={n.data.spanIndex}
          title={n.data.content}
        >
          ◆
        </span>
      )
    }
    default:
      return undefined
  }
}

type Positioned = { position?: { start?: { offset?: number }; end?: { offset?: number } } }

function posAttrs(node: Positioned): Record<string, number> {
  const start = node.position?.start?.offset
  const end = node.position?.end?.offset
  return start !== undefined && end !== undefined ? { 'data-ps': start, 'data-pe': end } : {}
}

function renderInline(nodes: readonly PhrasingContent[], ctx: RenderCtx): ReactNode[] {
  return nodes.map((node, i) => renderPhrasing(node, i, ctx))
}

function renderPhrasing(node: PhrasingContent, key: number, ctx: RenderCtx): ReactNode {
  const critic = renderCritic(node, key, ctx)
  if (critic !== undefined) return critic
  switch (node.type) {
    case 'text':
      return (
        <span key={key} {...posAttrs(node)}>
          {node.value}
        </span>
      )
    case 'emphasis':
      return (
        <em key={key} {...posAttrs(node)}>
          {renderInline(node.children, ctx)}
        </em>
      )
    case 'strong':
      return (
        <strong key={key} {...posAttrs(node)}>
          {renderInline(node.children, ctx)}
        </strong>
      )
    case 'delete':
      return (
        <del key={key} {...posAttrs(node)}>
          {renderInline(node.children, ctx)}
        </del>
      )
    case 'inlineCode':
      return (
        <code key={key} className="md-inline-code" {...posAttrs(node)}>
          {node.value}
        </code>
      )
    case 'link':
      return (
        <a key={key} href={node.url} title={node.title ?? undefined} target="_blank" rel="noreferrer" {...posAttrs(node)}>
          {renderInline(node.children, ctx)}
        </a>
      )
    case 'image':
      return <img key={key} src={node.url} alt={node.alt ?? ''} title={node.title ?? undefined} {...posAttrs(node)} />
    case 'break':
      return <br key={key} />
    case 'footnoteReference':
      return (
        <sup key={key} className="md-footnote-ref">
          [{node.identifier}]
        </sup>
      )
    case 'linkReference':
      return <Fragment key={key}>{renderInline(node.children, ctx)}</Fragment>
    case 'imageReference':
      return (
        <span key={key} className="md-muted">
          [image: {node.alt ?? node.identifier}]
        </span>
      )
    case 'html':
      return node.value.startsWith('<!--') ? null : (
        <code key={key} className="md-inline-code">
          {node.value}
        </code>
      )
    default:
      return null
  }
}

function renderListItem(item: ListItem, key: number, ctx: RenderCtx, tight: boolean): ReactNode {
  const isTask = typeof item.checked === 'boolean'
  const checkbox = isTask ? (
    <input
      type="checkbox"
      className="task-checkbox"
      checked={item.checked ?? false}
      disabled={!ctx.onEdit}
      onChange={() => {
        const start = item.position?.start?.offset
        if (start === undefined || !ctx.onEdit) return
        const edit = toggleTaskEdit(ctx.source, start)
        if (edit) ctx.onEdit(edit)
      }}
    />
  ) : null

  const children = item.children.map((child, i) => {
    if (child.type === 'paragraph' && (tight || (isTask && i === 0))) {
      return <Fragment key={i}>{renderInline(child.children, ctx)}</Fragment>
    }
    return renderBlock(child, i, ctx)
  })

  return (
    <li key={key} className={isTask ? 'task-item' : undefined} {...posAttrs(item)}>
      {checkbox}
      {children}
    </li>
  )
}

function renderList(node: List, key: number, ctx: RenderCtx): ReactNode {
  const tight = node.spread !== true
  const items = node.children.map((item, i) => renderListItem(item, i, ctx, tight))
  return node.ordered ? (
    <ol key={key} start={node.start ?? undefined} {...posAttrs(node)}>
      {items}
    </ol>
  ) : (
    <ul key={key} {...posAttrs(node)}>
      {items}
    </ul>
  )
}

const ALIGN_STYLE: Record<NonNullable<AlignType>, 'left' | 'center' | 'right'> = {
  left: 'left',
  center: 'center',
  right: 'right',
}

function renderBlock(node: BlockContent | DefinitionContent | RootContent, key: number, ctx: RenderCtx): ReactNode {
  switch (node.type) {
    case 'paragraph':
      return (
        <p key={key} {...posAttrs(node)}>
          {renderInline(node.children, ctx)}
        </p>
      )
    case 'heading':
      return createElement(
        `h${node.depth}`,
        { key, ...posAttrs(node) },
        renderInline(node.children, ctx),
      )
    case 'blockquote':
      return (
        <blockquote key={key} {...posAttrs(node)}>
          {node.children.map((child, i) => renderBlock(child, i, ctx))}
        </blockquote>
      )
    case 'list':
      return renderList(node, key, ctx)
    case 'code':
      return (
        <pre key={key} className="md-code" data-lang={node.lang ?? undefined} {...posAttrs(node)}>
          <code>{node.value}</code>
        </pre>
      )
    case 'table': {
      const [head, ...rows] = node.children
      const align = node.align ?? []
      const cellStyle = (i: number) => {
        const a = align[i]
        return a ? { textAlign: ALIGN_STYLE[a] } : undefined
      }
      return (
        <table key={key} {...posAttrs(node)}>
          {head && (
            <thead>
              <tr>
                {head.children.map((cell, i) => (
                  <th key={i} style={cellStyle(i)} {...posAttrs(cell)}>
                    {renderInline(cell.children, ctx)}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.children.map((cell, ci) => (
                  <td key={ci} style={cellStyle(ci)} {...posAttrs(cell)}>
                    {renderInline(cell.children, ctx)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    }
    case 'thematicBreak':
      return <hr key={key} />
    case 'html':
      // Comments stay invisible (the mastermind:summary fence renders as its
      // inner blockquote alone); other raw HTML shows as source — v0.1 doesn't
      // execute embedded HTML.
      return node.value.trimStart().startsWith('<!--') ? null : (
        <pre key={key} className="md-code md-html" {...posAttrs(node)}>
          <code>{node.value}</code>
        </pre>
      )
    case 'footnoteDefinition':
      return (
        <div key={key} className="md-footnote-def" {...posAttrs(node)}>
          <sup>[{node.identifier}]</sup>{' '}
          {node.children.map((child, i) => renderBlock(child, i, ctx))}
        </div>
      )
    case 'definition':
      return null
    default:
      if ('children' in node && Array.isArray(node.children)) {
        return <Fragment key={key}>{renderInline(node.children as PhrasingContent[], ctx)}</Fragment>
      }
      return null
  }
}

export function MarkdownView({ tree, ctx }: { tree: Root; ctx: RenderCtx }) {
  return <>{tree.children.map((node, i) => renderBlock(node, i, ctx))}</>
}
