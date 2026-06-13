import { useEffect } from 'react'
import { useConfig } from '../app/configStore'

const TOKENS_LINK_ID = 'theme-tokens'
const FONTS_STYLE_ID = 'theme-fonts'

/** Applies theme + per-user overrides to the document. Render once in App. */
export function ThemeEffects() {
  const config = useConfig((s) => s.config)
  const themes = useConfig((s) => s.themes)

  const themeId = config?.theme ?? 'grid'
  const theme = themes.find((t) => t.id === themeId) ?? themes[0]

  // tokens.css swap + data-theme attribute
  useEffect(() => {
    const id = theme?.id ?? themeId
    document.documentElement.dataset.theme = id
    let link = document.getElementById(TOKENS_LINK_ID) as HTMLLinkElement | null
    const href = `/themes/${id}/tokens.css`
    if (!link) {
      link = document.createElement('link')
      link.id = TOKENS_LINK_ID
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
    if (!link.href.endsWith(href)) link.href = href
  }, [theme?.id, themeId])

  // @font-face injection from the theme manifest
  useEffect(() => {
    if (!theme) return
    let style = document.getElementById(FONTS_STYLE_ID) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = FONTS_STYLE_ID
      document.head.appendChild(style)
    }
    style.textContent = theme.fonts
      .map(
        (f) =>
          `@font-face { font-family: '${f.family}'; src: url('${f.url}') format('woff2'); font-weight: ${f.weight}; font-display: swap; }`,
      )
      .join('\n')
  }, [theme])

  // user overrides ride on top of the theme's tokens
  useEffect(() => {
    if (!config) return
    const root = document.documentElement.style
    root.setProperty('--font-size-body', `${config.fontSize / 16}rem`)
    root.setProperty('--lh-body', String(config.lineHeight))
    root.setProperty('--content-max-width', `${config.contentWidth / 16}rem`)
  }, [config])

  return null
}

/** The optional film-grain overlay (SVG turbulence), per theme + user toggle. */
export function GrainOverlay() {
  const config = useConfig((s) => s.config)
  const themes = useConfig((s) => s.themes)
  const themeId = config?.theme ?? 'grid'
  const theme = themes.find((t) => t.id === themeId)

  const enabledByTheme = theme?.grain?.enabled ?? false
  const override = config?.grain[themeId]?.enabled
  const enabled = override ?? enabledByTheme
  if (!enabled) return null

  const opacity = theme?.grain?.opacity ?? 0.12
  return (
    <svg className="grain-overlay" style={{ opacity }} aria-hidden>
      <filter id="mm-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.74" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#mm-grain)" />
    </svg>
  )
}
