import { useEffect, useState } from 'react'

/**
 * Hand-rolled routing (no router dep). Three shapes:
 *   /d/:sid           a single-file session (the agent-loop path — unchanged)
 *   /w/:wid           a workspace with no file open yet
 *   /w/:wid/d/:sid    a workspace with a file open ( /d/:sid stays an exact suffix )
 */
export type Route =
  | { kind: 'home' }
  | { kind: 'doc'; sessionId: string }
  | { kind: 'workspace'; workspaceId: string; sessionId: string | null }

const ID = '[0-9a-f-]+'
const WS_RE = new RegExp(`^/w/(${ID})(?:/d/(${ID}))?/?$`, 'i')
const DOC_RE = new RegExp(`^/d/(${ID})`, 'i')

export function parseRoute(pathname: string): Route {
  const ws = WS_RE.exec(pathname)
  if (ws) return { kind: 'workspace', workspaceId: ws[1]!, sessionId: ws[2] ?? null }
  const doc = DOC_RE.exec(pathname)
  if (doc) return { kind: 'doc', sessionId: doc[1]! }
  return { kind: 'home' }
}

/** SPA navigation: push a path and notify listeners (popstate covers back/forward). */
export function navigate(to: string): void {
  if (to === window.location.pathname) return
  window.history.pushState(null, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname))
  useEffect(() => {
    const onPop = (): void => setRoute(parseRoute(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return route
}
