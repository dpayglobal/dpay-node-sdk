import { describe, expect, it } from 'vitest'
import { Config } from '../../src/config.js'
import { DPayValueError, PaymentRejectedError } from '../../src/errors.js'
import { ApiRequestor } from '../../src/internal/requestor.js'
import { Money } from '../../src/money.js'
import { PaymentService } from '../../src/payment/service.js'
import { MockHttpClient } from '../../src/testing.js'

const urls = { success: 'https://shop.test/ok', fail: 'https://shop.test/fail', ipn: 'https://shop.test/ipn' }

const build = (): { transport: MockHttpClient; payments: PaymentService } => {
  const transport = new MockHttpClient()
  const config = Config.fromOptions({
    service: 'test_service',
    secretHash: 'sekret-hash-123',
    httpClient: transport,
  })
  return { transport, payments: new PaymentService(new ApiRequestor(config, transport)) }
}

describe('PaymentService.register', () => {
  it('posts to the api-payments host and appends the secret-second checksum', async () => {
    const { transport, payments } = build()
    transport.queueJson(200, { transactionId: 'tx-1', msg: 'https://secure.dpay.pl/pay/1' })
    const payment = await payments.register({ amount: Money.pln(2999), transactionType: 'transfers', urls })

    expect(transport.lastRequest.url).toBe('https://api-payments.dpay.pl/api/v1_0/payments/register')
    expect(transport.lastRequestBody.checksum).toMatch(/^[0-9a-f]{64}$/)
    expect(Object.keys(transport.lastRequestBody).at(-1)).toBe('checksum')
    expect(payment.redirectUrl).toBe('https://secure.dpay.pl/pay/1')
  })

  it('throws PaymentRejectedError on a HTTP 200 rejection', async () => {
    const { transport, payments } = build()
    transport.queueJson(200, { error: true, msg: 'Rejected', transactionId: 'tx-9' })
    await expect(
      payments.register({ amount: Money.pln(100), transactionType: 'transfers', urls }),
    ).rejects.toBeInstanceOf(PaymentRejectedError)
  })

  it('also treats status false as a rejection', async () => {
    const { transport, payments } = build()
    transport.queueJson(200, { status: false, msg: 'Rejected' })
    await expect(
      payments.register({ amount: Money.pln(100), transactionType: 'transfers', urls }),
    ).rejects.toBeInstanceOf(PaymentRejectedError)
  })

  it('rejects (not throws synchronously) when params fail validation', async () => {
    const { payments } = build()
    await expect(
      payments.register({
        amount: Money.pln(100),
        transactionType: 'transfers',
        urls: { success: 'not-a-url', fail: 'https://shop.test/f', ipn: 'https://shop.test/ipn' },
      }),
    ).rejects.toBeInstanceOf(DPayValueError)
  })
})

describe('PaymentService.details', () => {
  it('posts to the panel host with an ordered-body checksum', async () => {
    const { transport, payments } = build()
    transport.queueJson(200, { transaction: { id: 'tx-1', status: 'paid' } })
    const transaction = await payments.details('tx-1')

    expect(transport.lastRequest.url).toBe('https://panel.dpay.pl/api/v1/pbl/details')
    expect(Object.keys(transport.lastRequestBody)).toEqual(['service', 'transaction_id', 'checksum'])
    expect(transport.lastRequestBody.checksum).toBe(
      '9508d77a17bdd44829ecc450214a3e356ca0cbe2f93c28012e3a5f6b39b4aa30',
    )
    expect(transaction.isPaid).toBe(true)
  })
})
