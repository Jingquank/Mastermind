import { useState } from 'react'
import { useT } from '../i18n'
import { useDoc } from './store'

/** First save of a draft: pick the real filename (same directory). */
export function RenameDialog() {
  const renameError = useDoc((s) => s.renameError)
  const [name, setName] = useState('')
  const t = useT()

  const submit = (): void => {
    if (name.trim()) void useDoc.getState().completeRename(name.trim())
  }

  return (
    <div className="modal-backdrop" onClick={() => useDoc.getState().cancelRename()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h4>{t('nameDraft')}</h4>
        <input
          autoFocus
          type="text"
          className="settings-input"
          placeholder="plan.md"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') useDoc.getState().cancelRename()
          }}
        />
        {renameError && <p className="modal-error">{renameError}</p>}
        <div className="rail-actions">
          <button type="button" onClick={() => useDoc.getState().cancelRename()}>
            {t('cancel')}
          </button>
          <button type="button" className="primary" disabled={!name.trim()} onClick={submit}>
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}
