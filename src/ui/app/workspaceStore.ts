import { create } from 'zustand'
import type {
  FileMeta,
  ReviewCounts,
  TreeResponse,
  WorkspaceMeta,
  WorkspaceSessionInfo,
} from '../../shared/types'
import { navigate } from './route'
import { useDoc } from './store'

const BADGE_CONCURRENCY = 4
const RECENT_CAP = 8

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem('mm:ws-collapsed') === '1'
  } catch {
    return false
  }
}
function loadRecent(root: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(`mm:recent:${root}`) ?? '[]') as string[]
  } catch {
    return []
  }
}
function saveRecent(root: string, recent: string[]): void {
  try {
    localStorage.setItem(`mm:recent:${root}`, JSON.stringify(recent))
  } catch {
    /* private mode / quota — recents are best-effort */
  }
}

interface WorkspaceState {
  status: 'loading' | 'ready' | 'missing'
  workspaceId: string | null
  root: string
  displayName: string
  collapsed: boolean
  expanded: Set<string>
  /** dir rel → its entries (one lazy level each) */
  children: Record<string, TreeResponse['entries']>
  loadingDirs: Set<string>
  /** file rel → counts (null = no marks / non-md); absent key = not fetched */
  badges: Record<string, ReviewCounts | null>
  sessions: WorkspaceSessionInfo[]
  recent: string[]
  _es: EventSource | null
  _onFocus: (() => void) | null

  init(workspaceId: string): Promise<void>
  teardown(): void
  toggleDir(rel: string): void
  loadDir(rel: string): Promise<void>
  ensureBadge(rel: string): void
  refreshSessions(): Promise<void>
  setCollapsed(v: boolean): void
  openFile(rel: string): Promise<void>
}

