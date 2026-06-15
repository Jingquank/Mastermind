export const skills = [
  {
    cmd: '/mastermind setup',
    desc: 'Pick your two reading languages, preferred browser, and color / font theme.',
    descZh: '选择你的两种阅读语言、偏好的浏览器，以及配色 / 字体主题。',
  },
  {
    cmd: '/mastermind demo',
    desc: 'Open a bilingual demo doc — the marks and the language toggle in action.',
    descZh: '打开一个双语演示文档 —— 实际体验标记与语言切换。',
  },
  {
    cmd: '/mastermind <file>',
    desc: 'Translate any .md into both languages and open it. Bare /mastermind uses the most recent .md; /master <file> is the shorthand.',
    descZh: '把任意 .md 翻译成两种语言并打开。直接用 /mastermind 会取用最近的 .md；/master <file> 是简写。',
  },
]

// The self-typing terminal sequence (§07). Each line: prompt + typed command + output line(s).
// A single `&&` line installs the CLI and provisions the skills — both commands' output
// streams under the one prompt, just like in a real shell.
export const installSteps: { cmd: string; out: string[] }[] = [
  {
    cmd: 'npm i -g mastermind-md && mastermind install-agents',
    out: ['+ mastermind-md@0.1.1', 'installed for 3 agent(s): ~/.claude, ~/.cursor, ~/.gemini'],
  },
]

export const repoUrl = 'https://github.com/Jingquank/Mastermind'
