import type { Root } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { group, scan } from '../critic/scanner'
import type { CriticSpan, ReviewItem } from '../critic/types'
import { codeRanges } from './exclusions'
import { remarkCritic } from './remark-critic'

const criticProcessor = unified().use(remarkParse).use(remarkGfm).use(remarkCritic).freeze()

export interface Analysis {
  tree: Root
  spans: CriticSpan[]
  items: ReviewItem[]
}

/** Full Reading-mode pipeline: critic-aware tree + spans + grouped review items. */
export function analyzeMarkdown(text: string): Analysis {
  const tree = criticProcessor.runSync(criticProcessor.parse(text)) as Root
  const spans = scan(text, codeRanges(text))
  return { tree, spans, items: group(spans, text) }
}
