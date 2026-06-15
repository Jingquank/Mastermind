// EN ⇄ 中文 pairs for the live toggle. Scope: hero tagline + §02 protocol + §04 bilingual
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
  protocolKicker: { en: 'The protocol', zh: '协议' },
  protocolHead: { en: 'The file is the protocol', zh: '文件就是协议' },
  protocolBody: {
    en: 'Open a <code>.md</code> and Mastermind serves it at <code>127.0.0.1:5173</code>. You review in the browser; your marks and comments round-trip back to the agent through that one file as CriticMarkup — nothing else, nowhere else, and nothing reaches disk until you save.',
    zh: '打开一个 <code>.md</code>，Mastermind 在 <code>127.0.0.1:5173</code> 上提供它。你在浏览器里评审；你的标记和评论都以 CriticMarkup 的形式经由这一个文件往返给 agent —— 别无其他，别处皆无，在你保存之前，任何东西都不会落盘。',
  },
  bilingualKicker: { en: 'Bilingual', zh: '双语' },
  bilingualHead: { en: 'Bilingual, no API key', zh: '双语，无需 API key' },
  bilingualBody: {
    en: 'Your coding agent <em>is</em> the translator. Mastermind shows the doc in your two reading languages, toggled live and cached on disk so it stays instant and works offline. This page does it too — flip the toggle in the top bar.',
    zh: '你的编码 agent <em>就是</em>那个译者。Mastermind 以你的两种阅读语言显示文档，可实时切换并缓存在磁盘上，所以它始终是即时的，离线也能用。这个页面也是这样 —— 翻转顶栏里的开关试试。',
  },
}
