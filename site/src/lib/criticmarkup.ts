// One CriticMarkup tokenizer, three consumers: the static MarkChip (build-time HTML),
// the live playground, and the agent-cursor typer. Keep this the single source of truth.

export type Tok =
  | { t: 'text'; v: string }
  | { t: 'ins'; v: string }
  | { t: 'del'; v: string }
  | { t: 'sub'; from: string; to: string }
  | { t: 'hl'; v: string }
  | { t: 'comment'; v: string }

const RE =
  /\{\+\+([\s\S]*?)\+\+\}|\{--([\s\S]*?)--\}|\{~~([\s\S]*?)~>([\s\S]*?)~~\}|\{==([\s\S]*?)==\}|\{>>([\s\S]*?)<<\}/g

export function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let last = 0
  RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RE.exec(src)) !== null) {
    if (m.index > last) out.push({ t: 'text', v: src.slice(last, m.index) })
    if (m[1] !== undefined) out.push({ t: 'ins', v: m[1] })
    else if (m[2] !== undefined) out.push({ t: 'del', v: m[2] })
    else if (m[3] !== undefined) out.push({ t: 'sub', from: m[3], to: m[4]! })
    else if (m[5] !== undefined) out.push({ t: 'hl', v: m[5] })
    else if (m[6] !== undefined) out.push({ t: 'comment', v: m[6] })
    last = RE.lastIndex
  }
  if (last < src.length) out.push({ t: 'text', v: src.slice(last) })
  return out
}

const esc = (s: string): string =>
  s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))

/** Render CriticMarkup to an HTML string (for Astro `set:html` / build-time chips). */
export function renderHtml(src: string): string {
  return tokenize(src)
    .map((t) => {
      switch (t.t) {
        case 'text':
          return esc(t.v)
        case 'ins':
          return `<span class="m-ins">${esc(t.v)}</span>`
        case 'del':
          // struck text drops out of the final reading — hide it from AT
          return `<span class="m-del" aria-hidden="true">${esc(t.v)}</span>`
        case 'sub':
          return `<span class="m-sub"><span class="o" aria-hidden="true">${esc(t.from)}</span><span class="arrow" aria-hidden="true">→</span><span class="n">${esc(t.to)}</span></span>`
        case 'hl':
          return `<span class="m-hl">${esc(t.v)}</span>`
        case 'comment':
          return `<span class="m-comment">${esc(t.v)}</span>`
      }
    })
    .join('')
}
