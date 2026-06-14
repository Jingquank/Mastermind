/**
 * Pure helpers for `mastermind install-agents` / `uninstall-agents` — the multi-agent
 * provisioning of the `mastermind`/`master` skills + a global instruction block.
 *
 * Kept pure (no fs) so the marker handling and per-agent frontmatter are unit-testable; the
 * CLI command does the filesystem work with these.
 */

export const MM_BEGIN = '<!-- mastermind:begin -->'
export const MM_END = '<!-- mastermind:end -->'

export interface AgentTarget {
  id: 'claude' | 'cursor' | 'gemini' | 'agents'
  /** config dir relative to the user's home, e.g. '.claude' */
  dir: string
  /** global-memory file in that dir to append the instruction block to, or null if unknown */
  globalFile: string | null
  /** include a `version:` field in skill frontmatter */
  version: boolean
  /** include a `license:` field in skill frontmatter */
  license: boolean
}

/** The agents we know how to provision, with the frontmatter quirks the drill confirmed. */
export const AGENT_TARGETS: AgentTarget[] = [
  { id: 'claude', dir: '.claude', globalFile: 'CLAUDE.md', version: false, license: false },
  { id: 'cursor', dir: '.cursor', globalFile: null, version: true, license: true },
  { id: 'gemini', dir: '.gemini', globalFile: 'GEMINI.md', version: true, license: false },
  { id: 'agents', dir: '.agents', globalFile: null, version: false, license: false },
]

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Strip a leading `---\n…\n---\n` YAML frontmatter block, returning the body. */
export function stripFrontmatter(md: string): string {
  if (!md.startsWith('---\n')) return md
  const end = md.indexOf('\n---', 4)
  if (end === -1) return md
  const after = md.indexOf('\n', end + 1)
  return after === -1 ? '' : md.slice(after + 1).replace(/^\n+/, '')
}

/** Build SKILL.md frontmatter for a target agent (single-line description). */
export function skillFile(t: AgentTarget, name: string, description: string, body: string, version: string): string {
  const lines = ['---', `name: ${name}`, `description: ${description.replace(/\n+/g, ' ').trim()}`]
  if (t.version) lines.push(`version: ${version}`)
  if (t.license) lines.push('license: Apache-2.0')
  lines.push('---', '')
  return `${lines.join('\n')}\n${body.trim()}\n`
}

/** The marker-wrapped instruction block. */
export function wrapGlobalBlock(body: string): string {
  return `${MM_BEGIN}\n${body.trim()}\n${MM_END}`
}

/** Insert or replace the marker-wrapped block in a global-memory file (idempotent). */
export function upsertMarkedBlock(existing: string, body: string): string {
  const block = wrapGlobalBlock(body)
  const re = new RegExp(`${escapeRe(MM_BEGIN)}[\\s\\S]*?${escapeRe(MM_END)}`)
  if (re.test(existing)) return existing.replace(re, block)
  if (existing.trim() === '') return `${block}\n`
  return `${existing.replace(/\n*$/, '')}\n\n${block}\n`
}

/** Remove the marker-wrapped block (idempotent — a no-op if absent). */
export function removeMarkedBlock(existing: string): string {
  const re = new RegExp(`\\n*${escapeRe(MM_BEGIN)}[\\s\\S]*?${escapeRe(MM_END)}\\n*`, 'g')
  return existing.replace(re, '\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n')
}
