import { afterEach, describe, expect, it, vi } from 'vitest'
import { useConfig } from '../src/ui/app/configStore'

function mockFetch(routes: Record<string, unknown>) {
  return vi.fn((url: string) => {
    if (url in routes) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(routes[url]) } as Response)
    }
    // unknown route → 404 (mimics an older daemon without /api/browsers)
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response)
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  useConfig.setState({ config: null, themes: [], browsers: [] })
})

describe('configStore.load resilience', () => {
  it('still loads config + themes when /api/browsers 404s (version skew)', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/api/config': { version: 1, theme: 'grid', langPair: { a: 'English', b: 'Simplified Chinese' }, browser: '' },
        '/api/themes': [{ id: 'grid', name: 'Grid' }],
        // '/api/browsers' intentionally absent → 404
      }),
    )
    await useConfig.getState().load()
    const s = useConfig.getState()
    expect(s.config).not.toBeNull()
    expect(s.config!.theme).toBe('grid')
    expect(s.themes).toHaveLength(1)
    expect(s.browsers).toEqual([]) // degraded, not fatal
  })

  it('populates browsers when /api/browsers is available', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/api/config': { version: 1, theme: 'grid', langPair: { a: 'English', b: 'Simplified Chinese' }, browser: '' },
        '/api/themes': [],
        '/api/browsers': [{ id: 'Safari', name: 'Safari' }],
      }),
    )
    await useConfig.getState().load()
    expect(useConfig.getState().browsers).toEqual([{ id: 'Safari', name: 'Safari' }])
  })
})
