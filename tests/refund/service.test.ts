import { describe, expect, it } from 'vitest'
import { Config } from '../../src/config.js'
import { ApiError, ApiServerError, AuthenticationError, NotFoundError } from '../../src/errors.js'
import { ApiRequestor } from '../../src/internal/requestor.js'
import { Money } from '../../src/money.js'
import { REFUND_MESSAGE_ID_HEADER } from '../../src/refund/ops.js'
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

describe('RefundService.create with a message ID', () => {
  const buildMyShop = (): { transport: MockHttpClient; refunds: RefundService } => {
    const transport = new MockHttpClient()
    const config = Config.fromOptions({ service: 'MyShop', secretHash: 'secret123', httpClient: transport })
    return { transport, refunds: new RefundService(new ApiRequestor(config, transport)) }
  }

  it('sends the message ID as a header, outside the body and the checksum', async () => {
    const { transport, refunds } = buildMyShop()
    transport.queueJson(200, { status: 'success', refund: true, message: 'dpay.pl zwrot RET-2026-0001' })

    const refund = await refunds.create({
      transactionId: '30D9493D-1D73-3FBD-A5D4-633723CC7A68',
      messageId: 'RET-2026-0001',
    })

    expect(refund.message).toBe('dpay.pl zwrot RET-2026-0001')
    expect(transport.lastRequest.headers['DigitalPayments-PSP-Message-ID']).toBe('RET-2026-0001')
    expect(RefundService.MESSAGE_ID_HEADER).toBe('DigitalPayments-PSP-Message-ID')
    expect(REFUND_MESSAGE_ID_HEADER).toBe('DigitalPayments-PSP-Message-ID')
    expect(Object.keys(transport.lastRequestBody)).toEqual(['service', 'transaction_id', 'checksum'])
    expect(transport.lastRequestBody.checksum).toBe(
      '3b345f55900ae6a43220dd14a3827ed9a26a02a3eb46b856d302e2baa44b48a4',
    )
  })

  it('sends no header without a message ID', async () => {
    const { transport, refunds } = buildMyShop()
    transport.queueJson(200, { status: 'success', refund: true, message: 'dpay.pl TX' })
    await refunds.create({ transactionId: 'TX-1' })
    expect(transport.lastRequest.headers).not.toHaveProperty('DigitalPayments-PSP-Message-ID')
  })

  it.each([
    ['empty', ''],
    ['spaces only', '   '],
    ['line break', 'RET\r\nX-Evil: 1'],
    ['non-ascii', 'ZWROT-ŁÓDŹ'],
  ])('rejects a %s message ID before sending', async (_name, messageId) => {
    const { transport, refunds } = buildMyShop()
    await expect(refunds.create({ transactionId: 'TX-1', messageId })).rejects.toThrow(
      'Refund message ID must be non-empty printable ASCII',
    )
    expect(transport.requests).toHaveLength(0)
  })
})

describe('RefundService.checkAvailability', () => {
  it('answers a 404 with the refund key as unavailable', async () => {
    const { transport, refunds } = build()
    transport.queueJson(404, {
      status: 'error',
      refund: false,
      message: 'Transaction does not exist!',
      0: 'Transaction does not exist!',
    })
    const availability = await refunds.checkAvailability({ transactionId: 'TX-404' })
    expect(availability.isAvailable).toBe(false)
    expect(availability.message).toBe('Transaction does not exist!')
    expect(availability.httpStatus).toBe(404)
  })

  it('answers the buyer support refusal (423) as unavailable', async () => {
    const { transport, refunds } = build()
    transport.queueJson(423, {
      status: 'error',
      refund: false,
      code: 'BUYER_SUPPORT_REFUND_NOT_APPLICABLE',
      message: 'Zwrot przez BOK dpay',
    })
    const availability = await refunds.checkAvailability({ transactionId: 'TX-1' })
    expect(availability.isAvailable).toBe(false)
    expect(availability.httpStatus).toBe(423)
  })

  it('throws on a server error even with the refund key', async () => {
    const { transport, refunds } = build()
    transport.queueJson(500, { status: 'error', refund: false, message: 'Server error' })
    await expect(refunds.checkAvailability({ transactionId: 'TX-1' })).rejects.toBeInstanceOf(ApiServerError)
  })

  it('answers a business 401 with a non-ASCII message', async () => {
    const { transport, refunds } = build()
    transport.queueJson(401, {
      refund: false,
      message: 'Transakcji dokonanych kanałami paysafecard nie można zwrócić',
    })
    expect((await refunds.checkAvailability({ transactionId: 'TX-1' })).httpStatus).toBe(401)
  })

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

  it('throws on a 404 without the refund key', async () => {
    const { transport, refunds } = build()
    transport.queueJson(404, { message: 'Not Found' })
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
