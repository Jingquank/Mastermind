import { useDirty, useDoc, type ViewMode } from './store'

const MODES: { id: ViewMode; label: string; enabled: boolean }[] = [
  { id: 'reading', label: 'Reading', enabled: true },
  { id: 'editing', label: 'Editing', enabled: false },
  { id: 'source', label: 'Source', enabled: false },
]

export function TopBar() {
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
        <button type="button" className="btn-ghost" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn-cta" disabled title="Coming soon">
          Save &amp; hand back
        </button>
      </div>
    </header>
  )
}
