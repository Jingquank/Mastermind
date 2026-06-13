import { create } from 'zustand'
import { acceptedCount, commitDecisions, validateSuggestion, type Decision } from '../../shared/critic/suggest'
import type { CriticSpan } from '../../shared/critic/types'
import type { TextEdit } from '../../shared/types'

type Status = 'idle' | 'pending' | 'staged' | 'failed'

interface ProposalState {
  status: Status
  requestId: string | null
  /** source range the proposal replaces */
  range: { from: number; to: number } | null
  /** the original selection text (== rejected form of markup) */
  original: string
  /** the agent's markup (selection with CriticMarkup) */
  markup: string
  spans: CriticSpan[]
  decisions: Map<number, Decision>

  request(sessionId: string, range: { from: number; to: number }, selection: string): Promise<void>
  /** called from the SSE assist-result handler */
  onResult(id: string, ok: boolean): Promise<void>
  setDecision(spanIndex: number, decision: Decision): void
  /** commit accepted edits to the buffer via onEdit, then clear */
  apply(onEdit: (edits: TextEdit[]) => void): void
  dismiss(): void
  acceptedCount(): number
}

export const useProposals = create<ProposalState>((set, get) => ({
  status: 'idle',
  requestId: null,
  range: null,
  original: '',
  markup: '',
  spans: [],
  decisions: new Map(),

  async request(sessionId, range, selection) {
    set({ status: 'pending', range, original: selection, requestId: null, markup: '', spans: [], decisions: new Map() })
    try {
      const res = await fetch('/api/assist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, kind: 'suggest', scope: 'selection', selection }),
      })
      if (!res.ok) {
        set({ status: 'failed' })
        return
      }
      const { requestId } = (await res.json()) as { requestId: string }
      set({ requestId })
    } catch {
      set({ status: 'failed' })
    }
  },

  async onResult(id, ok) {
    if (get().requestId !== id) return
    if (!ok) {
      set({ status: 'failed' })
      return
    }
    try {
      const res = await fetch(`/api/assist/${id}/suggestion`)
      if (!res.ok) {
        set({ status: 'failed' })
        return
      }
      const { markup } = (await res.json()) as { markup: string }
      const v = validateSuggestion(markup, get().original)
      if (!v.ok) {
        set({ status: 'failed' })
        return
      }
      set({ status: 'staged', markup, spans: v.spans, decisions: new Map() })
    } catch {
      set({ status: 'failed' })
    }
  },

  setDecision(spanIndex, decision) {
    const next = new Map(get().decisions)
    next.set(spanIndex, decision)
    set({ decisions: next })
  },

  apply(onEdit) {
    const { status, range, markup, spans, decisions } = get()
    if (status !== 'staged' || !range) return
    if (acceptedCount(spans, decisions) > 0) {
      const finalText = commitDecisions(markup, spans, decisions)
      onEdit([{ from: range.from, to: range.to, insert: finalText }])
    }
    get().dismiss()
  },

  dismiss() {
    set({ status: 'idle', requestId: null, range: null, original: '', markup: '', spans: [], decisions: new Map() })
  },

  acceptedCount() {
    return acceptedCount(get().spans, get().decisions)
  },
}))
