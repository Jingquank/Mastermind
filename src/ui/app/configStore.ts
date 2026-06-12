import { create } from 'zustand'
import type { ClientConfig, ThemeInfo } from '../../shared/types'

export interface ProviderPatch {
  type: 'anthropic' | 'openai-compatible'
  baseUrl?: string
  model?: string
  apiKey?: string
}

export type ConfigPatch = Partial<Omit<ClientConfig, 'provider' | 'version'>> & {
  provider?: ProviderPatch | null
}

interface ConfigState {
  config: ClientConfig | null
  themes: ThemeInfo[]
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

  async load() {
    const [config, themes] = await Promise.all([
      fetchJson<ClientConfig>('/api/config'),
      fetchJson<ThemeInfo[]>('/api/themes'),
    ])
    set({ config, themes })
  },

  async update(patch) {
    // optimistic for snappy sliders; server response settles it
    const current = get().config
    if (current) {
      set({ config: { ...current, ...patch, provider: current.provider } as ClientConfig })
    }
    const config = await fetchJson<ClientConfig>('/api/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    set({ config })
  },
}))
