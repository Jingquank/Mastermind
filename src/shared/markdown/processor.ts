import type { Root } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

const processor = unified().use(remarkParse).use(remarkGfm).freeze()

/** Parse markdown (GFM) to mdast with position offsets intact. */
export function parseMarkdown(text: string): Root {
  const tree = processor.parse(text)
  return processor.runSync(tree) as Root
}
