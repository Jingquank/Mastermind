/**
 * A tiny, dependency-free syntax tokenizer for the reading view's code blocks.
 *
 * Local-first ethos: no highlighter library, no CDN, no per-language grammar
 * downloads. This produces a flat list of typed tokens that the renderer wraps
 * in `<span class="tok tok-*">`; the actual colors come from CSS variables that
 * `ThemeProvider` sets per the user's chosen code-color scheme (see
 * `src/ui/theme/codeThemes.ts`). It is intentionally approximate — good enough to
 * make a shell/JS/JSON snippet read easier, not a compiler. Isomorphic /
 * browser-safe (no Node APIs) so it can live in `src/shared/`.
 */

export type TokenType =
  | 'text'
  | 'comment'
  | 'keyword'
  | 'string'
  | 'number'
  | 'function'
  | 'property'
  | 'constant'

export interface HlToken {
  type: TokenType
  value: string
}

interface LangSpec {
  /** line-comment markers, e.g. ['//', '#'] */
  line: string[]
  /** block-comment delimiter pairs (open, close), e.g. C-style slash-star */
  block: Array<[string, string]>
  /** single-char string delimiters */
  quotes: string[]
  /** Python-style triple-quoted strings */
  triple: boolean
  keywords: Set<string>
  constants: Set<string>
  /** shell mode: command detection, $vars, -flags */
  shell: boolean
  /** JSON mode: color `"key":` as a property */
  jsonKeys: boolean
}

const words = (s: string): Set<string> => new Set(s.trim().split(/\s+/))

const JS_KEYWORDS = words(`
  break case catch class const continue debugger default delete do else enum
  export extends finally for function if implements import in instanceof interface
  let new package private protected public return static super switch this throw try
  typeof var void while with yield async await of as from get set declare namespace
  type readonly abstract is keyof infer satisfies override module require
`)
const JS_CONSTANTS = words('true false null undefined NaN Infinity')

const PY_KEYWORDS = words(`
  def return if elif else for while break continue pass import from as class with try
  except finally raise lambda yield global nonlocal assert del in is not and or async
  await match case
`)
const PY_CONSTANTS = words('True False None self cls __name__')

const SH_KEYWORDS = words(`
  if then else elif fi for in while until do done case esac function select time
  return local export readonly declare unset set source alias eval exec trap
`)

const CLIKE_KEYWORDS = words(`
  break case catch class const continue default do else enum export extends final
  finally for func fn goto if implements import in instanceof interface let mut new
  package private protected public return static struct super switch this throw try
  type typeof use var void while with yield async await as defer go map range pub impl
  trait where match where bool int float double char string byte short long unsigned
  signed namespace template typename virtual override
`)
const CLIKE_CONSTANTS = words('true false null nil None NULL undefined self this')

const SPECS: Record<string, LangSpec> = {
  js: { line: ['//'], block: [['/*', '*/']], quotes: ['"', "'", '`'], triple: false, keywords: JS_KEYWORDS, constants: JS_CONSTANTS, shell: false, jsonKeys: false },
  py: { line: ['#'], block: [], quotes: ['"', "'"], triple: true, keywords: PY_KEYWORDS, constants: PY_CONSTANTS, shell: false, jsonKeys: false },
  sh: { line: ['#'], block: [], quotes: ['"', "'"], triple: false, keywords: SH_KEYWORDS, constants: new Set(), shell: true, jsonKeys: false },
  json: { line: ['//'], block: [['/*', '*/']], quotes: ['"'], triple: false, keywords: new Set(), constants: words('true false null'), shell: false, jsonKeys: true },
  css: { line: [], block: [['/*', '*/']], quotes: ['"', "'"], triple: false, keywords: new Set(), constants: new Set(), shell: false, jsonKeys: false },
  clike: { line: ['//'], block: [['/*', '*/']], quotes: ['"', "'", '`'], triple: false, keywords: CLIKE_KEYWORDS, constants: CLIKE_CONSTANTS, shell: false, jsonKeys: false },
}

const ALIAS: Record<string, string> = {
  js: 'js', javascript: 'js', mjs: 'js', cjs: 'js', jsx: 'js', node: 'js',
  ts: 'js', typescript: 'js', tsx: 'js',
  py: 'py', python: 'py',
  sh: 'sh', bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh', shellscript: 'sh',
  json: 'json', json5: 'json', jsonc: 'json',
  css: 'css', scss: 'css', less: 'css',
  go: 'clike', golang: 'clike', rust: 'clike', rs: 'clike', c: 'clike', h: 'clike',
  'c++': 'clike', cpp: 'clike', cxx: 'clike', java: 'clike', kotlin: 'clike', kt: 'clike',
  swift: 'clike', scala: 'clike', dart: 'clike', php: 'clike', cs: 'clike', 'c#': 'clike',
}

function specFor(lang: string | undefined): LangSpec {
  const key = lang ? (ALIAS[lang.toLowerCase()] ?? 'clike') : 'clike'
  return SPECS[key] ?? SPECS.clike!
}

const ID_START = /[A-Za-z_$]/
const ID_PART = /[A-Za-z0-9_$]/
const DIGIT = /[0-9]/
const SEP = new Set([';', '|', '&', '(', '{', '\n', '`'])

