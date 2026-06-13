import { useState } from 'react'
import { useConfig, type ConfigPatch } from '../app/configStore'
import { Checkbox, ToggleGroup } from 'radix-ui'
import { SlideOver } from '../app/SlideOver'
import { SwapIcon, CheckIcon } from '../icons'
import { useT } from '../i18n'

/** Reading presets — discrete, self-illustrating (the glyph previews its effect). */
const FONT_OPTS = [
  { v: 14, a: 10 },
  { v: 16, a: 12.5 },
  { v: 18, a: 15 },
  { v: 20, a: 18 },
]
const LINE_OPTS = [
  { v: 1.45, gap: 2 },
  { v: 1.6, gap: 3.3 },
  { v: 1.8, gap: 4.6 },
]
const WIDTH_OPTS = [
  { v: 640, w: 6 },
  { v: 736, w: 9.5 },
  { v: 860, w: 13 },
]

function nearest(value: number, opts: number[]): number {
  return opts.reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a))
}

/** Stacked rules whose vertical gap previews the line height. */
function LineGapGlyph({ gap }: { gap: number }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden focusable={false}>
      {[8 - gap, 8, 8 + gap].map((y, i) => (
        <rect key={i} x={3} y={y - 0.6} width={10} height={1.2} rx={0.6} fill="currentColor" />
      ))}
    </svg>
  )
}

/** Centered rules whose width previews the content measure. */
function WidthGlyph({ w }: { w: number }) {
  const x = (16 - w) / 2
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden focusable={false}>
      {[5, 8, 11].map((y, i) => (
        <rect key={i} x={x} y={y - 0.6} width={w} height={1.2} rx={0.6} fill="currentColor" />
      ))}
    </svg>
  )
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const config = useConfig((s) => s.config)
  const themes = useConfig((s) => s.themes)
  const update = useConfig((s) => s.update)

  const t = useT()
  const [apiKey, setApiKey] = useState('')

  if (!config) return null

  const patch = (p: ConfigPatch): void => void update(p)

  const provider = config.provider
  const activeTheme = themes.find((t) => t.id === config.theme)

  return (
    <SlideOver title={t('settings')} onClose={onClose} ignoreSelector=".topbar-more">
      <div className="settings-body">
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
          <div className="settings-row is-toggle">
            <Checkbox.Root
              id="filmGrain"
              className="settings-check"
              checked={config.grain[config.theme]?.enabled ?? activeTheme.grain.enabled}
              onCheckedChange={(c) => patch({ grain: { ...config.grain, [config.theme]: { enabled: c === true } } })}
            >
              <Checkbox.Indicator>
                <CheckIcon width={11} height={11} />
              </Checkbox.Indicator>
            </Checkbox.Root>
            <label htmlFor="filmGrain">{t('filmGrain')}</label>
          </div>
        )}
      </section>

      <section>
        <h4>{t('readingSection')}</h4>
        <div className="settings-row">
          <span>
            {t('fontSize')} <span className="settings-val">{config.fontSize}px</span>
          </span>
          <ToggleGroup.Root
            className="seg preset-seg"
            type="single"
            value={String(nearest(config.fontSize, FONT_OPTS.map((o) => o.v)))}
            onValueChange={(v) => v && patch({ fontSize: Number(v) })}
            aria-label={t('fontSize')}
          >
            {FONT_OPTS.map((o) => (
              <ToggleGroup.Item key={o.v} value={String(o.v)} className="seg-btn" aria-label={`${o.v}px`}>
                <span className="preset-A" style={{ fontSize: `${o.a}px` }}>
                  A
                </span>
              </ToggleGroup.Item>
            ))}
          </ToggleGroup.Root>
        </div>
        <div className="settings-row">
          <span>
            {t('lineHeight')} <span className="settings-val">{config.lineHeight.toFixed(2)}</span>
          </span>
          <ToggleGroup.Root
            className="seg preset-seg"
            type="single"
            value={String(nearest(config.lineHeight, LINE_OPTS.map((o) => o.v)))}
            onValueChange={(v) => v && patch({ lineHeight: Number(v) })}
            aria-label={t('lineHeight')}
          >
            {LINE_OPTS.map((o) => (
              <ToggleGroup.Item key={o.v} value={String(o.v)} className="seg-btn" aria-label={o.v.toFixed(2)}>
                <LineGapGlyph gap={o.gap} />
              </ToggleGroup.Item>
            ))}
          </ToggleGroup.Root>
        </div>
        <div className="settings-row">
          <span>
            {t('contentWidth')} <span className="settings-val">{config.contentWidth}px</span>
          </span>
          <ToggleGroup.Root
            className="seg preset-seg"
            type="single"
            value={String(nearest(config.contentWidth, WIDTH_OPTS.map((o) => o.v)))}
            onValueChange={(v) => v && patch({ contentWidth: Number(v) })}
            aria-label={t('contentWidth')}
          >
            {WIDTH_OPTS.map((o) => (
              <ToggleGroup.Item key={o.v} value={String(o.v)} className="seg-btn" aria-label={`${o.v}px`}>
                <WidthGlyph w={o.w} />
              </ToggleGroup.Item>
            ))}
          </ToggleGroup.Root>
        </div>
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
            <SwapIcon />
            <input
              type="text"
              className="settings-input narrow"
              defaultValue={config.langPair.b}
              onBlur={(e) => patch({ langPair: { ...config.langPair, b: e.target.value.trim() || 'zh-CN' } })}
            />
          </span>
        </label>
        <div className="settings-row is-toggle">
          <Checkbox.Root
            id="keepOriginal"
            className="settings-check"
            checked={config.keepOriginalFeedback}
            onCheckedChange={(c) => patch({ keepOriginalFeedback: c === true })}
          >
            <Checkbox.Indicator>
              <CheckIcon width={11} height={11} />
            </Checkbox.Indicator>
          </Checkbox.Root>
          <label htmlFor="keepOriginal">{t('keepOriginal')}</label>
        </div>
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
    </SlideOver>
  )
}
