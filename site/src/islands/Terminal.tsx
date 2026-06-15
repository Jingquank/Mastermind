import { useEffect, useRef, useState } from 'preact/hooks'
import { installSteps } from '../data/skills'

/** A terminal that types the install itself. Reduced-motion → shows the finished session. */
export default function Terminal() {
  const [done, setDone] = useState<{ cmd: string; out: string }[]>([])
  const [cur, setCur] = useState('')
  const ref = useRef({ step: 0, ch: 0 })

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

  const running = done.length < installSteps.length
  return (
    <div class="term" role="img" aria-label={`Terminal — ${installSteps.map((s) => `$ ${s.cmd} → ${s.out}`).join('. ')}`}>
      <div class="term-bar">
        <i></i>
        <i></i>
        <i></i>
        <span>mastermind — install</span>
      </div>
      <div class="term-body">
        {done.map((l, i) => (
          <div key={i}>
            <div class="term-cmd">
              <span class="prompt">$</span> {l.cmd}
            </div>
            <div class="term-out">{l.out}</div>
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
