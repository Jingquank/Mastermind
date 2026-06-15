export const wordmark = `█▀▄▀█ ▄▀█ █▀ ▀█▀ █▀▀ █▀█ █▀▄▀█ █ █▄░█ █▀▄
█░▀░█ █▀█ ▄█ ░█░ ██▄ █▀▄ █░▀░█ █ █░▀█ █▄▀`

// The pitch line the agent "reviews" live — CriticMarkup is revealed mark-by-mark.
// Three marks, one per loop step: insert → substitute → highlight. This sentence IS the demo.
export const heroReview =
  'Your agent drafts a plan. You {++mark it up++} in the browser, {~~send it back~>hand it back~~}, and it re-reads the {==same file.==}'

// Same pitch in 中文 (marks preserved) so the hero reads fully in one language when toggled.
export const heroReviewZh =
  '你的 agent 起草一份计划。你在浏览器里{++批注++}，{~~发回去~>交回去~~}，它再读取{==同一个文件==}。'
