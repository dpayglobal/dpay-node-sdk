import { describe, expect, it } from 'vitest'
import { Config } from '../../src/config.js'
import { ApiRequestor } from '../../src/internal/requestor.js'
import { PayoutService } from '../../src/payout/service.js'
import { MockHttpClient } from '../../src/testing.js'

const build = (): { transport: MockHttpClient; payouts: PayoutService } => {
  const transport = new MockHttpClient()
  const config = Config.fromOptions({
    service: 'test_service',
    secretHash: 'sekret-hash-123',
    httpClient: transport,
  })
  return { transport, payouts: new PayoutService(new ApiRequestor(config, transport)) }
}

describe('PayoutService.details', () => {
  it('omits the timestamp when it was not given', async () => {
    const { transport, payouts } = build()
    transport.queueJson(200, { id: 7, state: 1, net: 100.5, gross: 105, fee: 4.5 })
    const details = await payouts.details({ withdrawId: 4242 })

    expect(transport.lastRequest.url).toBe('https://panel.dpay.pl/api/v1/pbl/withdraws/details')
    expect(Object.keys(transport.lastRequestBody)).toEqual(['service', 'withdraw_id', 'checksum'])
    expect(details.id).toBe(7)
    expect(details.isProcessed).toBe(true)
    expect(details.net.toDecimal()).toBe('100.50')
  })

  it('places the timestamp between service and withdraw_id', async () => {
    const { transport, payouts } = build()
    transport.queueJson(200, { id: 7, state: 0 })
    const details = await payouts.details({ withdrawId: 4242, timestamp: 1784700000 })
    expect(Object.keys(transport.lastRequestBody)).toEqual([
      'service',
      'timestamp',
      'withdraw_id',
      'checksum',
    ])
    expect(details.isWaiting).toBe(true)
  })

  it('maps the state flags and the receiver', async () => {
    const { transport, payouts } = build()
    transport.queueJson(200, {
      id: 7,
      state: -1,
      declined: 1,
      decline_reason: 'wrong iban',
      direct_settlement: 0,
      receiver: { nrb: 'PL61', title: 'Wyplata', amount: 10.5, receiverName: 'Jan' },
    })
    const details = await payouts.details({ withdrawId: 1 })
    expect(details.isFailed).toBe(true)
    expect(details.isDeclined).toBe(true)
    expect(details.declineReason).toBe('wrong iban')
    expect(details.isDirectSettlement).toBe(false)
    expect(details.receiver?.nrb).toBe('PL61')
    expect(details.receiver?.amount?.toDecimal()).toBe('10.50')
  })

  it('leaves the receiver null when absent', async () => {
    const { transport, payouts } = build()
    transport.queueJson(200, { id: 7, state: 1 })
    expect((await payouts.details({ withdrawId: 1 })).receiver).toBeNull()
  })
})
