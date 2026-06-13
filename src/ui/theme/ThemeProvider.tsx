import { useEffect } from 'react'
import { useConfig } from '../app/configStore'
import { FONT_FACES, bodyStack, displayStack, monoById, monoStack, typeSetById } from './fonts'
import { INTENSITY_SCALE, TEXTURES, resolveGrain } from './grain'

const TOKENS_LINK_ID = 'theme-tokens'
const FONTS_STYLE_ID = 'theme-fonts'

/** Applies theme + per-user overrides to the document. Render once in App. */
export function ThemeEffects() {
  const config = useConfig((s) => s.config)
  const themes = useConfig((s) => s.themes)

  const themeId = config?.theme ?? 'grid'
  const theme = themes.find((t) => t.id === themeId) ?? themes[0]

  // tokens.css swap + data-theme attribute, with a crossfade veil that hides the
  // brief flash while the new tokens.css <link> parses (the old sheet lingers).
  useEffect(() => {
    const id = theme?.id ?? themeId
    const root = document.documentElement
    const prev = root.dataset.theme
    const href = `/themes/${id}/tokens.css`
    let link = document.getElementById(TOKENS_LINK_ID) as HTMLLinkElement | null
    const firstLoad = !link
    if (!link) {
      link = document.createElement('link')
      link.id = TOKENS_LINK_ID
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
    if (prev === id && link.href.endsWith(href)) return // unchanged

    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
    let veil: HTMLDivElement | null = null
    if (!firstLoad && prev && prev !== id && !reduce) {
      veil = document.createElement('div')
      veil.className = 'theme-veil'
      veil.style.background = getComputedStyle(document.body).backgroundColor // the OLD theme's bg
      document.body.appendChild(veil)
    }
    root.dataset.theme = id

    let settled = false
    const reveal = (): void => {
      if (settled) return
      settled = true
      if (!veil) return
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!veil) return
          veil.style.opacity = '0'
          setTimeout(() => veil?.remove(), 360)
        }),
      )
    }
    link.onload = reveal
    if (!link.href.endsWith(href)) link.href = href
    else reveal()
    if (veil) setTimeout(reveal, 220) // fallback if onload doesn't fire (cached sheet)
  }, [theme?.id, themeId])

  // @font-face injection — app-level registry (font choice is cross-theme), once on mount.
  // Browsers only fetch a family when text renders in it, so declaring all sets is cheap.
  useEffect(() => {
    let style = document.getElementById(FONTS_STYLE_ID) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = FONTS_STYLE_ID
      document.head.appendChild(style)
    }
    style.textContent = FONT_FACES.map(
      (f) =>
        `@font-face { font-family: '${f.family}'; src: url('${f.url}') format('woff2'); font-weight: ${f.weight}; font-display: swap; }`,
    ).join('\n')
  }, [])

  // user overrides ride on top of the theme's tokens
  useEffect(() => {
    if (!config) return
    const root = document.documentElement.style
    root.setProperty('--font-size-body', `${config.fontSize / 16}rem`)
    root.setProperty('--lh-body', String(config.lineHeight))
    root.setProperty('--content-max-width', `${config.contentWidth / 16}rem`)

    // typeface selection → display/body/mono tokens (+ per-set display weight & tracking)
    const set = typeSetById(config.typeSet)
    root.setProperty('--font-display', displayStack(set))
    root.setProperty('--font-body', bodyStack(set))
    root.setProperty('--weight-bold', String(set.displayWeight))
    root.setProperty('--ls-heading', set.displayTracking)
    root.setProperty('--font-mono', monoStack(monoById(config.monoFont)))
  }, [config])

  return null
}

/** The optional film-grain overlay (SVG turbulence), per theme + user toggle. */
export function GrainOverlay() {
  const config = useConfig((s) => s.config)
  const themes = useConfig((s) => s.themes)
  const themeId = config?.theme ?? 'grid'
  const theme = themes.find((t) => t.id === themeId)

  const { intensity, texture } = resolveGrain(theme, config?.grain[themeId])
  if (intensity === 'off') return null

  const baseOpacity = theme?.grain?.opacity ?? 0.12
  const opacity = baseOpacity * INTENSITY_SCALE[intensity]
  const tx = TEXTURES[texture]
  return (
    <svg className="grain-overlay" style={{ opacity }} aria-hidden>
      <filter id="mm-grain">
        <feTurbulence type={tx.type} baseFrequency={tx.baseFrequency} numOctaves={tx.numOctaves} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#mm-grain)" />
    </svg>
  )
}
