import { useLayoutEffect, useRef } from 'react'
import { ToggleGroup } from 'radix-ui'
import { useT } from '../i18n'
import { ChatIcon, GearIcon } from '../icons'
import { useDirty, useDoc, type ViewMode } from './store'

interface TopBarProps {
  railOpen?: boolean
  onToggleRail?: () => void
  suggestionCount?: number
  onAcceptAll?: () => void
  onRejectAll?: () => void
  onToggleSettings?: () => void
  agentWaiting?: boolean
  handbackPulse?: boolean
}

export function TopBar({
  railOpen,
  onToggleRail,
  suggestionCount = 0,
  onAcceptAll,
  onRejectAll,
  onToggleSettings,
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

  const MODES: { id: ViewMode; label: string }[] = [
    { id: 'reading', label: t('reading') },
    { id: 'editing', label: t('editing') },
    { id: 'source', label: t('source') },
  ]

  // The bar never wraps (Phase E), so --topbar-h is effectively constant; keep
  // the observer so anchored overlays still self-correct if the font size changes.
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const apply = () => document.documentElement.style.setProperty('--topbar-h', `${el.offsetHeight}px`)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <header className="topbar" ref={headerRef}>
      <div className="topbar-left">
        <span className="topbar-filename">{meta?.displayName ?? '…'}</span>
        <span className={`dirty-dot${dirty ? ' visible' : ''}`} title={dirty ? t('unsavedChanges') : t('saved')} />
        {agentWaiting && (
          <span className={`agent-chip${handbackPulse ? ' released' : ''}`} title={t('handBackTitle')}>
            <span className="agent-chip-dot" />
            {t('agentWaiting')}
          </span>
        )}
      </div>
      <ToggleGroup.Root
        className="seg"
        type="single"
        value={mode}
        onValueChange={(v) => v && setMode(v as ViewMode)}
        aria-label={t('viewMode')}
        title={`⌘E ${t('viewMode')}`}
      >
        {MODES.map((m) => (
          <ToggleGroup.Item key={m.id} value={m.id} className="seg-btn">
            {m.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
      <div className="topbar-right">
        {suggestionCount > 0 && (
          <div className="seg review-bulk" role="group" aria-label={`${suggestionCount} ${t('suggestionsLabel')}`}>
            <span className="bulk-count" title={`${suggestionCount} ${t('suggestionsLabel')}`}>
              {suggestionCount}
            </span>
            <button type="button" className="seg-btn bulk-accept" onClick={onAcceptAll} title={t('acceptAllTitle')}>
              {t('acceptAll')}
            </button>
            <button type="button" className="seg-btn bulk-reject" onClick={onRejectAll} title={t('rejectAllTitle')}>
              {t('rejectAll')}
            </button>
          </div>
        )}
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
        <button
          type="button"
          className="btn-ghost"
          onClick={() => void save()}
          disabled={!dirty || saving}
          title={`${t('save')} (⌘S)`}
        >
          {savingKind === 'save' ? t('saving') : dirty ? t('save') : t('saved')}
        </button>
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
