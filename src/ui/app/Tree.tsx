import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReviewCounts, WorkspaceSessionInfo } from '../../shared/types'
import { ChevronIcon, FileIcon, FolderIcon } from '../icons'
import { useT } from '../i18n'
import { useDoc } from './store'
import { useWorkspace } from './workspaceStore'

interface Props {
  /** session id of the file currently open in this workspace (for active highlight) */
  openSessionId: string | null
}

/** A shared IntersectionObserver registrar passed down to file rows. */
type Observe = (el: Element | null, rel: string) => void

export function Tree({ openSessionId }: Props) {
  const t = useT()
  const displayName = useWorkspace((s) => s.displayName)
  const collapsed = useWorkspace((s) => s.collapsed)
  const setCollapsed = useWorkspace((s) => s.setCollapsed)
  const recent = useWorkspace((s) => s.recent)
  const sessions = useWorkspace((s) => s.sessions)
  // one subscription for the open file's dirty state (only the active row uses it)
  const dirtyOpen = useDoc((s) => s.source !== s.savedSource)

  const openRel = useMemo(
    () => sessions.find((s) => s.sessionId === openSessionId)?.rel ?? null,
    [sessions, openSessionId],
  )

  // One observer for the whole tree; rows register their element + rel. Built
  // eagerly (not in an effect) because child row effects fire BEFORE the
  // parent's — an effect-built observer would still be null when rows mount.
  const elRel = useRef(new Map<Element, string>())
  const [observer] = useState(() =>
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (e.isIntersecting) {
                const rel = elRel.current.get(e.target)
                if (rel) useWorkspace.getState().ensureBadge(rel)
              }
            }
          },
          { rootMargin: '120px' },
        ),
  )
  useEffect(() => () => observer?.disconnect(), [observer])

  const observe = useCallback<Observe>(
    (el, rel) => {
      if (!el || !observer) return
      elRel.current.set(el, rel)
      observer.observe(el)
    },
    [observer],
  )
  const unobserve = useCallback(
    (el: Element | null) => {
      if (!el || !observer) return
      observer.unobserve(el)
      elRel.current.delete(el)
    },
    [observer],
  )

  if (collapsed) {
    return (
      <button type="button" className="ws-reveal" title={t('showFiles')} onClick={() => setCollapsed(false)}>
        <FolderIcon />
      </button>
    )
  }

  return (
    <aside className="ws-sidebar" aria-label={t('files')}>
      <div className="ws-head">
        <span className="ws-title" title={displayName}>
          {displayName}
        </span>
        <button type="button" className="btn-ghost ws-collapse" title={t('hideFiles')} onClick={() => setCollapsed(true)}>
          ‹
        </button>
      </div>

      {recent.length > 0 && (
        <div className="ws-recent">
          <div className="ws-section-label">{t('recent')}</div>
          {recent.map((rel) => (
            <FileRow
              key={`r-${rel}`}
              rel={rel}
              name={rel.split('/').pop()!}
              depth={0}
              openRel={openRel}
              dirtyOpen={dirtyOpen}
              sessions={sessions}
              observe={observe}
              unobserve={unobserve}
              flat
            />
          ))}
        </div>
      )}

      <div className="ws-tree" role="tree">
        <Level
          dir=""
          depth={0}
          openRel={openRel}
          dirtyOpen={dirtyOpen}
          sessions={sessions}
          observe={observe}
          unobserve={unobserve}
        />
      </div>
    </aside>
  )
}

interface LevelProps {
  dir: string
  depth: number
  openRel: string | null
  dirtyOpen: boolean
  sessions: WorkspaceSessionInfo[]
  observe: Observe
  unobserve: (el: Element | null) => void
}

function Level({ dir, depth, openRel, dirtyOpen, sessions, observe, unobserve }: LevelProps) {
  const entries = useWorkspace((s) => s.children[dir])
  const expanded = useWorkspace((s) => s.expanded)
  const toggleDir = useWorkspace((s) => s.toggleDir)

  if (!entries) {
    return (
      <div className="ws-empty" style={{ paddingLeft: depth * 14 + 12 }}>
        …
      </div>
    )
  }
  if (entries.length === 0 && depth === 0) return <div className="ws-empty">—</div>

  return (
    <>
      {entries.map((e) =>
        e.isDir ? (
          <div key={e.rel}>
            <button
              type="button"
              className="ws-row ws-dir"
              style={{ paddingLeft: depth * 14 + 8 }}
              aria-expanded={expanded.has(e.rel)}
              onClick={() => toggleDir(e.rel)}
            >
              <ChevronIcon className={`ws-chevron${expanded.has(e.rel) ? ' open' : ''}`} />
              <FolderIcon className="ws-icon" />
              <span className="ws-name">{e.name}</span>
            </button>
            {expanded.has(e.rel) && (
              <Level
                dir={e.rel}
                depth={depth + 1}
                openRel={openRel}
                dirtyOpen={dirtyOpen}
                sessions={sessions}
                observe={observe}
                unobserve={unobserve}
              />
            )}
          </div>
        ) : (
          <FileRow
            key={e.rel}
            rel={e.rel}
            name={e.name}
            depth={depth}
            isMarkdown={e.isMarkdown}
            openRel={openRel}
            dirtyOpen={dirtyOpen}
            sessions={sessions}
            observe={observe}
            unobserve={unobserve}
          />
        ),
      )}
    </>
  )
}

interface FileRowProps {
  rel: string
  name: string
  depth: number
  isMarkdown?: boolean
  openRel: string | null
  dirtyOpen: boolean
  sessions: WorkspaceSessionInfo[]
  observe: Observe
  unobserve: (el: Element | null) => void
  /** recent-list rows render without tree indentation */
  flat?: boolean
}

function FileRow({
  rel,
  name,
  depth,
  isMarkdown = true,
  openRel,
  dirtyOpen,
  sessions,
  observe,
  unobserve,
  flat,
}: FileRowProps) {
  const counts = useWorkspace((s) => s.badges[rel])
  const openFile = useWorkspace((s) => s.openFile)
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const el = ref.current
    if (isMarkdown) observe(el, rel)
    return () => unobserve(el)
  }, [rel, isMarkdown, observe, unobserve])

  const sess = sessions.find((s) => s.rel === rel)
  const active = openRel === rel
  const total = counts ? counts.comments + counts.edits + counts.highlights : 0

  return (
    <button
      ref={ref}
      type="button"
      className={`ws-row ws-file${active ? ' active' : ''}${isMarkdown ? '' : ' non-md'}`}
      style={{ paddingLeft: (flat ? 0 : depth * 14) + 28 }}
      onClick={() => isMarkdown && void openFile(rel)}
      disabled={!isMarkdown}
      title={rel}
    >
      <FileIcon className="ws-icon" />
      <span className="ws-name">{name}</span>
      <span className="ws-marks">
        {sess?.agentWaiting && <span className="ws-dot ws-dot-agent" title="agent waiting" />}
        {sess && !sess.agentWaiting && <span className="ws-dot ws-dot-open" title="open" />}
        {active && dirtyOpen && <span className="ws-dot ws-dot-dirty" title="unsaved changes" />}
        {total > 0 && (
          <span className="ws-count" title={countsTitle(counts!)}>
            {total}
          </span>
        )}
      </span>
    </button>
  )
}

function countsTitle(c: ReviewCounts): string {
  return [c.comments && `${c.comments}c`, c.edits && `${c.edits}e`, c.highlights && `${c.highlights}h`]
    .filter(Boolean)
    .join(' ')
}
