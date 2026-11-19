import { describe, expect, it } from 'vitest'
import { Config } from '../../src/config.js'
import { DPayValueError, PaymentRejectedError } from '../../src/errors.js'
import { ApiRequestor } from '../../src/internal/requestor.js'
import { Money } from '../../src/money.js'
import { RegisteredTransactionStatus } from '../../src/payment/models.js'
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

  it('sends and signs the transaction ID trimmed like the API', async () => {
    const transport = new MockHttpClient()
    const config = Config.fromOptions({ service: 'MyShop', secretHash: 'secret123', httpClient: transport })
    const payments = new PaymentService(new ApiRequestor(config, transport))
    transport.queueJson(200, { transaction: { id: 'tx-1', status: 'paid' } })
    await payments.details('\t30D9493D-1D73-3FBD-A5D4-633723CC7A68 ')
    expect(transport.lastRequestBody).toEqual({
      service: 'MyShop',
      transaction_id: '30D9493D-1D73-3FBD-A5D4-633723CC7A68',
      checksum: '3b345f55900ae6a43220dd14a3827ed9a26a02a3eb46b856d302e2baa44b48a4',
    })
  })

  it.each(['', '\u200b'])('rejects the blank transaction ID %j before sending', async (transactionId) => {
    const { transport, payments } = build()
    await expect(payments.details(transactionId)).rejects.toThrow(
      new DPayValueError('transaction_id must not be empty'),
    )
    expect(transport.requests).toHaveLength(0)
  })
})

describe('PaymentService.register answers of 0.3.0', () => {
  it('returns the already paid transaction of "Transaction paid" in the amount currency', async () => {
    const { transport, payments } = build()
    transport.queueJson(200, {
      error: false,
      msg: 'Transaction paid',
      status: true,
      transactionId: '30D9493D-1D73-3FBD-A5D4-633723CC7A68',
      additionalInfo: {
        transaction: {
          payment_id: '30D9493D-1D73-3FBD-A5D4-633723CC7A68',
          pid: null,
          mtid: null,
          email: 'client@example.com',
          description: 'Zamowienie #1234',
          name: 'Jan',
          surname: 'Kowalski',
          value: '10.00',
          status: 'paid',
          creation_date: '2026-11-18 10:00:00',
          payment_date: '2026-11-18 10:01:00',
        },
      },
    })
    const payment = await payments.register({ amount: Money.pln(1000), transactionType: 'transfers', urls })
    const transaction = payment.paidTransaction

    expect(payment.isPaid).toBe(true)
    expect(payment.multibanco).toBeNull()
    expect(transaction?.paymentId).toBe('30D9493D-1D73-3FBD-A5D4-633723CC7A68')
    expect(transaction?.status).toBe(RegisteredTransactionStatus.PAID)
    expect(transaction?.isPaid).toBe(true)
    expect(transaction?.value?.equals(Money.pln(1000))).toBe(true)
    expect(transaction?.email).toBe('client@example.com')
    expect(transaction?.description).toBe('Zamowienie #1234')
    expect(transaction?.name).toBe('Jan')
    expect(transaction?.surname).toBe('Kowalski')
    expect(transaction?.pid).toBeNull()
    expect(transaction?.mtid).toBeNull()
    expect(transaction?.creationDate).toBe('2026-11-18 10:00:00')
    expect(transaction?.paymentDate).toBe('2026-11-18 10:01:00')

    transport.queueJson(200, {
      msg: 'Transaction paid',
      additionalInfo: { transaction: { value: 12.5, status: 'pending' } },
    })
    const euro = await payments.register({
      amount: Money.of(1250, 'EUR'),
      transactionType: 'transfers',
      urls,
    })
    expect(euro.paidTransaction?.value?.equals(Money.of(1250, 'EUR'))).toBe(true)
    expect(euro.paidTransaction?.isPaid).toBe(false)
    expect(euro.paidTransaction?.paymentId).toBe('')
  })

  it('returns the Multibanco reference', async () => {
    const { transport, payments } = build()
    transport.queueJson(200, {
      error: false,
      msg: 'https://secure.dpay.pl/transfer@pay@ABC',
      status: true,
      transactionId: 'ABC',
      multibanco: {
        entity: '12345',
        reference: '123456789',
        amount: '12.50',
        currency: 'EUR',
        expires_at: '2026-11-21T10:00:00+00:00',
      },
    })
    const payment = await payments.register({
      amount: Money.of(1250, 'EUR'),
      transactionType: 'transfers',
      urls: { success: 'https://shop.example/ok', fail: 'https://shop.example/fail' },
      channel: '390',
      payer: { email: 'client@example.com', firstName: 'Joao', lastName: 'Silva' },
      acceptTos: true,
    })
    const multibanco = payment.multibanco

    expect(transport.lastRequestBody.currency_code).toBe('EUR')
    expect(payment.paidTransaction).toBeNull()
    expect(multibanco?.entity).toBe('12345')
    expect(multibanco?.reference).toBe('123456789')
    expect(multibanco?.amount?.equals(Money.of(1250, 'EUR'))).toBe(true)
    expect(multibanco?.currency).toBe('EUR')
    expect(multibanco?.expiresAt).toBe('2026-11-21T10:00:00+00:00')
  })
})
