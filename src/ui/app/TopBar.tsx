import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { DropdownMenu, ToggleGroup } from 'radix-ui'
import { useT } from '../i18n'
import { GearIcon, MoreIcon, SwapIcon } from '../icons'
import { useDirty, useDoc, type ViewMode } from './store'

interface TopBarProps {
  railOpen?: boolean
  onToggleRail?: () => void
  suggestionCount?: number
  onAcceptAll?: () => void
  onRejectAll?: () => void
  onToggleSettings?: () => void
  translation?: {
    label: string
    active: boolean
    loading: boolean
    disabled?: boolean
    disabledTitle?: string
    onToggle: () => void
  }
  agentWaiting?: boolean
  handbackPulse?: boolean
  roundCount?: number
  onToggleRounds?: () => void
}

interface OverflowItem {
  key: string
  label: string
  onClick: () => void
  icon?: ReactNode
  active?: boolean
  disabled?: boolean
  title?: string
}

export function TopBar({
  railOpen,
  onToggleRail,
  suggestionCount = 0,
  onAcceptAll,
  onRejectAll,
  onToggleSettings,
  translation,
  agentWaiting = false,
  handbackPulse = false,
  roundCount = 0,
  onToggleRounds,
}: TopBarProps) {
  const t = useT()
  const headerRef = useRef<HTMLElement | null>(null)
  const meta = useDoc((s) => s.meta)
  const mode = useDoc((s) => s.mode)
  const setMode = useDoc((s) => s.setMode)
  const save = useDoc((s) => s.save)
  const saving = useDoc((s) => s.saving)
  const savingKind = useDoc((s) => s.savingKind)
  const dirty = useDirty()

  const MODES: { id: ViewMode; label: string }[] = [
    { id: 'reading', label: t('reading') },
    { id: 'editing', label: t('editing') },
    { id: 'source', label: t('source') },
  ]

  // The bar never wraps (Phase E), so --topbar-h is effectively constant; keep
  // the observer so anchored overlays still self-correct if the font size changes.
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const apply = () => document.documentElement.style.setProperty('--topbar-h', `${el.offsetHeight}px`)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // translation / rounds / rail / settings live in one overflow menu so the bar
  // stays a single row at every width; each appears only when its handler exists.
  const overflow: OverflowItem[] = []
  if (translation) {
    overflow.push({
      key: 'lang',
      label: translation.loading ? t('translating') : translation.label,
      onClick: translation.onToggle,
      icon: <SwapIcon />,
      active: translation.active,
      disabled: translation.loading || translation.disabled,
      title: translation.disabled ? (translation.disabledTitle ?? t('toggleLang')) : t('toggleLang'),
    })
  }
  if (onToggleRounds) {
    overflow.push({ key: 'rounds', label: `${t('rounds')} ${roundCount}`, onClick: onToggleRounds, title: t('roundsTitle') })
  }
  if (onToggleRail) {
    overflow.push({
      key: 'rail',
      label: railOpen ? t('hideComments') : t('showComments'),
      onClick: onToggleRail,
      title: t('toggleRail'),
    })
  }
  if (onToggleSettings) {
    overflow.push({ key: 'settings', label: t('settings'), onClick: onToggleSettings, icon: <GearIcon width={14} height={14} /> })
  }

  return (
    <header className="topbar" ref={headerRef}>
      <div className="topbar-left">
        <span className="topbar-filename">{meta?.displayName ?? '…'}</span>
        <span className={`dirty-dot${dirty ? ' visible' : ''}`} title={dirty ? t('unsavedChanges') : t('saved')} />
        {agentWaiting && (
          <span className={`agent-chip${handbackPulse ? ' released' : ''}`} title={t('handBackTitle')}>
            <span className="agent-chip-dot" />
            {t('agentWaiting')}
          </span>
        )}
      </div>
      <ToggleGroup.Root
        className="seg"
        type="single"
        value={mode}
        onValueChange={(v) => v && setMode(v as ViewMode)}
        aria-label={t('viewMode')}
        title={`⌘E ${t('viewMode')}`}
      >
        {MODES.map((m) => (
          <ToggleGroup.Item key={m.id} value={m.id} className="seg-btn">
            {m.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
      <div className="topbar-right">
        {suggestionCount > 0 && (
          <div className="seg review-bulk" role="group" aria-label={`${suggestionCount} ${t('suggestionsLabel')}`}>
            <span className="bulk-count" title={`${suggestionCount} ${t('suggestionsLabel')}`}>
              {suggestionCount}
            </span>
            <button type="button" className="seg-btn bulk-accept" onClick={onAcceptAll} title={t('acceptAllTitle')}>
              {t('acceptAll')}
            </button>
            <button type="button" className="seg-btn bulk-reject" onClick={onRejectAll} title={t('rejectAllTitle')}>
              {t('rejectAll')}
            </button>
          </div>
        )}
        <button
          type="button"
          className="btn-ghost"
          onClick={() => void save()}
          disabled={!dirty || saving}
          title={`${t('save')} (⌘S)`}
        >
          {savingKind === 'save' ? t('saving') : dirty ? t('save') : t('saved')}
        </button>
        <button
          type="button"
          className="btn-cta"
          onClick={() => void useDoc.getState().handback()}
          disabled={saving}
          title={t('handBackTitle')}
        >
          {savingKind === 'handback' ? t('handingBack') : t('handBack')}
        </button>
        {overflow.length > 0 && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button type="button" className="btn-ghost topbar-more" aria-label={t('moreActions')} title={t('moreActions')}>
                <MoreIcon />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="topbar-more-menu" align="end" sideOffset={6}>
                {overflow.map((it) => (
                  <DropdownMenu.Item
                    key={it.key}
                    className={`more-item${it.active ? ' active' : ''}`}
                    disabled={it.disabled}
                    title={it.title}
                    onSelect={it.onClick}
                  >
                    {it.icon}
                    <span>{it.label}</span>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>
    </header>
  )
}
