export type Eol = 'lf' | 'crlf'

/** Dominant line-ending flavor of a file (mixed files normalize to the majority). */
export function detectEol(text: string): Eol {
  const crlf = (text.match(/\r\n/g) ?? []).length
  if (crlf === 0) return 'lf'
  const lf = (text.match(/[^\r]\n|^\n/g) ?? []).length
  return crlf >= lf ? 'crlf' : 'lf'
}

export function normalizeToLf(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

export function restoreEol(text: string, eol: Eol): string {
  return eol === 'crlf' ? text.replace(/\n/g, '\r\n') : text
}
