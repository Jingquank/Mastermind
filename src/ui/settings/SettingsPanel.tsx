import { useEffect, useRef, useState } from 'react'
import { useConfig, type ConfigPatch } from '../app/configStore'

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const config = useConfig((s) => s.config)
  const themes = useConfig((s) => s.themes)
  const update = useConfig((s) => s.update)

  const [apiKey, setApiKey] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!config) return null

  const patch = (p: ConfigPatch): void => void update(p)
  const patchDebounced = (p: ConfigPatch): void => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void update(p), 300)
  }

  const provider = config.provider
  const activeTheme = themes.find((t) => t.id === config.theme)

  return (
    <div className="settings-panel">
      <div className="settings-head">
        <span className="settings-title">Settings</span>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <section>
        <h4>Theme</h4>
        <div className="settings-theme-row">
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`theme-chip${config.theme === t.id ? ' active' : ''}`}
              onClick={() => patch({ theme: t.id })}
            >
              {t.name}
            </button>
          ))}
        </div>
        {activeTheme?.grain && (
          <label className="settings-row">
            <input
              type="checkbox"
              checked={config.grain[config.theme]?.enabled ?? activeTheme.grain.enabled}
              onChange={(e) =>
                patch({ grain: { ...config.grain, [config.theme]: { enabled: e.target.checked } } })
              }
            />
            Film grain
          </label>
        )}
      </section>

      <section>
        <h4>Reading</h4>
        <label className="settings-row">
          Font size <span className="settings-val">{config.fontSize}px</span>
          <input
            type="range"
            min={14}
            max={20}
            step={1}
            defaultValue={config.fontSize}
            onChange={(e) => patchDebounced({ fontSize: Number(e.target.value) })}
          />
        </label>
        <label className="settings-row">
          Line height <span className="settings-val">{config.lineHeight.toFixed(2)}</span>
          <input
            type="range"
            min={1.4}
            max={1.9}
            step={0.05}
            defaultValue={config.lineHeight}
            onChange={(e) => patchDebounced({ lineHeight: Number(e.target.value) })}
          />
        </label>
        <label className="settings-row">
          Content width <span className="settings-val">{config.contentWidth}px</span>
          <input
            type="range"
            min={600}
            max={920}
            step={8}
            defaultValue={config.contentWidth}
            onChange={(e) => patchDebounced({ contentWidth: Number(e.target.value) })}
          />
        </label>
      </section>

      <section>
        <h4>Review</h4>
        <label className="settings-row">
          Author tag
          <input
            type="text"
            className="settings-input"
            defaultValue={config.authorTag}
            onBlur={(e) => {
              const v = e.target.value.trim().replace(/^@/, '')
              if (v && v !== config.authorTag) patch({ authorTag: v })
            }}
          />
        </label>
      </section>

      <section>
        <h4>Languages</h4>
        <label className="settings-row">
          UI language
          <select
            className="settings-input"
            value={config.uiLang}
            onChange={(e) => patch({ uiLang: e.target.value as 'en' | 'zh-CN' })}
          >
            <option value="en">English</option>
            <option value="zh-CN">简体中文</option>
          </select>
        </label>
        <label className="settings-row">
          Reading pair
          <span className="settings-pair">
            <input
              type="text"
              className="settings-input narrow"
              defaultValue={config.langPair.a}
              onBlur={(e) => patch({ langPair: { ...config.langPair, a: e.target.value.trim() || 'en' } })}
            />
            ⇄
            <input
              type="text"
              className="settings-input narrow"
              defaultValue={config.langPair.b}
              onBlur={(e) => patch({ langPair: { ...config.langPair, b: e.target.value.trim() || 'zh-CN' } })}
            />
          </span>
        </label>
        <label className="settings-row">
          <input
            type="checkbox"
            checked={config.keepOriginalFeedback}
            onChange={(e) => patch({ keepOriginalFeedback: e.target.checked })}
          />
          Keep original text alongside translated comments
        </label>
      </section>

      <section>
        <h4>Translation provider</h4>
        <label className="settings-row">
          Type
          <select
            className="settings-input"
            value={provider?.type ?? 'none'}
            onChange={(e) => {
              const v = e.target.value
              if (v === 'none') patch({ provider: null })
              else patch({ provider: { type: v as 'anthropic' | 'openai-compatible', baseUrl: provider?.baseUrl, model: provider?.model } })
            }}
          >
            <option value="none">Not configured</option>
            <option value="anthropic">Anthropic API</option>
            <option value="openai-compatible">OpenAI-compatible (Ollama, LM Studio…)</option>
          </select>
        </label>
        {provider && (
          <>
            {provider.type === 'openai-compatible' && (
              <label className="settings-row">
                Base URL
                <input
                  type="text"
                  className="settings-input"
                  placeholder="http://localhost:11434/v1"
                  defaultValue={provider.baseUrl ?? ''}
                  onBlur={(e) => patch({ provider: { ...provider, baseUrl: e.target.value.trim() } })}
                />
              </label>
            )}
            <label className="settings-row">
              Model
              <input
                type="text"
                className="settings-input"
                placeholder={provider.type === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'qwen3:8b'}
                defaultValue={provider.model ?? ''}
                onBlur={(e) => patch({ provider: { ...provider, model: e.target.value.trim() } })}
              />
            </label>
            <label className="settings-row">
              API key {provider.configured && <span className="settings-val">saved ✓</span>}
              <span className="settings-pair">
                <input
                  type="password"
                  className="settings-input"
                  placeholder={provider.configured ? '••••••••' : 'sk-…'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={!apiKey.trim()}
                  onClick={() => {
                    patch({ provider: { ...provider, apiKey: apiKey.trim() } })
                    setApiKey('')
                  }}
                >
                  Save key
                </button>
              </span>
            </label>
          </>
        )}
      </section>
    </div>
  )
}
