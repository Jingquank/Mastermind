import { useEffect, useRef, useState } from 'react'
import { ChevronLeftIcon, FolderIcon } from '../icons'
import { useT } from '../i18n'
import { scrollToOffset } from '../util/scroll'
import { FilesList } from './Tree'
import { useNav } from './navStore'
import { useWorkspace } from './workspaceStore'

/** Reactive `(max-width: 900px)` flag — drives the off-canvas vs in-flow nav. */
export function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 900px)').matches,
  )
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const mq = matchMedia('(max-width: 900px)')
    const on = (): void => setNarrow(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}

interface Props {
  /** the active workspace (file tree shows only when set) */
  workspaceId: string | null
  /** the open file's session id (active-row highlight) */
  openSessionId: string | null
}

/**
 * The single left navigator: one panel that holds the workspace file tree AND
 * the current document's heading outline, switched by a segmented toggle when
 * both exist. In-flow on wide screens; off-canvas over a scrim on narrow ones.
 */
export function Navigator({ workspaceId, openSessionId }: Props) {
  const t = useT()
  const outline = useNav((s) => s.outline)
  const collapsed = useNav((s) => s.collapsed)
  const mobileOpen = useNav((s) => s.mobileOpen)
  const sectionPref = useNav((s) => s.section)
  const displayName = useWorkspace((s) => s.displayName)
  const narrow = useIsNarrow()

  const showFiles = !!workspaceId
  const showOutline = outline.length >= 2
  // when only one section exists, force it; otherwise honor the toggle
  const section = !showFiles ? 'outline' : !showOutline ? 'files' : sectionPref

  const panelOpen = narrow ? mobileOpen : !collapsed

  const reveal = (): void => {
    if (narrow) useNav.getState().setMobileOpen(true)
    else useNav.getState().setCollapsed(false)
  }
  const hide = (): void => {
    if (narrow) useNav.getState().setMobileOpen(false)
    else useNav.getState().setCollapsed(true)
  }

  return (
    <>
      {!panelOpen && (
        <button type="button" className="nav-reveal" title={t('showFiles')} aria-label={t('showFiles')} onClick={reveal}>
          {showFiles ? <FolderIcon /> : <ChevronLeftIcon style={{ transform: 'rotate(180deg)' }} />}
        </button>
      )}
      {narrow && mobileOpen && <div className="nav-scrim" onClick={hide} aria-hidden />}
      <aside className={`navigator${panelOpen ? '' : ' off'}`} aria-label={showFiles ? t('files') : t('outline')}>
        <div className="nav-head">
          <span className="nav-title" title={showFiles ? displayName : undefined}>
            {showFiles ? displayName : t('outline')}
          </span>
          <button type="button" className="btn-ghost nav-collapse" title={t('hideFiles')} aria-label={t('hideFiles')} onClick={hide}>
            <ChevronLeftIcon />
          </button>
        </div>

        {showFiles && showOutline && (
          <nav className="seg nav-seg" aria-label={t('files')}>
            <button
              type="button"
              className={`seg-btn${section === 'files' ? ' active' : ''}`}
              aria-pressed={section === 'files'}
              onClick={() => useNav.getState().setSection('files')}
            >
              {t('files')}
            </button>
            <button
              type="button"
              className={`seg-btn${section === 'outline' ? ' active' : ''}`}
              aria-pressed={section === 'outline'}
              onClick={() => useNav.getState().setSection('outline')}
            >
              {t('outline')}
            </button>
          </nav>
        )}

        <div className="nav-body">{section === 'files' ? <FilesList openSessionId={openSessionId} /> : <OutlineList />}</div>
      </aside>
    </>
  )
}

/** The current document's heading outline with scroll-spy (reads navStore). */
function OutlineList() {
  const items = useNav((s) => s.outline)
  const docEl = useNav((s) => s.docEl)
  const [activeOffset, setActiveOffset] = useState<number | null>(null)
  const visible = useRef(new Set<number>())

  useEffect(() => {
    if (!docEl) return
    const els = items
      .map((it) => docEl.querySelector(`[data-ps="${it.offset}"]`))
      .filter((el): el is Element => el !== null)
    if (els.length === 0) return
    visible.current.clear()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const off = Number((e.target as HTMLElement).dataset.ps)
          if (e.isIntersecting) visible.current.add(off)
          else visible.current.delete(off)
        }
        const on = [...visible.current].sort((a, b) => a - b)
        setActiveOffset(on.length ? on[0]! : null)
      },
      { rootMargin: '0px 0px -65% 0px', threshold: 0 },
    )
    for (const el of els) io.observe(el)
    return () => io.disconnect()
  }, [items, docEl])

  if (items.length < 2) return null
  const minDepth = Math.min(...items.map((i) => i.depth))

  return (
    <ul className="nav-outline">
      {items.map((it) => (
        <li
          key={it.offset}
          style={{ paddingLeft: `${(it.depth - minDepth) * 12}px` }}
          className={activeOffset === it.offset ? 'active' : undefined}
        >
          <button type="button" onClick={() => scrollToOffset({ current: docEl }, it.offset)} title={it.text}>
            {it.text}
          </button>
        </li>
      ))}
    </ul>
  )
}
