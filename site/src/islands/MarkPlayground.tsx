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
      {/* visual companion to the textarea the user drives — NOT a live region
          (a polite region echoing every keystroke floods screen readers) */}
      <div
        class="pg-out body"
        aria-label="Rendered preview"
        dangerouslySetInnerHTML={{ __html: renderHtml(src) || '&nbsp;' }}
      ></div>
    </div>
  )
}
