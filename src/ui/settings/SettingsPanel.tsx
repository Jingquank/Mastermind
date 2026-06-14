import { useConfig, type ConfigPatch } from '../app/configStore'
import { ToggleGroup } from 'radix-ui'
import { SlideOver } from '../app/SlideOver'
import { SwapIcon } from '../icons'
import { LangSelect } from './LangSelect'
import { useT, type MsgKey } from '../i18n'
import { TYPE_SETS, MONO_FONTS, displayStack, monoStack } from '../theme/fonts'
import { CODE_THEMES, type CodeTheme } from '../theme/codeThemes'
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

/** Three code-token bars previewing a color scheme on the active appearance. */
function CodeSwatch({ theme, appearance }: { theme: CodeTheme; appearance: 'light' | 'dark' }) {
  const pal = theme.palettes?.[appearance]
  const cols = pal
    ? [pal.keyword, pal.function, pal.string]
    : ['var(--color-text-faint)', 'var(--color-text-muted)', 'var(--color-text-faint)']
  const widths = [10, 7, 9]
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden focusable={false} style={{ flex: 'none' }}>
      {cols.map((c, i) => (
        <rect key={i} x={2} y={3 + i * 3} width={widths[i]} height={1.6} rx={0.8} fill={c} />
      ))}
    </svg>
  )
}

/** A tiny page-tile previewing a theme: its bg, two ink lines, an accent dot. */
function ThemeSwatch({ s }: { s: { bg: string; ink: string; accent: string } | null }) {
  if (!s) return null
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden focusable={false} style={{ flex: 'none' }}>
      <rect x={1} y={1} width={14} height={14} rx={2.5} fill={s.bg} stroke="rgba(128,128,128,0.35)" strokeWidth={1} />
      <rect x={4} y={5} width={5} height={1.4} rx={0.7} fill={s.ink} />
      <rect x={4} y={8.5} width={8} height={1.2} rx={0.6} fill={s.ink} opacity={0.55} />
      <circle cx={11.5} cy={5.7} r={1.6} fill={s.accent} />
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
    <SlideOver title={t('settings')} onClose={onClose} ignoreSelector=".floating-settings">
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
                  className={`theme-chip code-chip${config.theme === th.id ? ' active' : ''}`}
                  aria-pressed={config.theme === th.id}
                  onClick={() => patch({ theme: th.id })}
                >
                  <ThemeSwatch s={th.swatch} />
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
                    <span>
                      {t('filmGrain')} <span className="settings-val">{t(INTENSITY_LABEL[intensity])}</span>
                    </span>
                    <ToggleGroup.Root
                      className="seg preset-seg"
                      type="single"
                      value={intensity}
                      onValueChange={(v) => v && setGrain({ intensity: v as GrainIntensity })}
                      aria-label={t('filmGrain')}
                    >
                      {INTENSITY_STEPS.map((step) => (
                        <ToggleGroup.Item
                          key={step}
                          value={step}
                          className="seg-btn"
                          aria-label={t(INTENSITY_LABEL[step])}
                          title={t(INTENSITY_LABEL[step])}
                        >
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
                      <span>
                        {t('grainTexture')} <span className="settings-val">{t(TEXTURE_LABEL[texture])}</span>
                      </span>
                      <ToggleGroup.Root
                        className="seg preset-seg"
                        type="single"
                        value={texture}
                        onValueChange={(v) => v && setGrain({ texture: v as GrainTexture })}
                        aria-label={t('grainTexture')}
                      >
                        {TEXTURE_STEPS.map((tex) => (
                          <ToggleGroup.Item
                            key={tex}
                            value={tex}
                            className="seg-btn"
                            aria-label={t(TEXTURE_LABEL[tex])}
                            title={t(TEXTURE_LABEL[tex])}
                          >
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
            <span>{t('codeColor')}</span>
            <div className="settings-theme-row">
              {CODE_THEMES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`theme-chip code-chip${config.codeTheme === c.id ? ' active' : ''}`}
                  aria-pressed={config.codeTheme === c.id}
                  onClick={() => patch({ codeTheme: c.id })}
                >
                  <CodeSwatch theme={c} appearance={activeTheme?.appearance ?? 'light'} />
                  {c.id === 'none' ? t('codeColorNone') : c.name}
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
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              maxLength={32}
              title={t('authorTagHint')}
              onBlur={(e) => {
                const v = e.target.value.trim().replace(/^@/, '')
                if (v && v !== config.authorTag) patch({ authorTag: v })
              }}
            />
          </label>
          <div className="settings-row">
            <span>{t('uiLanguage')}</span>
            {/* A small fixed option set → the same chip vocabulary as Theme/Typeface
                above; the open-ended Reading pair below stays a searchable picker. */}
            <div className="settings-theme-row">
              {(['en', 'zh-CN'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  className={`theme-chip${config.uiLang === code ? ' active' : ''}`}
                  aria-pressed={config.uiLang === code}
                  onClick={() => patch({ uiLang: code })}
                >
                  {code === 'en' ? 'English' : '简体中文'}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <span>{t('readingPair')}</span>
            <div className="settings-langpair">
              <LangSelect
                label={`${t('readingPair')} 1`}
                value={config.langPair.a}
                onChange={(a) => patch({ langPair: { ...config.langPair, a } })}
              />
              <button
                type="button"
                className="btn-ghost settings-langswap"
                aria-label={t('swapLangs')}
                onClick={() => patch({ langPair: { a: config.langPair.b, b: config.langPair.a } })}
              >
                <SwapIcon />
              </button>
              <LangSelect
                label={`${t('readingPair')} 2`}
                value={config.langPair.b}
                onChange={(b) => patch({ langPair: { ...config.langPair, b } })}
              />
            </div>
          </div>
        </section>
      </div>
    </SlideOver>
  )
}
