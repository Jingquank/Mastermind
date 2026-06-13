import { useEffect, useState } from 'react'
import type { WorkspaceMeta } from '../../shared/types'
import { useT } from '../i18n'
import { SessionView } from './SessionView'

interface Props {
  workspaceId: string
  sessionId: string | null
}

/**
 * Workspace shell. For V12 this only validates the workspace and routes to the
 * open file (or an empty state); the tree sidebar lands in V13. A file open in a
 * workspace is still an ordinary session, so SessionView is reused verbatim —
 * keyed by sessionId so switching files remounts it cleanly.
 */
export function WorkspaceView({ workspaceId, sessionId }: Props) {
  const t = useT()
  const [meta, setMeta] = useState<WorkspaceMeta | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let alive = true
    setMeta(null)
    setMissing(false)
    fetch(`/api/workspaces/${workspaceId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((m: WorkspaceMeta) => alive && setMeta(m))
      .catch(() => alive && setMissing(true))
    return () => {
      alive = false
    }
  }, [workspaceId])

  useEffect(() => {
    if (meta && !sessionId) document.title = `${meta.displayName} — Mastermind`
  }, [meta, sessionId])

  if (missing) {
    return (
      <div className="center-note">
        <h1>MASTERMIND</h1>
        <p>{t('workspaceNotFound')}</p>
        <p>
          <code>mastermind workspace .</code>
        </p>
      </div>
    )
  }

  if (sessionId) return <SessionView key={sessionId} sessionId={sessionId} />

  return (
    <div className="center-note">
      <h1>{meta?.displayName ?? 'MASTERMIND'}</h1>
      <p>{t('workspaceEmpty')}</p>
    </div>
  )
}
