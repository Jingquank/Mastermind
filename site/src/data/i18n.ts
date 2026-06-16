// EN ⇄ 中文 pairs for the live toggle. The whole landing page reads in either language;
// only code stays put (shell commands, slash-commands, CriticMarkup syntax, the terminal).
// Chinese follows the Mastermind README translation; rendered via the system CJK stack.
export interface Pair {
  en: string
  zh: string
}

export const i18n: Record<string, Pair> = {
  // chrome + CTAs
  skip: { en: 'Skip to content', zh: '跳至内容' },
  ctaInstall: { en: 'Install', zh: '安装' },
  gridHint: { en: 'press <kbd>G</kbd> for the grid', zh: '按 <kbd>G</kbd> 显示网格' },
  footerTagline: { en: 'the file is the protocol', zh: '文件就是协议' },

  // §01 hero
  tagline: {
    en: 'Review Markdown with your coding agent.',
    zh: '用你的编码 agent 评审 Markdown。',
  },

  // §02 protocol
  protocolKicker: { en: 'The protocol', zh: '协议' },
  protocolHead: { en: 'The file is the protocol', zh: '文件就是协议' },
  protocolBody: {
    en: 'Open a <code>.md</code> and Mastermind serves it at <code>127.0.0.1:5173</code>. You review in the browser; your marks and comments round-trip back to the agent through that one file as CriticMarkup — nothing else, nowhere else, and nothing reaches disk until you save.',
    zh: '打开一个 <code>.md</code>，Mastermind 在 <code>127.0.0.1:5173</code> 上提供它。你在浏览器里评审；你的标记和评论都以 CriticMarkup 的形式经由这一个文件往返给 agent —— 别无其他，别处皆无，在你保存之前，任何东西都不会落盘。',
  },

  // §03 the marks
  marksKicker: { en: 'The marks', zh: '标记' },
  marksHead: {
    en: 'Two marks. One file. <span class="m-hl" style="white-space:nowrap">No copy-paste.</span>',
    zh: '两种标记。一个文件。<span class="m-hl" style="white-space:nowrap">无需复制粘贴。</span>',
  },
  marksBody: {
    en: 'CriticMarkup is the review vocabulary — comment on a passage, or suggest a deletion. Plain text in the file, a live diff in the browser. You flag what to change; the agent does the rewrite on its next pass. Try it below.',
    zh: 'CriticMarkup 就是评审词汇 —— 对某段评论，或建议删除。在文件里是纯文本，在浏览器里是实时差异。你标出要改之处，下一轮由 agent 来重写。在下面试试。',
  },
  marksHow: {
    en: 'Make a mark by selecting a phrase — or hover a paragraph for a quiet menu of Comment and Suggest deletion.',
    zh: '选中一段文字即可标注 —— 或将鼠标悬停在段落上，弹出「评论」与「建议删除」菜单。',
  },

  // §04 bilingual
  bilingualKicker: { en: 'Bilingual', zh: '双语' },
  bilingualHead: { en: 'Bilingual, no API key', zh: '双语，无需 API key' },
  bilingualBody: {
    en: 'Your coding agent <em>is</em> the translator. Mastermind shows the doc in your two reading languages, toggled live and cached on disk so it stays instant and works offline. This page does it too — flip the toggle in the top bar.',
    zh: '你的编码 agent <em>就是</em>那个译者。Mastermind 以你的两种阅读语言显示文档，可实时切换并缓存在磁盘上，所以它始终是即时的，离线也能用。这个页面也是这样 —— 翻转顶栏里的开关试试。',
  },
  tryLangEn: { en: 'Try <span lang="zh-Hans">中文</span> →', zh: 'Back to English →' },

  // §05 skills
  skillsKicker: { en: 'In your agent', zh: '在你的 agent 里' },
  skillsHead: { en: 'One command. Any agent.', zh: '一个命令。任意 agent。' },
  skillsNote: {
    en: '<code>mastermind install-agents</code> adds the <code>/mastermind</code> and <code>/master</code> skills to Claude Code, Cursor, Gemini, and the portable <code>.agents</code> format — plus a global rule so your agent opens finished plans in Mastermind on its own.',
    zh: '<code>mastermind install-agents</code> 会把 <code>/mastermind</code> 和 <code>/master</code> 技能装进 Claude Code、Cursor、Gemini，以及通用的 <code>.agents</code> 格式 —— 还会加上一条全局规则，让你的 agent 自动在 Mastermind 里打开完成的计划。',
  },

  // §06 local-first
  localKicker: { en: 'Local-first', zh: '本地优先' },
  localHead: { en: 'Yours. On disk.', zh: '归你所有。存于磁盘。' },

  // §07 requirements
  setupKicker: { en: 'Requirements', zh: '环境要求' },
  setupHead: { en: 'Before you start.', zh: '开始之前。' },
  setupRuntime: {
    en: '<b style="color:var(--ink)">Runtime.</b> Node 20+ and a desktop browser (macOS is the tested platform). A coding agent drives the review loop and does the translation.',
    zh: '<b style="color:var(--ink)">运行环境。</b>Node 20+ 与桌面浏览器（macOS 为已测试平台）。由编码 agent 驱动评审循环并完成翻译。',
  },
  setupSource: {
    en: '<b style="color:var(--ink)">From source.</b> <code>git clone</code> the repo, <code>npm install &amp;&amp; npm run build &amp;&amp; npm link</code>, then <code>mastermind install-agents</code>.',
    zh: '<b style="color:var(--ink)">从源码安装。</b><code>git clone</code> 本仓库，<code>npm install &amp;&amp; npm run build &amp;&amp; npm link</code>，然后 <code>mastermind install-agents</code>。',
  },
}
