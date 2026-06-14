import { describe, expect, it } from 'vitest'
import { browserOpenArgs } from '../src/cli/browser-open'

const URL = 'http://127.0.0.1:5173/d/abc'

describe('browserOpenArgs', () => {
  it('no browser configured → bare open (system default)', () => {
    expect(browserOpenArgs(URL, undefined, '')).toEqual([URL])
    expect(browserOpenArgs(URL, undefined, '   ')).toEqual([URL])
  })

  it('configured browser → open -a <app>', () => {
    expect(browserOpenArgs(URL, undefined, 'Google Chrome')).toEqual(['-a', 'Google Chrome', URL])
  })

  it('--in override wins over the configured default', () => {
    expect(browserOpenArgs(URL, 'Safari', 'Google Chrome')).toEqual(['-a', 'Safari', URL])
  })

  it('explicit empty override → system default', () => {
    expect(browserOpenArgs(URL, '', 'Google Chrome')).toEqual([URL])
  })

  it('trims whitespace around the app name', () => {
    expect(browserOpenArgs(URL, '  Arc  ', '')).toEqual(['-a', 'Arc', URL])
  })
})
