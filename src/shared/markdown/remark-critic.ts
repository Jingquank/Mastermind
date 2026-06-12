import type { Root } from 'mdast'
import type { Node } from 'unist'
import type { Processor, Transformer } from 'unified'
import type { VFile } from 'vfile'
import { maskSource, type Sentinels } from '../critic/mask'
import { scan } from '../critic/scanner'
import type { CriticSpan } from '../critic/types'
import { criticTransform, fixSerializedSpread, mergeCriticSiblings } from './critic-mdast'
import { criticToMarkdown } from './critic-to-markdown'
import { codeRanges } from './exclusions'

declare module 'unified' {
  interface Data {
    /** remark-stringify merges these into mdast-util-to-markdown options. */
    toMarkdownExtensions?: unknown[]
  }
}

interface CriticState {
  original: string
  spans: CriticSpan[]
  sentinels: Sentinels | null
}

/**
 * parse() → runSync() handoff. Keyed by processor instance (unified forbids
 * data() writes on frozen processors); parse and run are synchronous and
 * back-to-back in both Milkdown and our own pipeline, so per-processor state
 * cannot interleave.
 */
const STATE = new WeakMap<object, CriticState>()

/**
 * The one unified plugin shared by Reading mode and Milkdown.
 *
 * Parse side: wraps the parser set by remark-parse with mask-then-parse, so
 * GFM tokenization can never mangle CriticMarkup (notably `~~` in subs), and
 * every node position stays valid for the original source. The transformer
 * then rebuilds typed critic nodes from the sentinel runs.
 *
 * State is stashed on the processor (not the vfile) because Milkdown calls
 * parse() and runSync() with separate vfiles; parse+run are synchronous and
 * back-to-back, so processor-level state is safe.
 *
 * Serialize side: registers toMarkdown handlers that emit the mark syntax
 * verbatim (remark-stringify merges data('toMarkdownExtensions') exactly as
 * it does for remark-gfm).
 */
export function remarkCritic(this: Processor): Transformer<Root> {
  const self = this as Processor & {
    parser?: (doc: string, file: VFile) => Node
  }

  const inner = self.parser
  if (typeof inner === 'function') {
    self.parser = (doc: string, file: VFile): Node => {
      const spans = scan(doc, codeRanges(doc))
      const state: CriticState = { original: doc, spans, sentinels: null }
      STATE.set(self, state)
      if (spans.length > 0) {
        const { masked, sentinels } = maskSource(doc, spans)
        state.sentinels = sentinels
        return inner.call(self, masked, file)
      }
      return inner.call(self, doc, file)
    }
  }

  const existing = this.data('toMarkdownExtensions') ?? []
  this.data('toMarkdownExtensions', [...existing, criticToMarkdown])

  // Serialize side (Milkdown only — our reading pipeline has no compiler):
  // re-merge split critic wrap nodes before remark-stringify runs.
  const selfWithCompiler = this as Processor & { compiler?: (tree: Node, file: VFile) => string }
  const innerCompiler = selfWithCompiler.compiler
  if (typeof innerCompiler === 'function') {
    selfWithCompiler.compiler = (tree: Node, file: VFile): string => {
      mergeCriticSiblings(tree)
      fixSerializedSpread(tree)
      return innerCompiler.call(selfWithCompiler, tree, file)
    }
  }

  return (tree) => {
    const state = STATE.get(self)
    if (state && state.spans.length > 0 && state.sentinels) {
      criticTransform(tree, state.original, state.spans, state.sentinels)
    }
  }
}
