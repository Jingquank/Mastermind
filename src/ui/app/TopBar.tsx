import { useLayoutEffect, useRef } from 'react'
import { useT } from '../i18n'
import { GearIcon, SwapIcon } from '../icons'
import { useDirty, useDoc, type ViewMode } from './store'

interface TopBarProps {
  railOpen?: boolean
  onToggleRail?: () => void
  suggestionCount?: number
  onAcceptAll?: () => void
  onRejectAll?: () => void
  onToggleSettings?: () => void
  translation?: { label: string; active: boolean; loading: boolean; onToggle: () => void }
  agentWaiting?: boolean
}

export function TopBar({
  railOpen,
  onToggleRail,
  suggestionCount = 0,
  onAcceptAll,
  onRejectAll,
  onToggleSettings,
  translation,
  agentWaiting = false,
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

  // anchored overlays (settings panel, translating pill) position off the
  // bar's REAL height — which doubles when the bar wraps at narrow widths
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
          <span className="agent-chip" title={t('handBackTitle')}>
            <span className="agent-chip-dot" />
            {t('agentWaiting')}
          </span>
        )}
      </div>
      <nav className="seg" aria-label={t('viewMode')} title={`⌘E ${t('viewMode')}`}>
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`seg-btn${mode === m.id ? ' active' : ''}`}
            aria-pressed={mode === m.id}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </nav>
      <div className="topbar-right">
        {translation && (
          <button
            type="button"
            className={`btn-ghost lang-toggle${translation.active ? ' active' : ''}`}
            aria-pressed={translation.active}
            onClick={translation.onToggle}
            disabled={translation.loading}
            title={t('toggleLang')}
          >
            <SwapIcon />
            {translation.loading ? t('translating') : translation.label}
          </button>
        )}
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
          <button type="button" className="btn-ghost" onClick={onToggleRail} title={t('toggleRail')}>
            {railOpen ? t('hideComments') : t('showComments')}
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
        {onToggleSettings && (
          <button
            type="button"
            className="btn-ghost settings-gear"
            onClick={onToggleSettings}
            title={t('settings')}
            aria-label={t('settings')}
          >
            <GearIcon width={15} height={15} />
          </button>
        )}
      </div>
    </header>
  )
}
