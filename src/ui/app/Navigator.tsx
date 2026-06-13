import { useEffect, useRef, useState } from 'react'
import { ToggleGroup } from 'radix-ui'
import { ChevronLeftIcon, FolderIcon } from '../icons'
import { Tip } from './Tip'
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

  // Escape closes the off-canvas navigator (narrow only); focus returns to the
  // reveal button on the next render since it reappears when closed.
  useEffect(() => {
    if (!(narrow && mobileOpen)) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useNav.getState().setMobileOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [narrow, mobileOpen])

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
        <Tip label={t('showFiles')}>
          <button
            type="button"
            className="nav-reveal"
            aria-label={t('showFiles')}
            aria-expanded={false}
            onClick={reveal}
          >
            {showFiles ? <FolderIcon /> : <ChevronLeftIcon style={{ transform: 'rotate(180deg)' }} />}
          </button>
        </Tip>
      )}
      {narrow && mobileOpen && <div className="nav-scrim" onClick={hide} aria-hidden />}
      <aside
        className={`navigator${panelOpen ? '' : ' off'}`}
        aria-label={showFiles ? t('files') : t('outline')}
        role={narrow && mobileOpen ? 'dialog' : undefined}
        aria-modal={narrow && mobileOpen ? true : undefined}
      >
        <div className="nav-head">
          <span className="nav-title" title={showFiles ? displayName : undefined}>
            {showFiles ? displayName : t('outline')}
          </span>
          <Tip label={t('hideFiles')}>
            <button type="button" className="btn-ghost nav-collapse" aria-label={t('hideFiles')} onClick={hide}>
              <ChevronLeftIcon />
            </button>
          </Tip>
        </div>

        {showFiles && showOutline && (
          <ToggleGroup.Root
            className="seg nav-seg"
            type="single"
            value={section}
            onValueChange={(v) => v && useNav.getState().setSection(v as 'files' | 'outline')}
            aria-label={t('files')}
          >
            <ToggleGroup.Item value="files" className="seg-btn">
              {t('files')}
            </ToggleGroup.Item>
            <ToggleGroup.Item value="outline" className="seg-btn">
              {t('outline')}
            </ToggleGroup.Item>
          </ToggleGroup.Root>
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
