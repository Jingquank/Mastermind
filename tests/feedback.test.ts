import { describe, expect, it } from 'vitest'
import { processFeedbackLanguage } from '../src/server/feedback'

/**
 * Comment language handling is now a pass-through: the on-save translation path
 * (which depended on a third-party translation API) has been removed, so comments
 * are saved exactly as typed. Interactive translation lives in the agent channel.
 */
describe('feedback language rule', () => {
  it('saves comments exactly as typed', async () => {
    const doc = 'English doc.\n\nBody {>>@ke: 这里需要更多细节<<} end.\n'
    expect(await processFeedbackLanguage(doc)).toBe(doc)
  })
})
