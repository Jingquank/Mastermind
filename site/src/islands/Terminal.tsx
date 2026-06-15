import { useEffect, useRef, useState } from 'preact/hooks'
import { installSteps } from '../data/skills'

// The one-liner the Copy button writes to the clipboard (all typed commands, joined).
const installCmd = installSteps.map((s) => s.cmd).join('\n')

/** A terminal that types the install itself. Reduced-motion → shows the finished session. */
export default function Terminal() {
  const [done, setDone] = useState<{ cmd: string; out: string[] }[]>([])
  const [cur, setCur] = useState('')
  const [copied, setCopied] = useState(false)
  const ref = useRef({ step: 0, ch: 0 })
  const copyT = useRef(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDone(installSteps.map((s) => ({ cmd: s.cmd, out: s.out })))
      return
    }
    let timer = 0
    const run = () => {
      const { step, ch } = ref.current
      if (step >= installSteps.length) return
      const s = installSteps[step]
      if (ch <= s.cmd.length) {
        setCur(s.cmd.slice(0, ch))
        ref.current.ch = ch + 1
        timer = window.setTimeout(run, 55)
      } else {
        setDone((d) => [...d, { cmd: s.cmd, out: s.out }])
        setCur('')
        ref.current = { step: step + 1, ch: 0 }
        timer = window.setTimeout(run, 700)
      }
    }
    timer = window.setTimeout(run, 500)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => () => window.clearTimeout(copyT.current), [])

  async function copy() {
    if (!navigator.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(installCmd)
      setCopied(true)
      window.clearTimeout(copyT.current)
      copyT.current = window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked — leave the button as-is; the command is still on screen */
    }
  }

  const running = done.length < installSteps.length
  return (
    <div class="term">
      {/* real window chrome — the Copy button is a flex child so it centers with the dots/title */}
      <div class="term-bar">
        <i></i>
        <i></i>
        <i></i>
        <span>mastermind — install</span>
        <button type="button" class="term-copy" data-copied={copied} onClick={copy} aria-label="Copy install command">
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      {/* the typed-out session is the depicted "image"; the Copy button above stays outside it
          (children of role="img" aren't exposed to assistive tech) */}
      <div
        class="term-body"
        role="img"
        aria-label={`Terminal — ${installSteps.map((s) => `$ ${s.cmd} → ${s.out.join('; ')}`).join('. ')}`}
      >
        {done.map((l, i) => (
          <div key={i}>
            <div class="term-cmd">
              <span class="prompt">$</span> {l.cmd}
            </div>
            <div class="term-out">
              {l.out.map((line, j) => (
                <div key={j}>{line}</div>
              ))}
            </div>
          </div>
        ))}
        {running && (
          <div class="term-cmd">
            <span class="prompt">$</span> {cur}
            <span class="term-caret"></span>
          </div>
        )}
      </div>
    </div>
  )
}