// Badge fetch scheduler — purely internal, no UI binding, so it lives at module
// scope (one workspace is open at a time; init() resets it).
let badgeActive = 0
const badgeQueue: string[] = []
const badgePending = new Set<string>()

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  status: 'loading',
  workspaceId: null,
  root: '',
  displayName: '',
  collapsed: loadCollapsed(),
  expanded: new Set(),
  children: {},
  loadingDirs: new Set(),
  badges: {},
  sessions: [],
  recent: [],
  _es: null,
  _onFocus: null,

  async init(workspaceId) {
    get().teardown()
    set({
      status: 'loading',
      workspaceId,
      expanded: new Set(),
      children: {},
      badges: {},
      sessions: [],
      loadingDirs: new Set(),
    })
    let meta: WorkspaceMeta | null = null
    try {
      const r = await fetch(`/api/workspaces/${workspaceId}`)
      meta = r.ok ? ((await r.json()) as WorkspaceMeta) : null
    } catch {
      meta = null
    }
    if (!meta || get().workspaceId !== workspaceId) {
      if (!meta) set({ status: 'missing' })
      return
    }
    set({ status: 'ready', root: meta.root, displayName: meta.displayName, recent: loadRecent(meta.root) })
    await get().loadDir('')
    void get().refreshSessions()

    // live channel: a save/handback/agent-attach refreshes the affected row;
    // returning focus to the tab re-pulls the open levels + sessions
    const es = new EventSource(`/api/workspaces/${workspaceId}/events`)
    es.addEventListener('file-badge-changed', (e) => {
      const { rel } = JSON.parse((e as MessageEvent).data) as { rel: string }
      set((s) => {
        const badges = { ...s.badges }
        delete badges[rel]
        return { badges }
      })
      badgePending.delete(rel)
      get().ensureBadge(rel)
      void get().refreshSessions()
    })
    es.addEventListener('file-list-changed', (e) => {
      const { dir } = JSON.parse((e as MessageEvent).data) as { dir: string }
      if (dir === '' || get().expanded.has(dir)) void get().loadDir(dir)
    })
    const onFocus = (): void => {
      void get().loadDir('')
      for (const dir of get().expanded) void get().loadDir(dir)
      void get().refreshSessions()
    }
    window.addEventListener('focus', onFocus)
    set({ _es: es, _onFocus: onFocus })
  },

  teardown() {
    const { _es, _onFocus } = get()
    _es?.close()
    if (_onFocus) window.removeEventListener('focus', _onFocus)
    badgeQueue.length = 0
    badgePending.clear()
    set({ _es: null, _onFocus: null })
  },

  toggleDir(rel) {
    const expanded = new Set(get().expanded)
    if (expanded.has(rel)) {
      expanded.delete(rel)
      set({ expanded })
    } else {
      expanded.add(rel)
      set({ expanded })
      if (!get().children[rel]) void get().loadDir(rel)
    }
  },

  async loadDir(rel) {
    const { workspaceId, loadingDirs } = get()
    if (!workspaceId || loadingDirs.has(rel)) return
    set({ loadingDirs: new Set(loadingDirs).add(rel) })
    try {
      const r = await fetch(`/api/workspaces/${workspaceId}/tree?dir=${encodeURIComponent(rel)}`)
      if (r.ok && get().workspaceId === workspaceId) {
        const body = (await r.json()) as TreeResponse
        set((s) => ({ children: { ...s.children, [rel]: body.entries } }))
      }
    } catch {
      /* leave the level as-is on a transient failure */
    } finally {
      set((s) => {
        const next = new Set(s.loadingDirs)
        next.delete(rel)
        return { loadingDirs: next }
      })
    }
  },

  ensureBadge(rel) {
    if (rel in get().badges || badgePending.has(rel)) return
    badgePending.add(rel)
    badgeQueue.push(rel)
    pumpBadges(get, set)
  },

  async refreshSessions() {
    const { workspaceId } = get()
    if (!workspaceId) return
    try {
      const r = await fetch(`/api/workspaces/${workspaceId}/sessions`)
      if (r.ok && get().workspaceId === workspaceId) set({ sessions: (await r.json()) as WorkspaceSessionInfo[] })
    } catch {
      /* keep last-known sessions on a transient failure */
    }
  },

  setCollapsed(v) {
    try {
      localStorage.setItem('mm:ws-collapsed', v ? '1' : '0')
    } catch {
      /* best-effort */
    }
    set({ collapsed: v })
  },

  async openFile(rel) {
    const { workspaceId, root } = get()
    if (!workspaceId) return
    // never drop unsaved WYSIWYG edits when navigating away
    useDoc.getState().flushEditor?.()
    try {
      const r = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: `${root}/${rel}` }),
      })
      if (!r.ok) return
      const sess = (await r.json()) as { sessionId: string }
      const recent = [rel, ...get().recent.filter((x) => x !== rel)].slice(0, RECENT_CAP)
      saveRecent(root, recent)
      set({ recent })
      navigate(`/w/${workspaceId}/d/${sess.sessionId}`)
    } catch {
      /* daemon unreachable — leave the user where they are */
    }
  },
}))

type Getter = () => WorkspaceState
type Setter = (partial: Partial<WorkspaceState> | ((s: WorkspaceState) => Partial<WorkspaceState>)) => void

/** Drain the badge queue under a small concurrency cap so a big tree doesn't fan out. */
function pumpBadges(get: Getter, set: Setter): void {
  while (badgeActive < BADGE_CONCURRENCY && badgeQueue.length > 0) {
    const rel = badgeQueue.shift()!
    const wid = get().workspaceId
    badgeActive++
    void (async () => {
      let counts: ReviewCounts | null = null
      try {
        const r = await fetch(`/api/workspaces/${wid}/file-meta?path=${encodeURIComponent(rel)}`)
        if (r.ok) counts = ((await r.json()) as FileMeta).counts
      } catch {
        counts = null
      } finally {
        badgeActive--
        badgePending.delete(rel)
        if (get().workspaceId === wid) set((s) => ({ badges: { ...s.badges, [rel]: counts } }))
        pumpBadges(get, set)
      }
    })()
  }
}
