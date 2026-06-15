export interface Mark {
  key: string
  syntax: string
  label: string
  example: string // CriticMarkup
  blurb: string
}

export const marks: Mark[] = [
  { key: 'ins', syntax: '{++ ++}', label: 'Insertion', example: 'ships {++this quarter++}', blurb: 'Add words.' },
  { key: 'del', syntax: '{-- --}', label: 'Deletion', example: 'the {--legacy--} indexer', blurb: 'Strike them out.' },
  {
    key: 'sub',
    syntax: '{~~ ~> ~~}',
    label: 'Substitution',
    example: 'p95 is {~~250ms~>180ms~~}',
    blurb: 'Swap one for another.',
  },
  {
    key: 'hl',
    syntax: '{== ==}',
    label: 'Highlight',
    example: '{==behind a feature flag==}',
    blurb: 'Flag a passage.',
  },
  { key: 'comment', syntax: '{>> <<}', label: 'Comment', example: 'ship it {>>are we sure?<<}', blurb: 'Leave a margin note.' },
]

export const playgroundSeed =
  'Mastermind is {--just another--} {++a local-first++} reviewer. Latency: {~~slow~>instant~~}. {==Try editing this.==} {>>your marks render live<<}'
