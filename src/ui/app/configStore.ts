import { create } from 'zustand'
import type { BrowserInfo, ClientConfig, ThemeInfo } from '../../shared/types'

export type ConfigPatch = Partial<Omit<ClientConfig, 'version'>>

interface ConfigState {
  config: ClientConfig | null
  themes: ThemeInfo[]
  browsers: BrowserInfo[]
  load(): Promise<void>
  update(patch: ConfigPatch): Promise<void>
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return (await res.json()) as T
}

export const useConfig = create<ConfigState>((set, get) => ({
  config: null,
  themes: [],
  browsers: [],

  async load() {
    const [config, themes, browsers] = await Promise.all([
      fetchJson<ClientConfig>('/api/config'),
      fetchJson<ThemeInfo[]>('/api/themes'),
      // Non-essential + newer endpoint: a missing/older /api/browsers (version skew) must
      // never reject the whole load and blank `config` — degrade to no detected browsers.
      fetchJson<BrowserInfo[]>('/api/browsers').catch(() => [] as BrowserInfo[]),
    ])
    set({ config, themes, browsers })
  },

  async update(patch) {
    // optimistic for snappy sliders; server response settles it
    const current = get().config
    if (current) {
      set({ config: { ...current, ...patch } as ClientConfig })
    }
    try {
      const config = await fetchJson<ClientConfig>('/api/config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      set({ config })
    } catch {
      // never leave an optimistic value lying about persisted state
      await get()
        .load()
        .catch(() => {})
      const { useDoc } = await import('./store')
      useDoc.getState().setNotice({ kind: 'error', msg: 'configSaveFailed' })
    }
  },
}))
