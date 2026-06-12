import { SessionView } from './SessionView'

export function App() {
  const match = window.location.pathname.match(/^\/d\/([0-9a-f-]+)/i)
  if (match?.[1]) return <SessionView sessionId={match[1]} />
  return (
    <div className="center-note">
      <h1>MASTERMIND</h1>
      <p>
        Open a document with <code>mastermind open &lt;file.md&gt;</code>
      </p>
    </div>
  )
}
