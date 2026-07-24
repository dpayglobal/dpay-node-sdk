import { describe, expect, it } from 'vitest'
import { DPayValueError } from '../../src/errors.js'
import { BaseUrls } from '../../src/internal/base-urls.js'

describe('BaseUrls', () => {
  it('resolves the three production hosts', () => {
    const urls = new BaseUrls()
    expect(urls.resolve('apiPayments')).toBe('https://api-payments.dpay.pl')
    expect(urls.resolve('panel')).toBe('https://panel.dpay.pl')
    expect(urls.resolve('gateway')).toBe('https://secure.dpay.pl')
  })

  it('applies overrides and strips a trailing slash', () => {
    const urls = new BaseUrls({ panel: 'https://sandbox.dpay.pl/' })
    expect(urls.resolve('panel')).toBe('https://sandbox.dpay.pl')
    expect(urls.resolve('apiPayments')).toBe('https://api-payments.dpay.pl')
  })

  it('rejects an unknown override key', () => {
    expect(() => new BaseUrls({ nope: 'https://x.pl' })).toThrow('Unknown base URL key "nope"')
    expect(() => new BaseUrls({ nope: 'https://x.pl' })).toThrow(DPayValueError)
  })

  it('rejects Object.prototype names as override keys', () => {
    expect(() => new BaseUrls({ constructor: 'https://x.test' })).toThrow(
      'Unknown base URL key "constructor"',
    )
    expect(() => new BaseUrls({ constructor: 'https://x.test' })).toThrow(DPayValueError)

    expect(() => new BaseUrls({ toString: 'https://x.test' })).toThrow('Unknown base URL key "toString"')
    expect(() => new BaseUrls({ toString: 'https://x.test' })).toThrow(DPayValueError)

    expect(() => new BaseUrls({ hasOwnProperty: 'https://x.test' })).toThrow(
      'Unknown base URL key "hasOwnProperty"',
    )
    expect(() => new BaseUrls({ hasOwnProperty: 'https://x.test' })).toThrow(DPayValueError)

    expect(() => new BaseUrls({ valueOf: 'https://x.test' })).toThrow('Unknown base URL key "valueOf"')
    expect(() => new BaseUrls({ valueOf: 'https://x.test' })).toThrow(DPayValueError)
  })

  it('resolve() throws for Object.prototype names', () => {
    const urls = new BaseUrls()
    expect(() => urls.resolve('constructor' as never)).toThrow('Unknown API host "constructor"')
    expect(() => urls.resolve('constructor' as never)).toThrow(DPayValueError)
    expect(() => urls.resolve('toString' as never)).toThrow('Unknown API host "toString"')
    expect(() => urls.resolve('toString' as never)).toThrow(DPayValueError)
    expect(() => urls.resolve('hasOwnProperty' as never)).toThrow('Unknown API host "hasOwnProperty"')
    expect(() => urls.resolve('hasOwnProperty' as never)).toThrow(DPayValueError)
    expect(() => urls.resolve('valueOf' as never)).toThrow('Unknown API host "valueOf"')
    expect(() => urls.resolve('valueOf' as never)).toThrow(DPayValueError)
  })
})
