export const skills = [
  { cmd: '/mastermind setup', desc: 'Pick your two reading languages, preferred browser, and color / font theme.' },
  { cmd: '/mastermind demo', desc: 'Open a bilingual demo doc — the marks and the language toggle in action.' },
  {
    cmd: '/mastermind <file>',
    desc: 'Translate any .md into both languages and open it. Bare /mastermind uses the most recent .md from the chat.',
  },
  { cmd: '/master <file>', desc: 'Shorthand for /mastermind <file>.' },
]

// The self-typing terminal sequence (§07). Each line: prompt + typed command (+ optional output).
export const installSteps = [
  { cmd: 'npm i -g mastermind-md', out: '+ mastermind-md@0.1.0' },
  { cmd: 'mastermind install-agents', out: 'installed for 3 agent(s): ~/.claude, ~/.cursor, ~/.gemini' },
]

export const repoUrl = 'https://github.com/Jingquank/Mastermind'
