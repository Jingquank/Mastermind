import { useEffect } from 'react'
import { GrainOverlay, ThemeEffects } from '../theme/ThemeProvider'
import { useConfig } from './configStore'
import { SessionView } from './SessionView'

export function App() {
  const load = useConfig((s) => s.load)
  useEffect(() => {
    void load()
  }, [load])

  const match = window.location.pathname.match(/^\/d\/([0-9a-f-]+)/i)
  return (
    <>
      <ThemeEffects />
      {match?.[1] ? (
        <SessionView sessionId={match[1]} />
      ) : (
        <div className="center-note">
          <h1>MASTERMIND</h1>
          <p>
            Open a document with <code>mastermind open &lt;file.md&gt;</code>
          </p>
        </div>
      )}
      <GrainOverlay />
    </>
  )
}
