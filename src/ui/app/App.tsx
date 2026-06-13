import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { GrainOverlay, ThemeEffects } from '../theme/ThemeProvider'
import { useConfig } from './configStore'
import { useRoute } from './route'
import { SessionView } from './SessionView'
import { WorkspaceView } from './WorkspaceView'

export function App() {
  const load = useConfig((s) => s.load)
  const route = useRoute()
  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <ThemeEffects />
      {route.kind === 'doc' && <SessionView key={route.sessionId} sessionId={route.sessionId} />}
      {route.kind === 'workspace' && (
        <WorkspaceView key={route.workspaceId} workspaceId={route.workspaceId} sessionId={route.sessionId} />
      )}
      {route.kind === 'home' && <HomeView />}
      <GrainOverlay />
    </>
  )
}

function HomeView() {
  const t = useT()
  const [draftError, setDraftError] = useState(false)
  return (
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
  )
}