/** Tokenize `code` for the given fenced-block `lang`. Always returns text that, when
 *  concatenated in order, exactly reproduces the input. */
export function highlight(code: string, lang?: string): HlToken[] {
  const spec = specFor(lang)
  const out: HlToken[] = []
  const push = (type: TokenType, value: string): void => {
    if (!value) return
    const last = out[out.length - 1]
    if (last && last.type === 'text' && type === 'text') last.value += value
    else out.push({ type, value })
  }

  const n = code.length
  let i = 0
  // shell: are we at a position where the next word is a command name?
  let cmdStart = true

  const startsWith = (at: number, s: string): boolean => code.startsWith(s, at)

  while (i < n) {
    const c = code[i]!

    // whitespace — passthrough (don't reset shell command position on spaces/tabs)
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      if (c === '\n') cmdStart = true
      push('text', c)
      i++
      continue
    }

    // line comments
    let matched = false
    for (const m of spec.line) {
      if (startsWith(i, m)) {
        let j = i
        while (j < n && code[j] !== '\n') j++
        push('comment', code.slice(i, j))
        i = j
        matched = true
        break
      }
    }
    if (matched) continue

    // block comments
    for (const [open, close] of spec.block) {
      if (startsWith(i, open)) {
        const end = code.indexOf(close, i + open.length)
        const j = end === -1 ? n : end + close.length
        push('comment', code.slice(i, j))
        i = j
        matched = true
        break
      }
    }
    if (matched) continue

    // triple-quoted strings (python)
    if (spec.triple && (startsWith(i, '"""') || startsWith(i, "'''"))) {
      const q = code.slice(i, i + 3)
      const end = code.indexOf(q, i + 3)
      const j = end === -1 ? n : end + 3
      push('string', code.slice(i, j))
      i = j
      continue
    }

    // strings
    if (spec.quotes.includes(c)) {
      let j = i + 1
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue }
        if (code[j] === c) { j++; break }
        if (code[j] === '\n' && c !== '`') { break } // unterminated — stop at EOL (except templates)
        j++
      }
      // JSON: a string immediately before a colon is a key, not a value
      let k = j
      while (k < n && (code[k] === ' ' || code[k] === '\t')) k++
      push(spec.jsonKeys && code[k] === ':' ? 'property' : 'string', code.slice(i, j))
      i = j
      continue
    }

    // shell: $var / ${...}
    if (spec.shell && c === '$') {
      let j = i + 1
      if (code[j] === '{') {
        const end = code.indexOf('}', j)
        j = end === -1 ? n : end + 1
      } else {
        while (j < n && ID_PART.test(code[j]!)) j++
      }
      push('constant', code.slice(i, j))
      i = j
      continue
    }

    // shell: -flag / --flag (only when not mid-identifier)
    if (spec.shell && c === '-' && (DIGIT.test(code[i + 1] ?? '') === false) && /[-A-Za-z]/.test(code[i + 1] ?? '')) {
      let j = i + 1
      while (j < n && /[A-Za-z0-9_-]/.test(code[j]!)) j++
      push('property', code.slice(i, j))
      i = j
      continue
    }

    // numbers
    if (DIGIT.test(c) || (c === '.' && DIGIT.test(code[i + 1] ?? ''))) {
      let j = i
      if (c === '0' && /[xXbBoO]/.test(code[i + 1] ?? '')) {
        j = i + 2
        while (j < n && /[0-9a-fA-F_]/.test(code[j]!)) j++
      } else {
        while (j < n && /[0-9_]/.test(code[j]!)) j++
        if (code[j] === '.') { j++; while (j < n && /[0-9_]/.test(code[j]!)) j++ }
        if (/[eE]/.test(code[j] ?? '')) {
          j++
          if (/[+-]/.test(code[j] ?? '')) j++
          while (j < n && /[0-9]/.test(code[j]!)) j++
        }
      }
      if (/[A-Za-z%]/.test(code[j] ?? '')) { while (j < n && ID_PART.test(code[j]!)) j++ } // 10px, 5n, suffixes
      push('number', code.slice(i, j))
      i = j
      continue
    }

    // identifiers
    if (ID_START.test(c)) {
      let j = i + 1
      while (j < n && ID_PART.test(code[j]!)) j++
      const word = code.slice(i, j)
      const prev = code[i - 1]
      let k = j
      while (k < n && (code[k] === ' ' || code[k] === '\t')) k++
      const callsNext = code[k] === '('

      let type: TokenType
      if (spec.keywords.has(word)) {
        type = 'keyword'
        if (spec.shell) cmdStart = true // after `if`/`then`/`do`… a command follows
      } else if (spec.constants.has(word)) {
        type = 'constant'
      } else if (spec.jsonKeys && code[k] === ':') {
        type = 'property'
      } else if (spec.shell) {
        type = cmdStart ? 'function' : 'text'
        cmdStart = false
      } else if (callsNext) {
        type = 'function'
      } else if (prev === '.') {
        type = 'property'
      } else {
        type = 'text'
      }
      push(type, word)
      i = j
      continue
    }

    // any other single char (operators / punctuation) → plain text
    if (spec.shell && SEP.has(c)) cmdStart = true
    push('text', c)
    i++
  }

  return out
}
