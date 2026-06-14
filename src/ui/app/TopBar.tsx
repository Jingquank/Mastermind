import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type SVGProps } from 'react'
import { ToggleGroup } from 'radix-ui'
import { useT } from '../i18n'
import { ChatIcon, CodeIcon, EyeIcon, GearIcon, LanguageIcon, PencilIcon } from '../icons'
import { useDirty, useDoc, type ViewMode } from './store'

interface TopBarProps {
  railOpen?: boolean
  onToggleRail?: () => void
  onToggleSettings?: () => void
  /** Reading-language toggle, rendered beside the centered mode switch. */
  translation?: {
    label: string
    active: boolean
    loading: boolean
    disabled?: boolean
    disabledTitle?: string
    onToggle: () => void
  }
  agentWaiting?: boolean
  handbackPulse?: boolean
}

export function TopBar({
  railOpen,
  onToggleRail,
  onToggleSettings,
  translation,
  agentWaiting = false,
  handbackPulse = false,
}: TopBarProps) {
  const t = useT()
  const headerRef = useRef<HTMLElement | null>(null)
  const meta = useDoc((s) => s.meta)
  const mode = useDoc((s) => s.mode)
  const setMode = useDoc((s) => s.setMode)
  const save = useDoc((s) => s.save)
  const saving = useDoc((s) => s.saving)
  const savingKind = useDoc((s) => s.savingKind)
  const dirty = useDirty()
  // Collapsed = the floating bar has shrunk into its compact island (scrolled
  // down, away from the top). Scrolling up / hover / focus-within re-expands it
  // (hover & focus are handled purely in CSS so they win without a re-render).
  const [collapsed, setCollapsed] = useState(false)

  const MODES: { id: ViewMode; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
    { id: 'reading', label: t('reading'), Icon: EyeIcon },
    { id: 'editing', label: t('editing'), Icon: PencilIcon },
    { id: 'source', label: t('source'), Icon: CodeIcon },
  ]
  const modeLabel = MODES.find((m) => m.id === mode)?.label ?? ''

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
        <span className={`dirty-dot${dirty ? ' visible' : ''}`} title={dirty ? t('unsavedChanges') : t('saved')} />
        <span className="topbar-filename">{meta?.displayName ?? '…'}</span>
        {/* Shown only in the collapsed island — the current view mode at a glance. */}
        <span className="topbar-mode-label" aria-hidden>
          {modeLabel}
        </span>
        {agentWaiting && (
          <span className={`agent-chip${handbackPulse ? ' released' : ''}`} title={t('handBackTitle')}>
            <span className="agent-chip-dot" />
            {t('agentWaiting')}
          </span>
        )}
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
              {label}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
        {translation && (
          <button
            type="button"
            className={`topbar-trans${translation.active ? ' active' : ''}${translation.loading ? ' loading' : ''}`}
            onClick={translation.onToggle}
            disabled={translation.disabled || translation.loading}
            aria-pressed={translation.active}
            aria-label={translation.loading ? t('translating') : translation.label}
            title={translation.disabled ? (translation.disabledTitle ?? t('toggleLang')) : t('toggleLang')}
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
        {onToggleSettings && (
          <button
            type="button"
            className="btn-ghost topbar-icon-btn topbar-settings"
            onClick={onToggleSettings}
            aria-label={t('settings')}
            title={t('settings')}
          >
            <GearIcon width={14} height={14} />
          </button>
        )}
        {(dirty || savingKind === 'save') && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => void save()}
            disabled={saving}
            title={`${t('save')} (⌘S)`}
          >
            {savingKind === 'save' ? t('saving') : t('save')}
          </button>
        )}
        <button
          type="button"
          className="btn-cta"
          onClick={() => void useDoc.getState().handback()}
          disabled={saving}
          title={t('handBackTitle')}
        >
          {savingKind === 'handback' ? t('handingBack') : t('handBack')}
        </button>
      </div>
    </header>
  )
}
