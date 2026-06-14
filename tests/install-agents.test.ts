import { describe, expect, it } from 'vitest'
import {
  AGENT_TARGETS,
  MM_BEGIN,
  removeMarkedBlock,
  skillFile,
  stripFrontmatter,
  upsertMarkedBlock,
} from '../src/cli/install-agents'

const claude = AGENT_TARGETS.find((t) => t.id === 'claude')!
const cursor = AGENT_TARGETS.find((t) => t.id === 'cursor')!
const gemini = AGENT_TARGETS.find((t) => t.id === 'gemini')!

describe('install-agents helpers', () => {
  it('stripFrontmatter removes a leading --- block, leaves plain bodies alone', () => {
    expect(stripFrontmatter('---\nname: x\ndescription: y\n---\n\nBody here\n')).toBe('Body here\n')
    expect(stripFrontmatter('No frontmatter\n')).toBe('No frontmatter\n')
  })

  it('skillFile carries name/description and the per-agent version/license quirks', () => {
    const c = skillFile(claude, 'mastermind', 'desc', 'Body', '0.1.0')
    expect(c).toContain('name: mastermind')
    expect(c).toContain('description: desc')
    expect(c).not.toContain('version:')
    expect(c).not.toContain('license:')
    expect(c).toContain('Body')

    const cu = skillFile(cursor, 'mastermind', 'desc', 'Body', '0.1.0')
    expect(cu).toContain('version: 0.1.0')
    expect(cu).toContain('license: Apache-2.0')

    const g = skillFile(gemini, 'mastermind', 'desc', 'Body', '0.1.0')
    expect(g).toContain('version: 0.1.0')
    expect(g).not.toContain('license:')
  })

  it('skillFile flattens a multi-line description to one line', () => {
    expect(skillFile(claude, 'm', 'line one\nline two', 'B', '1')).toContain('description: line one line two')
  })

  it('upsertMarkedBlock appends once and is idempotent (replaces, never duplicates)', () => {
    const base = '# My memory\n\nSome existing rules.\n'
    const once = upsertMarkedBlock(base, 'ALPHA')
    expect(once).toContain('# My memory')
    expect(once).toContain('ALPHA')
    const twice = upsertMarkedBlock(once, 'BETA')
    expect(twice.split(MM_BEGIN).length - 1).toBe(1) // still exactly one block
    expect(twice).toContain('BETA')
    expect(twice).not.toContain('ALPHA')
  })

  it('upsertMarkedBlock into an empty file starts with the marker', () => {
    expect(upsertMarkedBlock('', 'Hi').startsWith(MM_BEGIN)).toBe(true)
  })

  it('removeMarkedBlock strips the block, keeps the rest, and is idempotent', () => {
    const withBlock = upsertMarkedBlock('# Mem\n\nrules\n', 'Block')
    const cleaned = removeMarkedBlock(withBlock)
    expect(cleaned).not.toContain(MM_BEGIN)
    expect(cleaned).toContain('# Mem')
    expect(cleaned).toContain('rules')
    expect(removeMarkedBlock(cleaned)).toBe(cleaned)
  })
})
