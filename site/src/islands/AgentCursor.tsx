import { useEffect, useRef, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import { tokenize, type Tok } from '../lib/criticmarkup'

/** Reveals CriticMarkup marks one-by-one over plain text, an agent caret leading
 *  each, as if a coding agent were reviewing the line live. Reduced-motion → final state. */
export default function AgentCursor({ source }: { source: string }) {
  const toks = tokenize(source)
  const markOrder = toks.map((t, i) => (t.t === 'text' ? -1 : i)).filter((i) => i >= 0)
  const [revealed, setRevealed] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealed(markOrder.length)
      return
    }
    let n = 0
    let timer = 0
    const tick = () => {
      n += 1
      setRevealed(n)
      if (n < markOrder.length) timer = window.setTimeout(tick, 820)
    }
    timer = window.setTimeout(tick, 650)
    return () => window.clearTimeout(timer)
  }, [])

  const comments: { v: string; on: boolean }[] = []
  const inline: JSX.Element[] = []

  toks.forEach((t, i) => {
    if (t.t === 'text') {
      inline.push(<span key={i}>{t.v}</span>)
      return
    }
    const order = markOrder.indexOf(i)
    const shown = order < revealed
    const current = order === revealed - 1
    const cls = `mk ${shown ? 'in' : 'pre'}${current ? ' cur' : ''}`
    if (t.t === 'ins') inline.push(<span key={i} class={`m-ins ${cls}`}>{t.v}</span>)
    else if (t.t === 'del') inline.push(<span key={i} class={`m-del ${cls}`}>{t.v}</span>)
    else if (t.t === 'hl') inline.push(<span key={i} class={`m-hl ${cls}`}>{t.v}</span>)
    else if (t.t === 'sub')
      inline.push(
        <span key={i} class={`m-sub ${cls}`}>
          <span class="o">{t.from}</span>
          <span class="arrow">→</span>
          <span class="n">{t.to}</span>
        </span>,
      )
    else if (t.t === 'comment') comments.push({ v: t.v, on: shown })
  })

  return (
    <span class="agent-line">
      {inline}
      <span class="agent-caret" aria-hidden="true"></span>
      {comments.map((c, i) => (
        <span key={`c${i}`} class={`agent-comment ${c.on ? 'in' : 'pre'}`}>
          <span class="dot"></span>
          {c.v}
        </span>
      ))}
    </span>
  )
}
