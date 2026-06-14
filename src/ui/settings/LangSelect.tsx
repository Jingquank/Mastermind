import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDownIcon } from '../icons'
import { useT } from '../i18n'
import { langLabel, searchLanguages, type Language } from '../../shared/languages'

interface Props {
  value: string
  onChange: (next: string) => void
  /** Accessible name for the field (e.g. "First reading language"). */
  label: string
}

const norm = (s: string): string => s.trim().toLowerCase()

/** Menu sizing: the height it wants, and the floor it won't shrink below. */
const MENU_DESIRED = 300
const MENU_MIN = 168
const VIEWPORT_MARGIN = 8
const TRIGGER_GAP = 6

interface MenuPos {
  width: number
  maxHeight: number
  left?: number
  right?: number
  top?: number
  bottom?: number
}

/**
 * A searchable language picker: a trigger showing the current language, and a
 * dropdown (search box + filtered list) that opens against it. Any typed text
 * that doesn't match the curated list commits as a custom language — the agent
 * translates anything, so the list is a shortcut, not a fence.
 *
 * The menu is `position: fixed` so it escapes the settings SlideOver's
 * `overflow: auto` clipping. It flies out as a ribbon to the *left* of the
 * SlideOver panel rather than stacking on the trigger — that way the list
 * never overlays the panel's own fields and always has the full viewport
 * height to grow into (the old below-the-trigger menu got clipped near the
 * panel's bottom edge). On viewports too narrow to fit the ribbon beside the
 * panel it falls back to the classic flip-above/below placement. It stays a
 * DOM child of the field — not portaled — so the SlideOver's outside-click /
 * Escape containment checks keep treating menu interactions as "inside".
 */
export function LangSelect({ value, onChange, label }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [pos, setPos] = useState<MenuPos | null>(null)
  const listId = useId()

  const current = langLabel(value)
  const matches = searchLanguages(query)
  const typed = query.trim()
  const hasExact = matches.some(
    (l) => norm(l.name) === norm(typed) || norm(l.native) === norm(typed) || norm(l.code) === norm(typed),
  )
  const showCustom = typed !== '' && !hasExact
  // The flat option set the keyboard cursor walks: list rows, then the custom row.
  const optionCount = matches.length + (showCustom ? 1 : 0)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Anchor the fixed menu to the trigger, flipping up when there's more room
  // above. Recomputes while the panel scrolls/resizes so it stays attached.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const place = (): void => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const width = r.width
      // Anchor the ribbon to the panel's left edge (fall back to the trigger if
      // the panel can't be found) so it sits beside the whole SlideOver, not
      // just this field.
      const panel = el.closest('.slide-over')?.getBoundingClientRect()
      const anchorLeft = panel ? panel.left : r.left

      // Enough room to the left of the panel to fit the ribbon? If so, fly out
      // there and grow toward whichever vertical direction has more space,
      // staying aligned to the trigger row.
      if (anchorLeft - TRIGGER_GAP - width >= VIEWPORT_MARGIN) {
        const spaceUp = r.bottom - VIEWPORT_MARGIN
        const spaceDown = window.innerHeight - r.top - VIEWPORT_MARGIN
        const growUp = spaceUp >= spaceDown
        const maxHeight = Math.min(MENU_DESIRED, growUp ? spaceUp : spaceDown)
        const right = window.innerWidth - anchorLeft + TRIGGER_GAP
        setPos(
          growUp
            ? { right, width, bottom: window.innerHeight - r.bottom, maxHeight }
            : { right, width, top: r.top, maxHeight },
        )
        return
      }

      // Narrow viewport: no room beside the panel — fall back to the classic
      // flip-above/below-the-trigger placement.
      const below = window.innerHeight - r.bottom - VIEWPORT_MARGIN
      const above = r.top - VIEWPORT_MARGIN
      const flipUp = below < Math.min(MENU_DESIRED, MENU_MIN) && above > below
      const maxHeight = Math.max(MENU_MIN, Math.min(MENU_DESIRED, flipUp ? above : below))
      setPos(
        flipUp
          ? { left: r.left, width, bottom: window.innerHeight - r.top + TRIGGER_GAP, maxHeight }
          : { left: r.left, width, top: r.bottom + TRIGGER_GAP, maxHeight },
      )
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  function commit(next: string): void {
    const v = next.trim()
    if (v) onChange(v)
    setOpen(false)
    setQuery('')
  }

  function openMenu(): void {
    setQuery('')
    setActive(0)
    setOpen(true)
  }

  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.stopPropagation() // don't let the SlideOver's Escape close the whole panel
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, optionCount - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = matches[active]
      if (pick) commit(pick.name)
      else if (showCustom) commit(typed)
    }
  }

  return (
    <div className="lang-select" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="settings-input lang-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <span className="lang-trigger-text">
          {!current.custom && current.native && current.native !== current.name && (
            <span className="lang-native">{current.native}</span>
          )}
          <span className="lang-name">{current.name}</span>
          {current.custom && <span className="lang-custom-tag">{t('langCustomTag')}</span>}
        </span>
        <ChevronDownIcon className="lang-chevron" />
      </button>

      {open && pos && (
        <div
          className={`lang-menu${pos.top === undefined ? ' flip-up' : ''}`}
          style={{
            position: 'fixed',
            left: pos.left,
            right: pos.right,
            width: pos.width,
            top: pos.top,
            bottom: pos.bottom,
            maxHeight: pos.maxHeight,
          }}
        >
          <input
            ref={inputRef}
            type="text"
            className="settings-input lang-search"
            role="combobox"
            aria-controls={listId}
            aria-expanded
            aria-autocomplete="list"
            placeholder={t('langSearchPlaceholder')}
            value={query}
            autoFocus
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
          />
          <ul className="lang-list" id={listId} role="listbox" aria-label={label}>
            {matches.map((l: Language, i) => (
              <li
                key={l.code}
                role="option"
                aria-selected={norm(l.name) === norm(value) || norm(l.code) === norm(value)}
                className={`lang-option${i === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault() // keep focus on the search input
                  commit(l.name)
                }}
              >
                <span className="lang-native">{l.native}</span>
                <span className="lang-name">{l.name}</span>
              </li>
            ))}
            {showCustom && (
              <li
                role="option"
                aria-selected={false}
                className={`lang-option lang-option-custom${active === matches.length ? ' active' : ''}`}
                onMouseEnter={() => setActive(matches.length)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  commit(typed)
                }}
              >
                {t('langUseCustom')} “{typed}”
              </li>
            )}
            {matches.length === 0 && !showCustom && <li className="lang-empty">{t('langNoMatch')}</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
