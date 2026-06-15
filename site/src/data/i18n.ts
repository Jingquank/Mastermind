// EN ⇄ 中文 pairs for the live toggle. Scope: hero lede + §02 protocol + §04 bilingual
// (the demo set). Chinese vendored from the Mastermind README translation; rendered via
// the system CJK stack (no CJK webfont).
export interface Pair {
  en: string
  zh: string
}

export const i18n: Record<string, Pair> = {
  tagline: {
    en: 'Review Markdown with your coding agent.',
    zh: '用你的编码 agent 评审 Markdown。',
  },
  lede: {
    en: 'The agent proposes edits as CriticMarkup; you accept only the ones you want.',
    zh: 'agent 以 CriticMarkup 的形式提出修改；你只接受想要的那些。',
  },
  protocolKicker: { en: 'The protocol', zh: '协议' },
  protocolHead: { en: 'The file is the protocol', zh: '文件就是协议' },
  protocolBody: {
    en: 'Open a <code>.md</code> and Mastermind serves it at <code>127.0.0.1:5173</code>. Your edits, comments, and accept/reject decisions round-trip through that one file as CriticMarkup — nothing else, nowhere else. Marks flow one direction: the agent proposes, you accept; nothing reaches disk until you do.',
    zh: '打开一个 <code>.md</code>，Mastermind 在 <code>127.0.0.1:5173</code> 上提供它。你的编辑、评论以及接受/拒绝的决定都以 CriticMarkup 的形式经由这一个文件往返 —— 别无其他，别处皆无。标记只朝一个方向流动：agent 提议，你接受；在你接受之前，任何东西都不会落盘。',
  },
  bilingualKicker: { en: 'Bilingual', zh: '双语' },
  bilingualHead: { en: 'Bilingual, no API key', zh: '双语，无需 API key' },
  bilingualBody: {
    en: 'Your coding agent <em>is</em> the translator. Mastermind shows the doc in your two reading languages, toggled live and cached on disk so it stays instant and works offline. This page does it too — flip the toggle in the top bar.',
    zh: '你的编码 agent <em>就是</em>那个译者。Mastermind 以你的两种阅读语言显示文档，可实时切换并缓存在磁盘上，所以它始终是即时的，离线也能用。这个页面也是这样 —— 翻转顶栏里的开关试试。',
  },
}
