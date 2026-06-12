import { useDirty, useDoc, type ViewMode } from './store'

const MODES: { id: ViewMode; label: string; enabled: boolean }[] = [
  { id: 'reading', label: 'Reading', enabled: true },
  { id: 'editing', label: 'Editing', enabled: true },
  { id: 'source', label: 'Source', enabled: true },
]

interface TopBarProps {
  railOpen?: boolean
  onToggleRail?: () => void
  suggestionCount?: number
  onAcceptAll?: () => void
  onRejectAll?: () => void
}

export function TopBar({ railOpen, onToggleRail, suggestionCount = 0, onAcceptAll, onRejectAll }: TopBarProps) {
  const meta = useDoc((s) => s.meta)
  const mode = useDoc((s) => s.mode)
  const setMode = useDoc((s) => s.setMode)
  const save = useDoc((s) => s.save)
  const saving = useDoc((s) => s.saving)
  const dirty = useDirty()

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-filename">{meta?.displayName ?? '…'}</span>
        <span className={`dirty-dot${dirty ? ' visible' : ''}`} title={dirty ? 'Unsaved changes' : 'Saved'} />
      </div>
      <nav className="seg" aria-label="View mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`seg-btn${mode === m.id ? ' active' : ''}`}
            disabled={!m.enabled}
            title={m.enabled ? undefined : 'Coming soon'}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </nav>
      <div className="topbar-right">
        {suggestionCount > 0 && (
          <>
            <button type="button" className="btn-ghost accept-all" onClick={onAcceptAll} title="Apply every suggested edit">
              Accept all ({suggestionCount})
            </button>
            <button type="button" className="btn-ghost reject-all" onClick={onRejectAll} title="Revert every suggested edit">
              Reject all
            </button>
          </>
        )}
        {onToggleRail && (
          <button type="button" className="btn-ghost" onClick={onToggleRail} title="Toggle comment rail">
            {railOpen ? 'Hide comments' : 'Show comments'}
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="btn-cta"
          onClick={() => void useDoc.getState().handback()}
          disabled={saving}
          title="Save with a review summary and signal the waiting agent"
        >
          Save &amp; hand back
        </button>
      </div>
    </header>
  )
}
