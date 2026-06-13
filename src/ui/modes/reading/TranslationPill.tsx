import { useT } from '../../i18n'
import { SwapIcon } from '../../icons'

interface TranslationPillProps {
  /** Text shown on the pill — target language, or "Original" when translated. */
  label: string
  /** Translation is currently showing (toggles back to the original). */
  active: boolean
  /** A translation request is in flight. */
  loading: boolean
  /** Toggle is unavailable (e.g. the agent channel isn't listening yet). */
  disabled?: boolean
  disabledTitle?: string
  onToggle: () => void
}

/**
 * Sticky control in the reading view that flips the document between its original
 * text and a translated preview. Lives next to the content it transforms rather
 * than in the topbar, and only renders in reading mode with a provider configured.
 */
export function TranslationPill({ label, active, loading, disabled, disabledTitle, onToggle }: TranslationPillProps) {
  const t = useT()
  return (
    <div className="translation-pill-anchor">
      <button
        type="button"
        className={`translation-pill${active ? ' active' : ''}`}
        onClick={onToggle}
        disabled={disabled || loading}
        aria-pressed={active}
        title={disabled ? (disabledTitle ?? t('toggleLang')) : t('toggleLang')}
      >
        <SwapIcon />
        <span>{loading ? t('translating') : label}</span>
      </button>
    </div>
  )
}
