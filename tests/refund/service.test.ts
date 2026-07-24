import { describe, expect, it } from 'vitest'
import { Config } from '../../src/config.js'
import { ApiError, ApiServerError, AuthenticationError, NotFoundError } from '../../src/errors.js'
import { ApiRequestor } from '../../src/internal/requestor.js'
import { Money } from '../../src/money.js'
import { RefundService } from '../../src/refund/service.js'
import { MockHttpClient } from '../../src/testing.js'

const build = (): { transport: MockHttpClient; refunds: RefundService } => {
  const transport = new MockHttpClient()
  const config = Config.fromOptions({
    service: 'test_service',
    secretHash: 'sekret-hash-123',
    httpClient: transport,
  })
  return { transport, refunds: new RefundService(new ApiRequestor(config, transport)) }
}

describe('RefundService.create', () => {
  it('sends only the transaction id when nothing else is given', async () => {
    const { transport, refunds } = build()
    transport.queueJson(200, { status: 'success', refund: true })
    const refund = await refunds.create({ transactionId: 'tx-1' })

    expect(transport.lastRequest.url).toBe('https://panel.dpay.pl/api/v1/pbl/refund')
    expect(Object.keys(transport.lastRequestBody)).toEqual(['service', 'transaction_id', 'checksum'])
    expect(refund.isAccepted).toBe(true)
  })

  it('inserts value and reason into the checksum, in wire order', async () => {
    const { transport, refunds } = build()
    transport.queueJson(200, { status: 'success', refund: true })
    await refunds.create({ transactionId: 'tx-1', amount: Money.pln(1050), reason: 'reklamacja' })

    expect(Object.keys(transport.lastRequestBody)).toEqual([
      'service',
      'transaction_id',
      'value',
      'reason',
      'checksum',
    ])
    expect(transport.lastRequestBody.value).toBe('10.50')
  })

  it('rejects a partial success shape', async () => {
    const { transport, refunds } = build()
    transport.queueJson(200, { status: 'success', refund: false })
    expect((await refunds.create({ transactionId: 'tx-1' })).isAccepted).toBe(false)
  })
})

describe('RefundService.checkAvailability', () => {
  it('reads the outcome out of a 4xx response instead of throwing', async () => {
    for (const status of [200, 400, 402, 406, 409, 410, 411]) {
      const { transport, refunds } = build()
      transport.queueJson(status, { refund: false, message: 'too late' })
      const availability = await refunds.checkAvailability({ transactionId: 'tx-1' })
      expect(availability.isAvailable).toBe(false)
      expect(availability.httpStatus).toBe(status)
      expect(availability.message).toBe('too late')
    }
  })

  it('treats a 401 that is not an auth failure as an outcome', async () => {
    const { transport, refunds } = build()
    transport.queueJson(401, { refund: false, message: 'refund window closed' })
    expect((await refunds.checkAvailability({ transactionId: 'tx-1' })).httpStatus).toBe(401)
  })

  it('still throws on a real authentication failure', async () => {
    const { transport, refunds } = build()
    transport.queueJson(401, { refund: false, message: 'Unauthorized request' })
    await expect(refunds.checkAvailability({ transactionId: 'tx-1' })).rejects.toBeInstanceOf(
      AuthenticationError,
    )
  })

  it('throws on a status outside the outcome list', async () => {
    const { transport, refunds } = build()
    transport.queueJson(404, { refund: false })
    await expect(refunds.checkAvailability({ transactionId: 'tx-1' })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('throws a generic ApiError when the body carries no refund key', async () => {
    const { transport, refunds } = build()
    transport.queueJson(200, { message: 'nope' })
    const error = await refunds.checkAvailability({ transactionId: 'tx-1' }).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).not.toBeInstanceOf(ApiServerError)
    expect(error.httpStatus).toBe(200)
  })
})
