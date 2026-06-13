/**
 * Feedback language handling used to translate comments into the document's
 * language on save, via a configurable third-party translation API. That path
 * has been removed (translation is now agent-only, and running it on every save
 * would block the save on an agent round-trip), so comments are saved exactly as
 * typed. Kept as a pass-through so the save route needs no special-casing.
 */
export async function processFeedbackLanguage(content: string): Promise<string> {
  return content
}
