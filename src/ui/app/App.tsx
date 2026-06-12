import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { GrainOverlay, ThemeEffects } from '../theme/ThemeProvider'
import { useConfig } from './configStore'
import { SessionView } from './SessionView'

export function App() {
  const load = useConfig((s) => s.load)
  const t = useT()
  const [draftError, setDraftError] = useState(false)
  useEffect(() => {
    void load()
  }, [load])

  const match = window.location.pathname.match(/^\/d\/([0-9a-f-]+)/i)
  return (
    <>
      <ThemeEffects />
      {match?.[1] ? (
        <SessionView sessionId={match[1]} />
      ) : (
        <div className="center-note">
          <h1>MASTERMIND</h1>
          <p>
            {t('openHint')} <code>mastermind open &lt;file.md&gt;</code>
          </p>
          <p>
            <button
              type="button"
              className="btn-cta"
              onClick={() => {
                setDraftError(false)
                fetch('/api/sessions', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ draft: true }),
                })
                  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
                  .then((j: { url?: string }) => {
                    if (j.url) window.location.href = j.url
                    else setDraftError(true)
                  })
                  .catch(() => setDraftError(true))
              }}
            >
              {t('newDraft')}
            </button>
          </p>
          {draftError && <p className="modal-error">{t('newDraftFailed')}</p>}
        </div>
      )}
      <GrainOverlay />
    </>
  )
}
