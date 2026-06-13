import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, redactConfig } from '../src/server/config'
import { providerConfigured } from '../src/server/translate/index'
import type { MastermindConfig } from '../src/shared/types'

function withProvider(provider: MastermindConfig['provider']): MastermindConfig {
  return { ...DEFAULT_CONFIG, provider }
}

describe('agent-channel provider plumbing (V1)', () => {
  it('is configured with no key and no model', () => {
    const cfg = withProvider({ type: 'agent-channel' })
    expect(providerConfigured(cfg)).toBe(true)
    expect(redactConfig(cfg).provider).toEqual({
      type: 'agent-channel',
      baseUrl: undefined,
      model: undefined,
      configured: true,
    })
  })

  it('does not leak any key field to the client (there is none)', () => {
    const redacted = redactConfig(withProvider({ type: 'agent-channel' }))
    expect(JSON.stringify(redacted)).not.toContain('apiKey')
  })

  it('still requires model/key for the API providers (unchanged)', () => {
    expect(providerConfigured(withProvider({ type: 'anthropic' }))).toBe(false)
    expect(providerConfigured(withProvider({ type: 'anthropic', model: 'm', apiKey: 'k' }))).toBe(true)
    expect(providerConfigured(withProvider({ type: 'openai-compatible', model: 'm' }))).toBe(true)
    expect(providerConfigured(withProvider({ type: 'openai-compatible' }))).toBe(false)
    expect(providerConfigured(withProvider(null))).toBe(false)
  })
})
