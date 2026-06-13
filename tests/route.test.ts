import { describe, expect, it } from 'vitest'
import { parseRoute } from '../src/ui/app/route'

const WID = '479f2eb9-6313-4d75-8002-215ee536c4e4'
const SID = '31dd9b72-c8ff-403d-a054-f8fb5c3e860b'

describe('parseRoute', () => {
  it('routes / to home', () => {
    expect(parseRoute('/')).toEqual({ kind: 'home' })
    expect(parseRoute('/anything-else')).toEqual({ kind: 'home' })
  })

  it('routes /d/:sid to a single-file doc', () => {
    expect(parseRoute(`/d/${SID}`)).toEqual({ kind: 'doc', sessionId: SID })
  })

  it('routes /w/:wid to a workspace with no file', () => {
    expect(parseRoute(`/w/${WID}`)).toEqual({ kind: 'workspace', workspaceId: WID, sessionId: null })
    expect(parseRoute(`/w/${WID}/`)).toEqual({ kind: 'workspace', workspaceId: WID, sessionId: null })
  })

  it('routes /w/:wid/d/:sid to a workspace with an open file', () => {
    expect(parseRoute(`/w/${WID}/d/${SID}`)).toEqual({ kind: 'workspace', workspaceId: WID, sessionId: SID })
    expect(parseRoute(`/w/${WID}/d/${SID}/`)).toEqual({ kind: 'workspace', workspaceId: WID, sessionId: SID })
  })

  it('keeps /d/:sid an exact suffix (workspace match wins for /w/.../d/...)', () => {
    // a workspace URL must not be mis-parsed as a bare doc
    expect(parseRoute(`/w/${WID}/d/${SID}`).kind).toBe('workspace')
  })
})
