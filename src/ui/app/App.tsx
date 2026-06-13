import { useEffect, useState, type ReactNode } from 'react'
import { Tooltip } from 'radix-ui'
import { useT } from '../i18n'
import { GrainOverlay, ThemeEffects } from '../theme/ThemeProvider'
import { useConfig } from './configStore'
import { Navigator, useIsNarrow } from './Navigator'
import { useNav } from './navStore'
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
    <Tooltip.Provider delayDuration={500} skipDelayDuration={300}>
      <ThemeEffects />
      {route.kind === 'doc' && (
        <AppFrame sessionId={route.sessionId}>
          <SessionView key={route.sessionId} sessionId={route.sessionId} />
        </AppFrame>
      )}
      {route.kind === 'workspace' && (
        <AppFrame workspaceId={route.workspaceId} sessionId={route.sessionId}>
          <WorkspaceView key={route.workspaceId} workspaceId={route.workspaceId} sessionId={route.sessionId} />
        </AppFrame>
      )}
      {route.kind === 'home' && <HomeView />}
      <GrainOverlay />
    </Tooltip.Provider>
  )
}

/**
 * The shared frame: the single left navigator (when a workspace is open OR the
 * current doc has an outline) + the routed content. The navigator is in-flow on
 * wide screens (content gets a left margin) and off-canvas on narrow ones.
 */
function AppFrame({
  workspaceId = null,
  sessionId,
  children,
}: {
  workspaceId?: string | null
  sessionId: string | null
  children: ReactNode
}) {
  const outlineCount = useNav((s) => s.outline.length)
  const collapsed = useNav((s) => s.collapsed)
  const narrow = useIsNarrow()
  const navPresent = !!workspaceId || outlineCount >= 2
  const withNav = navPresent && !narrow && !collapsed
  return (
    <>
      {navPresent && <Navigator workspaceId={workspaceId} openSessionId={sessionId} />}
      <div className={`app-content${withNav ? ' with-nav' : ''}`}>{children}</div>
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
