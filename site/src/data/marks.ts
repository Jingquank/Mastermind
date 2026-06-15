export interface Mark {
  key: string
  syntax: string
  label: string
  labelZh: string
  example: string // CriticMarkup
  blurb: string
  blurbZh: string
}

export const marks: Mark[] = [
  { key: 'ins', syntax: '{++ ++}', label: 'Insertion', labelZh: '插入', example: 'ships {++this quarter++}', blurb: 'Add words.', blurbZh: '加入文字。' },
  { key: 'del', syntax: '{-- --}', label: 'Deletion', labelZh: '删除', example: 'the {--legacy--} indexer', blurb: 'Strike them out.', blurbZh: '划掉文字。' },
  {
    key: 'sub',
    syntax: '{~~ ~> ~~}',
    label: 'Substitution',
    labelZh: '替换',
    example: 'p95 is {~~250ms~>180ms~~}',
    blurb: 'Swap one for another.',
    blurbZh: '以此换彼。',
  },
  {
    key: 'hl',
    syntax: '{== ==}',
    label: 'Highlight',
    labelZh: '高亮',
    example: '{==behind a feature flag==}',
    blurb: 'Flag a passage.',
    blurbZh: '标出一段。',
  },
  { key: 'comment', syntax: '{>> <<}', label: 'Comment', labelZh: '评论', example: 'ship it {>>are we sure?<<}', blurb: 'Leave a margin note.', blurbZh: '留个旁注。' },
]

export const playgroundSeed =
  'Mastermind is {--just another--} {++a local-first++} reviewer. Latency: {~~slow~>instant~~}. {==Try editing this.==} {>>your marks render live<<}'

// Same seed in 中文 — the MarkPlayground swaps to this when the page is in Chinese (until you type).
export const playgroundSeedZh =
  'Mastermind 是{--又一个--}{++一个本地优先的++}评审器。延迟：{~~慢~>即时~~}。{==试着编辑这里。==} {>>你的标记会实时渲染<<}'
