import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_AUTHOR_TAG } from '../shared/constants'
import type { ClientConfig, MastermindConfig } from '../shared/types'
import { configFilePath, ensureConfigDir } from './paths'

export const DEFAULT_CONFIG: MastermindConfig = {
  version: 1,
  theme: 'grid',
  fontSize: 16,
  lineHeight: 1.6,
  contentWidth: 736,
  authorTag: DEFAULT_AUTHOR_TAG,
  typeSet: 'grid',
  monoFont: 'geist',
  uiLang: 'en',
  langPair: { a: 'en', b: 'zh-CN' },
  grain: {},
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
}

export type ConfigPatch = Partial<Omit<MastermindConfig, 'version'>>

export function updateConfig(patch: ConfigPatch): MastermindConfig {
  const next: MastermindConfig = { ...readConfig(), ...patch, version: 1 }
  persist(next)
  return next
}

/** The browser sees the whole config — there are no secrets to redact. */
export function redactConfig(config: MastermindConfig): ClientConfig {
  return config
}
