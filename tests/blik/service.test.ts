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

  it('computes the checksum from alias_value alone', async () => {
    const { transport, blik } = build()
    transport.queueJson(200, { data: {} })
    await blik.alias({ aliasValue: 'a-1' })
    const withAlias = transport.lastRequestBody.checksum

    const second = build()
    second.transport.queueJson(200, { data: {} })
    await second.blik.alias({ aliasValue: 'a-1', aliasType: 'PAYID' })
    expect(second.transport.lastRequestBody.checksum).toBe(withAlias)
  })

  it('validates the alias type', async () => {
    const { blik } = build()
    await expect(blik.alias({ aliasValue: 'a-1', aliasType: 'nope' })).rejects.toBeInstanceOf(DPayValueError)
  })
})

describe('BlikService.unregisterAlias', () => {
  it('appends reason to the body but not to the checksum', async () => {
    const { transport, blik } = build()
    transport.queueJson(200, { data: {} })
    await blik.unregisterAlias({ aliasValue: 'a-1', aliasType: 'PAYID', reason: 'user request' })
    const withReason = transport.lastRequestBody

    expect(transport.lastRequest.url).toBe(
      'https://api-payments.dpay.pl/api/v1_0/payments/blik/aliases/unregister',
    )
    expect(Object.keys(withReason)).toEqual(['service', 'alias_value', 'alias_type', 'reason', 'checksum'])

    const second = build()
    second.transport.queueJson(200, { data: {} })
    await second.blik.unregisterAlias({ aliasValue: 'a-1', aliasType: 'PAYID' })
    expect(second.transport.lastRequestBody.checksum).toBe(withReason.checksum)
  })

  it('resolves to undefined', async () => {
    const { transport, blik } = build()
    transport.queueJson(200, { data: {} })
    await expect(blik.unregisterAlias({ aliasValue: 'a-1' })).resolves.toBeUndefined()
  })
})

describe('BlikService.recurringStatus', () => {
  it('reads the registration block', async () => {
    const { transport, blik } = build()
    transport.queueJson(200, {
      data: {
        alias_value: 'a-1',
        status: 'ACTIVE',
        registration: { model: 'M', frequency: '12M', limit_amt: 100000, is_limit_amt_fixed: true },
      },
    })
    const status = await blik.recurringStatus({ aliasValue: 'a-1' })

    expect(Object.keys(transport.lastRequestBody)).toEqual(['service', 'alias_value', 'checksum'])
    expect(status.isActive).toBe(true)
    expect(status.aliasType).toBe('PAYID')
    expect(status.registration?.model).toBe('M')
    expect(status.registration?.limitAmt).toBe(100000)
    expect(status.registration?.isLimitAmtFixed).toBe(true)
  })

  it('leaves registration null when absent', async () => {
    const { transport, blik } = build()
    transport.queueJson(200, { data: { alias_value: 'a-1' } })
    expect((await blik.recurringStatus({ aliasValue: 'a-1' })).registration).toBeNull()
  })
})
