import { describe, expect, it } from 'vitest'
import { Config } from '../src/config.js'
import { DPayValueError } from '../src/errors.js'
import { MockHttpClient } from '../src/testing.js'

const base = { service: 'my_shop', secretHash: 'secret' }

describe('Config.fromOptions', () => {
  it('accepts the minimal option set and defaults the timeout to 30 seconds', () => {
    const config = Config.fromOptions(base)
    expect(config.service).toBe('my_shop')
    expect(config.secretHash).toBe('secret')
    expect(config.timeout).toBe(30_000)
    expect(config.httpClient).toBeNull()
  })

  it('requires a non-empty service and secretHash', () => {
    expect(() => Config.fromOptions({ ...base, service: '' })).toThrow(
      'Option "service" is required and must be a non-empty string',
    )
    expect(() => Config.fromOptions({ ...base, secretHash: '' })).toThrow(
      'Option "secretHash" is required and must be a non-empty string',
    )
    expect(() => Config.fromOptions({ ...base, service: '' })).toThrow(DPayValueError)
  })

  it('states the unit in the timeout error, so a value copied from the PHP docs is caught', () => {
    expect(() => Config.fromOptions({ ...base, timeout: 0 })).toThrow(
      'Option "timeout" must be a positive integer number of milliseconds',
    )
    expect(() => Config.fromOptions({ ...base, timeout: 1.5 })).toThrow(DPayValueError)
  })

  it('rejects an unknown option', () => {
    expect(() => Config.fromOptions({ ...base, secret_hash: 'x' } as never)).toThrow(
      'Unknown option "secret_hash"',
    )
  })

  it('ignores option values inherited from a polluted Object.prototype and still rejects an explicit unknown key', () => {
    const proto = Object.prototype as Record<string, unknown>
    proto.secretHash = 'polluted-secret'
    proto.timeout = 999_999
    proto.onRequest = () => {
      throw new Error('polluted hook must never be adopted')
    }
    try {
      expect(() => Config.fromOptions({ service: 'my_shop' } as never)).toThrow(
        'Option "secretHash" is required and must be a non-empty string',
      )
      const config = Config.fromOptions(base)
      expect(config.timeout).toBe(30_000)
      expect(config.onRequest).toBeNull()
      expect(() => Config.fromOptions({ ...base, secret_hash: 'x' } as never)).toThrow(
        'Unknown option "secret_hash"',
      )
    } finally {
      Reflect.deleteProperty(proto, 'secretHash')
      Reflect.deleteProperty(proto, 'timeout')
      Reflect.deleteProperty(proto, 'onRequest')
    }
  })

  it('rejects an http client that does not implement the interface', () => {
    expect(() => Config.fromOptions({ ...base, httpClient: {} as never })).toThrow(
      'Option "httpClient" must implement HttpClient',
    )
    expect(() => Config.fromOptions({ ...base, httpClient: new MockHttpClient() })).not.toThrow()
  })

  it('validates base URL overrides', () => {
    expect(() => Config.fromOptions({ ...base, baseUrls: { panel: '' } })).toThrow(
      'Base URLs must be non-empty strings',
    )
    expect(() => Config.fromOptions({ ...base, baseUrls: { nope: 'https://x.pl' } })).toThrow(
      'Unknown base URL key "nope"',
    )
    expect(
      Config.fromOptions({ ...base, baseUrls: { panel: 'https://x.pl' } }).baseUrls.resolve('panel'),
    ).toBe('https://x.pl')
  })

  it('rejects hooks that are not functions', () => {
    expect(() => Config.fromOptions({ ...base, onRequest: 'nope' as never })).toThrow(
      'Option "onRequest" must be a function',
    )
  })
})
