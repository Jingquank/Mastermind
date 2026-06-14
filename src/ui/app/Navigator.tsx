import { useEffect, useState } from 'react'
import { ToggleGroup } from 'radix-ui'
import { ChevronLeftIcon, FolderIcon, OutlineIcon } from '../icons'
import { Tip } from './Tip'
import { useT } from '../i18n'
import { scrollToOffset } from '../util/scroll'
import { FilesList } from './Tree'
import { useNav } from './navStore'
import { useDoc } from './store'
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
            {showFiles ? <FolderIcon /> : <OutlineIcon />}
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

  // Scroll-spy driven by scroll POSITION (not IntersectionObserver) so it's
  // deterministic and monotonic — the indicator only ever steps one section at
  // a time, never flickers. The active heading is the last one whose top has
  // scrolled above a reading line near the top of the viewport.
  //
  // The catch: the final sections live in the last viewport-height of the page,
  // which can never scroll up to that line (the page bottoms out first), so
  // they'd never become active. We fix that by spreading the unreachable tail's
  // activation points across the remaining scroll — each tail heading still gets
  // its moment, and the last one activates exactly when the page hits the bottom.
  useEffect(() => {
    if (!docEl) return
    const heads = items
      .map((it) => ({ offset: it.offset, el: docEl.querySelector(`[data-ps="${it.offset}"]`) as HTMLElement | null }))
      .filter((h): h is { offset: number; el: HTMLElement } => h.el !== null)
    if (heads.length === 0) return

    let raf = 0
    const update = (): void => {
      raf = 0
      const y = window.scrollY
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      // Reading line near the top: a heading is "current" once it scrolls to
      // here. Kept small so the FIRST heading stays current at the top (a larger
      // line would already sit below it) — the unreachable TAIL is handled by the
      // redistribution below, not by pushing this line down.
      const line = 96
      // scrollY at which each heading would reach the reading line. `y + top` is
      // the heading's absolute document offset, so these are stable across frames.
      const at = heads.map((h) => y + h.el.getBoundingClientRect().top - line)
      // Redistribute the tail that can't reach the line (its activation point is
      // past the page's max scroll) into the final stretch of scroll.
      const firstUnreachable = at.findIndex((v) => v > maxScroll)
      if (maxScroll > 0 && firstUnreachable > 0) {
        const base = at[firstUnreachable - 1]!
        const span = maxScroll - base
        const tail = heads.length - firstUnreachable
        for (let i = firstUnreachable; i < heads.length; i++) {
          at[i] = base + (span * (i - firstUnreachable + 1)) / tail
        }
      }
      let active = 0
      for (let i = 0; i < heads.length; i++) {
        if (y >= at[i]! - 1) active = i
        else break
      }
      setActiveOffset(heads[active]!.offset)
    }
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [items, docEl])

  if (items.length < 2) return null
  const minDepth = Math.min(...items.map((i) => i.depth))

  // Reading mode renders the article (docEl) with data-ps offsets, so scroll by
  // offset. The editor modes have no such element — they register a scroller on
  // the doc store that knows how to reach the heading (by source offset for
  // Source, by heading index for the WYSIWYG Editing view). We deliberately
  // don't set the active item on click — the indicator only reflects scroll
  // position (the scroll-spy below), so it tracks the page as it scrolls to the
  // target instead of jumping ahead and fighting the scroll animation.
  const go = (offset: number, index: number): void => {
    if (docEl) scrollToOffset({ current: docEl }, offset)
    else useDoc.getState().scroller?.(offset, index)
  }

  return (
    <ul className="nav-outline">
      {items.map((it, i) => (
        <li
          key={it.offset}
          style={{ paddingLeft: `${(it.depth - minDepth) * 12}px` }}
          className={activeOffset === it.offset ? 'active' : undefined}
        >
          <button type="button" onClick={() => go(it.offset, i)} title={it.text}>
            {it.text}
          </button>
        </li>
      ))}
    </ul>
  )
}
