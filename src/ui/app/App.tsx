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
          <p>
            <button
              type="button"
              className="btn-cta"
              onClick={() => {
                void fetch('/api/sessions', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ draft: true }),
                })
                  .then((r) => r.json())
                  .then((j: { url?: string }) => {
                    if (j.url) window.location.href = j.url
                  })
              }}
            >
              + New draft
            </button>
          </p>
        </div>
      )}
      <GrainOverlay />
    </>
  )
}
