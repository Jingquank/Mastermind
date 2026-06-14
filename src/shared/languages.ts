/**
 * The curated language list backing the reading-pair picker. Browser-safe and
 * isomorphic — imported by the settings combobox (UI) *and* the translation
 * direction heuristic (`pickTarget` in the translate store), so both agree on
 * what counts as a CJK-script language.
 *
 * Stored config values are the human `name` ("English", "Simplified Chinese").
 * Lookups also match legacy BCP-47 codes ("en", "zh-CN") and endonyms so old
 * configs and free-typed custom languages still resolve. The agent LLM is the
 * only translation backend, so any string works as a language — the list is a
 * convenience, not a constraint (see the "custom language" fallback).
 */
export interface Language {
  /** BCP-47-ish code — kept for back-compat matching of legacy stored values. */
  code: string
  /** English display name — the canonical value stored in config. */
  name: string
  /** Endonym, shown muted beside the English name. */
  native: string
  /** True for CJK-script languages; drives translation-direction detection. */
  cjk?: boolean
}

/** ~30 common languages. Order is rough frequency, not alphabetical. */
export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'zh-CN', name: 'Simplified Chinese', native: '简体中文', cjk: true },
  { code: 'zh-TW', name: 'Traditional Chinese', native: '繁體中文', cjk: true },
  { code: 'ja', name: 'Japanese', native: '日本語', cjk: true },
  { code: 'ko', name: 'Korean', native: '한국어', cjk: true },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
  { code: 'ms', name: 'Malay', native: 'Bahasa Melayu' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt' },
  { code: 'th', name: 'Thai', native: 'ไทย' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands' },
  { code: 'pl', name: 'Polish', native: 'Polski' },
  { code: 'uk', name: 'Ukrainian', native: 'Українська' },
  { code: 'sv', name: 'Swedish', native: 'Svenska' },
  { code: 'fi', name: 'Finnish', native: 'Suomi' },
  { code: 'el', name: 'Greek', native: 'Ελληνικά' },
  { code: 'he', name: 'Hebrew', native: 'עברית' },
  { code: 'fa', name: 'Persian', native: 'فارسی' },
  { code: 'cs', name: 'Czech', native: 'Čeština' },
  { code: 'ro', name: 'Romanian', native: 'Română' },
  { code: 'hu', name: 'Hungarian', native: 'Magyar' },
]

const norm = (s: string): string => s.trim().toLowerCase()

/** Resolve a stored value (English name, legacy code, or endonym) to its entry. */
export function findLanguage(value: string): Language | undefined {
  const v = norm(value)
  if (!v) return undefined
  return LANGUAGES.find((l) => norm(l.name) === v || norm(l.code) === v || norm(l.native) === v)
}

/** Display parts for a stored value; `custom` is true for anything off-list. */
export function langLabel(value: string): { name: string; native?: string; custom: boolean } {
  const hit = findLanguage(value)
  if (hit) return { name: hit.name, native: hit.native, custom: false }
  return { name: value, custom: true }
}

/**
 * Whether a stored language value is CJK-script — the signal `pickTarget` uses
 * to decide which side of the pair is the source for a CJK document. Known
 * languages use their `cjk` flag; custom values fall back to legacy codes,
 * common endonym prefixes, and the presence of CJK characters.
 */
export function isCjkLang(value: string): boolean {
  const hit = findLanguage(value)
  if (hit) return !!hit.cjk
  return (
    /^(zh|ja|ko|cjk|中文|日本|한국)/i.test(value.trim()) ||
    /[一-鿿぀-ヿ가-힯]/.test(value)
  )
}

/** Filter the list for the combobox search (matches name, endonym, or code). */
export function searchLanguages(query: string): Language[] {
  const q = norm(query)
  if (!q) return LANGUAGES
  return LANGUAGES.filter((l) => norm(l.name).includes(q) || norm(l.native).includes(q) || norm(l.code).includes(q))
}
