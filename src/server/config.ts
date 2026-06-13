import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_AUTHOR_TAG } from '../shared/constants'
import type { ClientConfig, MastermindConfig, ProviderConfig } from '../shared/types'
import { configFilePath, ensureConfigDir } from './paths'

export const DEFAULT_CONFIG: MastermindConfig = {
  version: 1,
  theme: 'grid',
  fontSize: 16,
  lineHeight: 1.6,
  contentWidth: 736,
  authorTag: DEFAULT_AUTHOR_TAG,
  uiLang: 'en',
  langPair: { a: 'en', b: 'zh-CN' },
  keepOriginalFeedback: false,
  grain: {},
  provider: null,
}

export function readConfig(): MastermindConfig {
  try {
    const raw = fs.readFileSync(configFilePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<MastermindConfig>
    return { ...DEFAULT_CONFIG, ...parsed, version: 1 }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

function persist(config: MastermindConfig): void {
  const dir = ensureConfigDir()
  const tmp = path.join(dir, `.config.json.${process.pid}.tmp`)
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2))
  fs.renameSync(tmp, configFilePath())
  if (config.provider?.apiKey) {
    try {
      fs.chmodSync(configFilePath(), 0o600)
    } catch {
      /* best effort */
    }
  }
}

export interface ConfigPatch extends Partial<Omit<MastermindConfig, 'provider' | 'version'>> {
  /** null clears; apiKey omitted keeps the stored key. */
  provider?: (Omit<ProviderConfig, 'apiKey'> & { apiKey?: string }) | null
}

export function updateConfig(patch: ConfigPatch): MastermindConfig {
  const current = readConfig()
  const next: MastermindConfig = { ...current, ...patch, version: 1, provider: current.provider }
  if ('provider' in patch) {
    if (patch.provider === null) {
      next.provider = null
    } else if (patch.provider) {
      next.provider = {
        ...patch.provider,
        apiKey: patch.provider.apiKey ?? current.provider?.apiKey,
      }
    }
  }
  persist(next)
  return next
}

export function redactConfig(config: MastermindConfig): ClientConfig {
  const { provider, ...rest } = config
  // agent-channel needs no key/model; openai-compatible (Ollama, LM Studio) works keyless
  const configured = Boolean(
    provider &&
      (provider.type === 'agent-channel' ||
        (provider.model && (provider.type === 'openai-compatible' || provider.apiKey))),
  )
  return {
    ...rest,
    provider: provider
      ? { type: provider.type, baseUrl: provider.baseUrl, model: provider.model, configured }
      : null,
  }
}
