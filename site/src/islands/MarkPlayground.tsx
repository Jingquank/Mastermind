import { useEffect, useRef, useState } from 'preact/hooks'
import { renderHtml } from '../lib/criticmarkup'
import { playgroundSeed, playgroundSeedZh } from '../data/marks'

/** Type CriticMarkup on the left, watch it render on the right. The product's core loop,
 *  hands-on. Shares the one tokenizer with the static chips + the agent cursor.
 *  Follows the page's EN ⇄ 中文 toggle: swaps the seed + labels until the user types. */
export default function MarkPlayground() {
  const [src, setSrc] = useState(playgroundSeed)
  const [lang, setLang] = useState<'en' | 'zh'>('en')
  const touched = useRef(false)

  useEffect(() => {
    const sync = () => {
      const l = document.documentElement.getAttribute('data-lang') === 'zh' ? 'zh' : 'en'
      setLang(l)
      if (!touched.current) setSrc(l === 'zh' ? playgroundSeedZh : playgroundSeed)
    }
    sync() // match the language the page loaded in (may be persisted to zh)
    const mo = new MutationObserver(sync)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-lang'] })
    return () => mo.disconnect()
  }, [])

  const t = lang === 'zh' ? { in: 'CriticMarkup 输入', out: '渲染预览' } : { in: 'CriticMarkup input', out: 'Rendered preview' }

  return (
    <div class="pg">
      <textarea
        class="pg-in"
        value={src}
        spellcheck={false}
        aria-label={t.in}
        onInput={(e) => {
          touched.current = true
          setSrc((e.target as HTMLTextAreaElement).value)
        }}
      />
      {/* visual companion to the textarea the user drives — NOT a live region
          (a polite region echoing every keystroke floods screen readers) */}
      <div
        class="pg-out body"
        role="figure"
        aria-label={t.out}
        dangerouslySetInnerHTML={{ __html: renderHtml(src) || '&nbsp;' }}
      ></div>
    </div>
  )
}
