import { useConfig, type ConfigPatch } from '../app/configStore'
import { ToggleGroup } from 'radix-ui'
import { SlideOver } from '../app/SlideOver'
import { SwapIcon } from '../icons'
import { useT, type MsgKey } from '../i18n'
import { TYPE_SETS, MONO_FONTS, displayStack, monoStack } from '../theme/fonts'
import { GrainOffGlyph, GrainSwatch, INTENSITY_STEPS, TEXTURE_STEPS, resolveGrain } from '../theme/grain'
import type { GrainIntensity, GrainTexture } from '../../shared/types'

/** Cosmetic opacity for the intensity swatches — louder than the live overlay so the icon reads. */
const INTENSITY_PREVIEW: Record<Exclude<GrainIntensity, 'off'>, number> = { low: 0.4, medium: 0.7, high: 1 }
const INTENSITY_LABEL: Record<GrainIntensity, MsgKey> = {
  off: 'grainOff',
  low: 'grainLow',
  medium: 'grainMedium',
  high: 'grainHigh',
}
const TEXTURE_LABEL: Record<GrainTexture, MsgKey> = {
  fine: 'textureFine',
  soft: 'textureSoft',
  coarse: 'textureCoarse',
}

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

  if (!config) return null

  const patch = (p: ConfigPatch): void => void update(p)
  const activeTheme = themes.find((th) => th.id === config.theme)

  return (
    <SlideOver title={t('settings')} onClose={onClose} ignoreSelector=".topbar-settings">
      <div className="settings-body">
        {/* ---------- Appearance ---------- */}
        <section>
          <h4>{t('appearanceSection')}</h4>
          <div className="settings-row">
            <span>{t('theme')}</span>
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
          </div>
          {activeTheme?.grain &&
            (() => {
              const override = config.grain[config.theme]
              const { intensity, texture } = resolveGrain(activeTheme, override)
              const setGrain = (p: Partial<{ intensity: GrainIntensity; texture: GrainTexture }>) =>
                patch({ grain: { ...config.grain, [config.theme]: { ...override, ...p } } })
              return (
                <>
                  <div className="settings-row">
                    <span>{t('filmGrain')}</span>
                    <ToggleGroup.Root
                      className="seg preset-seg"
                      type="single"
                      value={intensity}
                      onValueChange={(v) => v && setGrain({ intensity: v as GrainIntensity })}
                      aria-label={t('filmGrain')}
                    >
                      {INTENSITY_STEPS.map((step) => (
                        <ToggleGroup.Item key={step} value={step} className="seg-btn" aria-label={t(INTENSITY_LABEL[step])}>
                          {step === 'off' ? (
                            <GrainOffGlyph />
                          ) : (
                            <GrainSwatch id={`grain-int-${step}`} texture={texture} opacity={INTENSITY_PREVIEW[step]} />
                          )}
                        </ToggleGroup.Item>
                      ))}
                    </ToggleGroup.Root>
                  </div>
                  {intensity !== 'off' && (
                    <div className="settings-row">
                      <span>{t('grainTexture')}</span>
                      <ToggleGroup.Root
                        className="seg preset-seg"
                        type="single"
                        value={texture}
                        onValueChange={(v) => v && setGrain({ texture: v as GrainTexture })}
                        aria-label={t('grainTexture')}
                      >
                        {TEXTURE_STEPS.map((tex) => (
                          <ToggleGroup.Item key={tex} value={tex} className="seg-btn" aria-label={t(TEXTURE_LABEL[tex])}>
                            <GrainSwatch id={`grain-tex-${tex}`} texture={tex} opacity={0.7} />
                          </ToggleGroup.Item>
                        ))}
                      </ToggleGroup.Root>
                    </div>
                  )}
                </>
              )
            })()}
        </section>

        {/* ---------- Reading ---------- */}
        <section>
          <h4>{t('readingSection')}</h4>
          <div className="settings-row">
            <span>{t('typeface')}</span>
            <div className="settings-theme-row">
              {TYPE_SETS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`theme-chip${config.typeSet === s.id ? ' active' : ''}`}
                  aria-pressed={config.typeSet === s.id}
                  style={{ fontFamily: displayStack(s) }}
                  onClick={() => patch({ typeSet: s.id })}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <span>{t('codeFont')}</span>
            <div className="settings-theme-row">
              {MONO_FONTS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`theme-chip${config.monoFont === m.id ? ' active' : ''}`}
                  aria-pressed={config.monoFont === m.id}
                  style={{ fontFamily: monoStack(m) }}
                  onClick={() => patch({ monoFont: m.id })}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>
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

        {/* ---------- Review & language ---------- */}
        <section>
          <h4>{t('reviewLangSection')}</h4>
          <label className="settings-row">
            <span>{t('authorTag')}</span>
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
          <label className="settings-row">
            <span>{t('uiLanguage')}</span>
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
            <span>{t('readingPair')}</span>
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
        </section>
      </div>
    </SlideOver>
  )
}
