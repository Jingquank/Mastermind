export type CriticKind = 'ins' | 'del' | 'sub' | 'highlight' | 'comment'

/** Half-open range of UTF-16 code-unit offsets. */
export interface Range {
  start: number
  end: number
}

export interface CriticSpan {
  kind: CriticKind
  /** Whole mark including delimiters: [start, end). */
  start: number
  end: number
  /** Content between the delimiters. For subs this covers `old~>new`. */
  innerStart: number
  innerEnd: number
  /** Substitution arms (absolute offsets), present when kind === 'sub'. */
  oldStart?: number
  oldEnd?: number
  newStart?: number
  newEnd?: number
}

export interface CommentEntry {
  span: CriticSpan
  /** Parsed from a leading `@name:` author tag, when present. */
  author: string | null
  body: string
}

export type ReviewItem =
  | { type: 'suggestion'; span: CriticSpan }
  /** A highlight with no comment attached — a standalone annotation. */
  | { type: 'highlight'; span: CriticSpan }
  /**
   * One or more adjacent comments, optionally anchored to a preceding
   * highlight ({==span==}{>>note<<}). start/end cover anchor + all comments.
   */
  | { type: 'thread'; anchor: CriticSpan | null; comments: CommentEntry[]; start: number; end: number }

export interface ReviewCountsDetail {
  comments: number
  edits: number
  highlights: number
}
