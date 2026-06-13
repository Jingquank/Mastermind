import { useEffect, useRef, useState } from 'react'
import { useConfig, type ConfigPatch } from '../app/configStore'
import { useT } from '../i18n'

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const config = useConfig((s) => s.config)
  const themes = useConfig((s) => s.themes)
  const update = useConfig((s) => s.update)

  const t = useT()
  const [apiKey, setApiKey] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    // popover idiom: clicking anywhere outside dismisses
    const onPointerDown = (e: MouseEvent): void => {
      const target = e.target as HTMLElement
      if (panelRef.current && !panelRef.current.contains(target) && !target.closest('.settings-gear')) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointerDown)
    }
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
    <div className="settings-panel" ref={panelRef}>
      <div className="settings-head">
        <span className="settings-title">{t('settings')}</span>
        <button type="button" className="btn-ghost" onClick={onClose}>
          {t('close')}
        </button>
      </div>

      <section>
        <h4>{t('theme')}</h4>
        <div className="settings-theme-row">
          {themes.map((th) => (
            <button
              key={th.id}
              type="button"
              className={`theme-chip${config.theme === th.id ? ' active' : ''}`}
              aria-pressed={config.theme === th.id}
              onClick={() => patch({ theme: th.id })}
            >
              {th.name}
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
            {t('filmGrain')}
          </label>
        )}
      </section>

      <section>
        <h4>{t('readingSection')}</h4>
        <label className="settings-row">
          {t('fontSize')} <span className="settings-val">{config.fontSize}px</span>
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
          {t('lineHeight')} <span className="settings-val">{config.lineHeight.toFixed(2)}</span>
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
          {t('contentWidth')} <span className="settings-val">{config.contentWidth}px</span>
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
        <h4>{t('reviewSection')}</h4>
        <label className="settings-row">
          {t('authorTag')}
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
        <h4>{t('languagesSection')}</h4>
        <label className="settings-row">
          {t('uiLanguage')}
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
          {t('readingPair')}
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
          {t('keepOriginal')}
        </label>
      </section>

      <section>
        <h4>{t('providerSection')}</h4>
        <label className="settings-row">
          {t('providerType')}
          <select
            className="settings-input"
            value={provider?.type ?? 'none'}
            onChange={(e) => {
              const v = e.target.value
              if (v === 'none') patch({ provider: null })
              else if (v === 'agent-channel') patch({ provider: { type: 'agent-channel' } })
              else patch({ provider: { type: v as 'anthropic' | 'openai-compatible', baseUrl: provider?.baseUrl, model: provider?.model } })
            }}
          >
            <option value="none">{t('providerNone')}</option>
            <option value="agent-channel">{t('providerAgent')}</option>
            <option value="anthropic">{t('providerAnthropic')}</option>
            <option value="openai-compatible">{t('providerOpenai')}</option>
          </select>
        </label>
        {provider?.type === 'agent-channel' && <p className="settings-hint">{t('providerAgentHint')}</p>}
        {provider && provider.type !== 'agent-channel' && (
          <>
            {provider.type === 'openai-compatible' && (
              <label className="settings-row">
                {t('baseUrl')}
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
              {t('model')}
              <input
                type="text"
                className="settings-input"
                placeholder={provider.type === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'qwen3:8b'}
                defaultValue={provider.model ?? ''}
                onBlur={(e) => patch({ provider: { ...provider, model: e.target.value.trim() } })}
              />
            </label>
            <label className="settings-row">
              {t('apiKey')} {provider.configured && <span className="settings-val">{t('keySaved')}</span>}
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
                  {t('saveKey')}
                </button>
              </span>
            </label>
          </>
        )}
      </section>
    </div>
  )
}
