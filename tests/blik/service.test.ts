import { describe, expect, it } from 'vitest'
import { BlikService } from '../../src/blik/service.js'
import { Config } from '../../src/config.js'
import { DPayValueError } from '../../src/errors.js'
import { ApiRequestor } from '../../src/internal/requestor.js'
import { MockHttpClient } from '../../src/testing.js'

const SECRET = 'sekret-hash-123'
const build = (): { transport: MockHttpClient; blik: BlikService } => {
  const transport = new MockHttpClient()
  const config = Config.fromOptions({ service: 'test_service', secretHash: SECRET, httpClient: transport })
  return { transport, blik: new BlikService(new ApiRequestor(config, transport)) }
}

describe('BlikService.alias', () => {
  it('posts the alias and unwraps the data envelope', async () => {
    const { transport, blik } = build()
    transport.queueJson(200, {
      data: {
        alias_value: 'a-1',
        alias_type: 'UID',
        status: 'ACTIVE',
        expiration_date: '2027-01-01',
        apps: [{ key: 'k', label: 'Bank' }, 'skipped'],
      },
    })
    const alias = await blik.alias({ aliasValue: 'a-1' })

    expect(transport.lastRequest.url).toBe('https://api-payments.dpay.pl/api/v1_0/payments/blik/aliases')
    expect(Object.keys(transport.lastRequestBody)).toEqual([
      'service',
      'alias_value',
      'alias_type',
      'checksum',
    ])
    expect(transport.lastRequestBody.alias_type).toBe('UID')
    expect(alias.isActive).toBe(true)
    expect(alias.apps).toHaveLength(1)
    expect(alias.apps[0]?.label).toBe('Bank')
  })

  it('computes the checksum from alias_value alone (shared vector blik_aliases_uid)', async () => {
    const transport = new MockHttpClient()
    const config = Config.fromOptions({
      service: 'sdk-test-service',
      secretHash: 'sdk-test-hash-0001',
      httpClient: transport,
    })
    const blik = new BlikService(new ApiRequestor(config, transport))
    transport.queueJson(200, { data: {} })
    await blik.alias({ aliasValue: 'DPAY.UID.1.abcd1234', aliasType: 'UID' })
    // sha256(service|hash|alias_value)
    expect(transport.lastRequestBody.checksum).toBe(
      'f3ab74b584c29e0a1d66c8037a962e0e52e74e070c092ee2437e2254544703f5',
    )
  })

  it('validates the alias type and rejects PAYID', async () => {
    const { blik } = build()
    await expect(blik.alias({ aliasValue: 'a-1', aliasType: 'nope' })).rejects.toBeInstanceOf(DPayValueError)
    await expect(blik.alias({ aliasValue: 'a-1', aliasType: 'PAYID' })).rejects.toThrow(
      'Invalid BLIK alias type "PAYID"',
    )
  })
})

describe('BlikService.unregisterAlias', () => {
  it('appends reason to the body but not to the checksum', async () => {
    const { transport, blik } = build()
    transport.queueJson(200, { data: {} })
    await blik.unregisterAlias({ aliasValue: 'a-1', aliasType: 'UID', reason: 'user request' })
    const withReason = transport.lastRequestBody

    expect(transport.lastRequest.url).toBe(
      'https://api-payments.dpay.pl/api/v1_0/payments/blik/aliases/unregister',
    )
    expect(Object.keys(withReason)).toEqual(['service', 'alias_value', 'alias_type', 'reason', 'checksum'])
    expect(withReason.alias_type).toBe('UID')

    const second = build()
    second.transport.queueJson(200, { data: {} })
    await second.blik.unregisterAlias({ aliasValue: 'a-1' })
    expect(second.transport.lastRequestBody.checksum).toBe(withReason.checksum)
  })

  it('resolves to undefined', async () => {
    const { transport, blik } = build()
    transport.queueJson(200, { data: {} })
    await expect(blik.unregisterAlias({ aliasValue: 'a-1' })).resolves.toBeUndefined()
  })
})

describe('BlikService recurring status', () => {
  it('is gone - the status of a recurring payment comes from dpay.recurring.status()', () => {
    const { blik } = build()
    expect('recurringStatus' in blik).toBe(false)
  })
})
