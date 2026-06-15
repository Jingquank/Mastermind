import { useState } from 'preact/hooks'
import { renderHtml } from '../lib/criticmarkup'
import { playgroundSeed } from '../data/marks'

/** Type CriticMarkup on the left, watch it render on the right. The product's core loop,
 *  hands-on. Shares the one tokenizer with the static chips + the agent cursor. */
export default function MarkPlayground() {
  const [src, setSrc] = useState(playgroundSeed)
  return (
    <div class="pg">
      <textarea
        class="pg-in"
        value={src}
        spellcheck={false}
        aria-label="CriticMarkup input"
        onInput={(e) => setSrc((e.target as HTMLTextAreaElement).value)}
      />
      <div class="pg-out body" dangerouslySetInnerHTML={{ __html: renderHtml(src) || '&nbsp;' }}></div>
    </div>
  )
}
