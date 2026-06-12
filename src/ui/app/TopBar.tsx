import { useT } from '../i18n'
import { useDirty, useDoc, type ViewMode } from './store'

interface TopBarProps {
  railOpen?: boolean
  onToggleRail?: () => void
  suggestionCount?: number
  onAcceptAll?: () => void
  onRejectAll?: () => void
  onToggleSettings?: () => void
  translation?: { label: string; active: boolean; loading: boolean; onToggle: () => void }
}

export function TopBar({
  railOpen,
  onToggleRail,
  suggestionCount = 0,
  onAcceptAll,
  onRejectAll,
  onToggleSettings,
  translation,
}: TopBarProps) {
  const t = useT()
  const meta = useDoc((s) => s.meta)
  const mode = useDoc((s) => s.mode)
  const setMode = useDoc((s) => s.setMode)
  const save = useDoc((s) => s.save)
  const saving = useDoc((s) => s.saving)
  const dirty = useDirty()

  const MODES: { id: ViewMode; label: string }[] = [
    { id: 'reading', label: t('reading') },
    { id: 'editing', label: t('editing') },
    { id: 'source', label: t('source') },
  ]

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-filename">{meta?.displayName ?? '…'}</span>
        <span className={`dirty-dot${dirty ? ' visible' : ''}`} title={dirty ? t('unsavedChanges') : t('saved')} />
      </div>
      <nav className="seg" aria-label="View mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`seg-btn${mode === m.id ? ' active' : ''}`}
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
            onClick={translation.onToggle}
            disabled={translation.loading}
            title={t('toggleLang')}
          >
            {translation.loading ? '…' : translation.label}
          </button>
        )}
        {suggestionCount > 0 && (
          <>
            <button type="button" className="btn-ghost accept-all" onClick={onAcceptAll} title={t('acceptAllTitle')}>
              {t('acceptAll')} ({suggestionCount})
            </button>
            <button type="button" className="btn-ghost reject-all" onClick={onRejectAll} title={t('rejectAllTitle')}>
              {t('rejectAll')}
            </button>
          </>
        )}
        {onToggleRail && (
          <button type="button" className="btn-ghost" onClick={onToggleRail} title={t('toggleRail')}>
            {railOpen ? t('hideComments') : t('showComments')}
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? t('saving') : t('save')}
        </button>
        <button
          type="button"
          className="btn-cta"
          onClick={() => void useDoc.getState().handback()}
          disabled={saving}
          title={t('handBackTitle')}
        >
          {t('handBack')}
        </button>
        {onToggleSettings && (
          <button
            type="button"
            className="btn-ghost settings-gear"
            onClick={onToggleSettings}
            title={t('settings')}
            aria-label={t('settings')}
          >
            ⚙
          </button>
        )}
      </div>
    </header>
  )
}
