import { useEffect } from 'react'
import { useT } from '../i18n'
import { SessionView } from './SessionView'
import { Tree } from './Tree'
import { useWorkspace } from './workspaceStore'

interface Props {
  workspaceId: string
  sessionId: string | null
}

/**
 * Workspace shell: a file-tree sidebar plus the document content. A file open in
 * a workspace is still an ordinary session, so SessionView is reused verbatim —
 * keyed by sessionId so switching files remounts it cleanly.
 */
export function WorkspaceView({ workspaceId, sessionId }: Props) {
  const t = useT()
  const init = useWorkspace((s) => s.init)
  const status = useWorkspace((s) => s.status)
  const displayName = useWorkspace((s) => s.displayName)
  const collapsed = useWorkspace((s) => s.collapsed)

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

  return (
    <div className={`ws-layout${collapsed ? ' collapsed' : ''}`}>
      <Tree openSessionId={sessionId} />
      <div className="ws-content">
        {sessionId ? (
          <SessionView key={sessionId} sessionId={sessionId} />
        ) : (
          <div className="center-note">
            <h1>{displayName || 'MASTERMIND'}</h1>
            <p>{t('workspaceEmpty')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
