import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type SVGProps } from 'react'
import { ToggleGroup } from 'radix-ui'
import { useT } from '../i18n'
import { ChatIcon, CodeIcon, EyeIcon, LanguageIcon } from '../icons'
import { HandBackButton } from './HandBackButton'
import { SlotLabel } from '../util/SlotLabel'
import { useDoc, type ViewMode } from './store'

interface TopBarProps {
  railOpen?: boolean
  onToggleRail?: () => void
  /** Reading-language toggle, rendered beside the centered mode switch. */
  translation?: {
    label: string
    active: boolean
    loading: boolean
    onToggle: () => void
  }
}

export function TopBar({ railOpen, onToggleRail, translation }: TopBarProps) {
  const t = useT()
  const headerRef = useRef<HTMLElement | null>(null)
  const meta = useDoc((s) => s.meta)
  const mode = useDoc((s) => s.mode)
  const setMode = useDoc((s) => s.setMode)
  // mtimeMs changes only when the file is (re)loaded from disk — never on local
  // edits — so it's the clean signal to re-roll the filename on a refresh.
  const mtimeMs = useDoc((s) => s.mtimeMs)
  // Collapsed = the floating bar has shrunk into its compact island (scrolled
  // down, away from the top). Scrolling up / hover / focus-within re-expands it
  // (hover & focus are handled purely in CSS so they win without a re-render).
  const [collapsed, setCollapsed] = useState(false)

  const MODES: { id: ViewMode; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
    { id: 'reading', label: t('reading'), Icon: EyeIcon },
    { id: 'source', label: t('source'), Icon: CodeIcon },
  ]

  // Publish the floating bar's measured height so overlays/content can reserve
  // clearance above it (--bar-h drives --bar-clear in app.css).
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const apply = () => document.documentElement.style.setProperty('--bar-h', `${el.offsetHeight}px`)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Drive the collapse on scroll direction and feed the reading-progress
  // hairline. rAF-throttled passive listener, mirroring MarkGutter's pattern.
  useEffect(() => {
    const el = headerRef.current
    const EXPAND_AT = 24 // always expanded within this many px of the top
    const JITTER = 4 // ignore sub-pixel scroll noise before flipping state
    let lastY = window.scrollY
    let raf = 0
    const update = () => {
      raf = 0
      const y = window.scrollY
      const doc = document.documentElement
      const max = doc.scrollHeight - doc.clientHeight
      const progress = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0
      el?.style.setProperty('--read-progress', String(progress))
      const dy = y - lastY
      if (y <= EXPAND_AT) setCollapsed(false)
      else if (dy > JITTER) setCollapsed(true)
      else if (dy < -JITTER) setCollapsed(false)
      lastY = y
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <header className={`topbar${collapsed ? ' collapsed' : ''}`} ref={headerRef}>
      <div className="topbar-left">
        {/* The filename rolls in when the document loads, and re-rolls with a
            rainbow sweep whenever the .md content is refreshed from disk. */}
        <SlotLabel
          className="topbar-filename"
          text={meta?.displayName ?? '…'}
          revealOnMount
          rerollKey={mtimeMs}
          tint="var(--color-accent)"
        />
      </div>
      {/* The mode switch stays absolutely centered in the bar; the translation
          toggle hangs off its right edge (absolute) so it never shifts center. */}
      <div className="topbar-center">
        <ToggleGroup.Root
          className="seg"
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as ViewMode)}
          aria-label={t('viewMode')}
          title={`⌘E ${t('viewMode')}`}
        >
          {MODES.map(({ id, label, Icon }) => (
            <ToggleGroup.Item key={id} value={id} className="seg-btn">
              <Icon />
              {/* rerollKey flips when this mode becomes/stops being active, so
                  the just-clicked label rolls (untinted) as click feedback. */}
              <SlotLabel text={label} rerollKey={mode === id ? 'on' : 'off'} />
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
        {translation && (
          <button
            type="button"
            className={`topbar-trans${translation.active ? ' active' : ''}${translation.loading ? ' loading' : ''}`}
            onClick={translation.onToggle}
            disabled={translation.loading}
            aria-pressed={translation.active}
            aria-label={translation.loading ? t('translating') : translation.label}
            title={t('toggleLang')}
          >
            <LanguageIcon />
          </button>
        )}
      </div>
      <div className="topbar-right">
        {onToggleRail && (
          <button
            type="button"
            className={`btn-ghost topbar-icon-btn${railOpen ? ' active' : ''}`}
            onClick={onToggleRail}
            aria-label={railOpen ? t('hideComments') : t('showComments')}
            aria-pressed={railOpen}
            title={t('toggleRail')}
          >
            <ChatIcon />
          </button>
        )}
        <HandBackButton />
      </div>
    </header>
  )
}
