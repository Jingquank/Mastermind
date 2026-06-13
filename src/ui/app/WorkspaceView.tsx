import { useEffect } from 'react'
import { useT } from '../i18n'
import { SessionView } from './SessionView'
import { useWorkspace } from './workspaceStore'

interface Props {
  workspaceId: string
  sessionId: string | null
}

/**
 * Workspace content: owns the workspace store lifecycle and renders the open
 * file (an ordinary session) or the empty state. The file tree now lives in the
 * shared Navigator (mounted by AppFrame), so this is just the right-hand content.
 */
export function WorkspaceView({ workspaceId, sessionId }: Props) {
  const t = useT()
  const init = useWorkspace((s) => s.init)
  const status = useWorkspace((s) => s.status)
  const displayName = useWorkspace((s) => s.displayName)

  useEffect(() => {
    void init(workspaceId)
    return () => useWorkspace.getState().teardown()
  }, [workspaceId, init])

  useEffect(() => {
    if (status === 'ready' && !sessionId) document.title = `${displayName} — Mastermind`
  }, [status, displayName, sessionId])

  if (status === 'missing') {
    return (
      <div className="center-note">
        <h1>MASTERMIND</h1>
        <p>
          {t('workspaceNotFound')} <code>mastermind workspace .</code>
        </p>
      </div>
    )
  }

  if (sessionId) return <SessionView key={sessionId} sessionId={sessionId} />

  return (
    <div className="center-note">
      <h1>{displayName || 'MASTERMIND'}</h1>
      <p>{t('workspaceEmpty')}</p>
    </div>
  )
}
