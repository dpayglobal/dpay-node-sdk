import { describe, expect, it } from 'vitest'
import { BankService } from '../../src/bank/service.js'
import { Config } from '../../src/config.js'
import { ApiRequestor } from '../../src/internal/requestor.js'
import { MockHttpClient } from '../../src/testing.js'

const build = (): { transport: MockHttpClient; banks: BankService } => {
  const transport = new MockHttpClient()
  const config = Config.fromOptions({
    service: 'test_service',
    secretHash: 'sekret-hash-123',
    httpClient: transport,
  })
  return { transport, banks: new BankService(new ApiRequestor(config, transport)) }
}

describe('BankService.all', () => {
  it('issues a GET without a body', async () => {
    const { transport, banks } = build()
    transport.queueJson(200, [{ id: '1', name: 'Bank', on_from: 0, on_to: 24, image: 'logo.png' }])
    const list = await banks.all()

    expect(transport.lastRequest.method).toBe('GET')
    expect(transport.lastRequest.url).toBe('https://panel.dpay.pl/api/v1/pbl/banks')
    expect(transport.lastRequest.body).toBeNull()
    expect(list[0]?.id).toBe('1')
    expect(list[0]?.onTo).toBe(24)
    expect(list[0]?.image).toBe('logo.png')
  })

  it('accepts a keyed object as well as an array, because the API returns both', async () => {
    const { transport, banks } = build()
    transport.queueJson(200, { '7': { id: '7', name: 'Bank' }, '9': { id: '9', name: 'Inny' } })
    const list = await banks.all()
    expect(list.map((bank) => bank.id)).toEqual(['7', '9'])
  })

  it('coerces loose types the PHP way', async () => {
    const { transport, banks } = build()
    transport.queueJson(200, [{ id: 5, name: 7, on_from: '3abc', test: '0', iterator: '2', type: 4 }])
    const bank = (await banks.all())[0]
    expect(bank?.id).toBe('5')
    expect(bank?.name).toBe('7')
    expect(bank?.onFrom).toBe(3)
    expect(bank?.isTest).toBe(false)
    expect(bank?.iterator).toBe(2)
    expect(bank?.type).toBeNull()
  })
})

describe('BankService.forService', () => {
  it('posts an ordered-body checksum over service and timestamp', async () => {
    const { transport, banks } = build()
    transport.queueJson(200, [{ id: '1', name: 'Bank' }])
    await banks.forService({ timestamp: 1784700000 })

    expect(transport.lastRequest.method).toBe('POST')
    expect(Object.keys(transport.lastRequestBody)).toEqual(['service', 'timestamp', 'checksum'])
    expect(transport.lastRequestBody.timestamp).toBe(1784700000)
  })

  it('falls back to the current clock, like the PHP SDK', async () => {
    const { transport, banks } = build()
    transport.queueJson(200, [])
    const before = Math.floor(Date.now() / 1000)
    await banks.forService()
    const timestamp = transport.lastRequestBody.timestamp as number
    expect(timestamp).toBeGreaterThanOrEqual(before)
    expect(Number.isInteger(timestamp)).toBe(true)
  })
})
