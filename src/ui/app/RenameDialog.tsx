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
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') useDoc.getState().cancelRename()
          if (e.key === 'Tab') {
            // contain focus inside the dialog
            const focusables = e.currentTarget.querySelectorAll<HTMLElement>('input, button:not(:disabled)')
            if (focusables.length === 0) return
            const first = focusables[0]!
            const last = focusables[focusables.length - 1]!
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault()
              last.focus()
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault()
              first.focus()
            }
          }
        }}
      >
        <h4 id="rename-title">{t('nameDraft')}</h4>
        <input
          autoFocus
          type="text"
          className="settings-input"
          placeholder="plan.md"
          aria-label={t('draftFilename')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
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
