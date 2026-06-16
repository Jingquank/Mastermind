export interface Mark {
  key: string
  syntax: string
  label: string
  labelZh: string
  example: string // CriticMarkup
  blurb: string
  blurbZh: string
}

// Mastermind's review vocabulary is two marks: a comment (a highlighted anchor + a
// margin note) and a suggested deletion. They round-trip in the file as CriticMarkup.
export const marks: Mark[] = [
  {
    key: 'comment',
    syntax: '{== ==}{>> <<}',
    label: 'Comment',
    labelZh: '评论',
    example: '{==ship it==}{>>are we sure?<<}',
    blurb: 'Highlight a passage, leave a margin note.',
    blurbZh: '标出一段，留个旁注。',
  },
  {
    key: 'del',
    syntax: '{-- --}',
    label: 'Suggest deletion',
    labelZh: '建议删除',
    example: 'the {--legacy--} indexer',
    blurb: 'Strike out what should go.',
    blurbZh: '划掉该删的部分。',
  },
]

export const playgroundSeed =
  'Mastermind reviews Markdown {--without copy-paste--}. {==Try editing this==}{>>your marks render live<<}.'

// Same seed in 中文 — the MarkPlayground swaps to this when the page is in Chinese (until you type).
export const playgroundSeedZh =
  'Mastermind 评审 Markdown，{--无需复制粘贴--}。{==试着编辑这里==}{>>你的标记会实时渲染<<}。'
