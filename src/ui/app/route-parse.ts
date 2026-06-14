/**
 * Pure URL → route parsing. Kept DOM-free (no `window`) so it can be imported
 * from the node/test typecheck project without dragging in browser globals.
 * The DOM-bound navigation helpers live in `route.ts`.
 *
 * Three shapes:
 *   /d/:sid           a single-file session (the agent-loop path)
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
