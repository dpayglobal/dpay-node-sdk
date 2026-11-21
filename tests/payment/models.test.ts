import { describe, expect, it } from 'vitest'
import { Money } from '../../src/money.js'
import { parseRegisteredPayment, parseTransaction } from '../../src/payment/models.js'

describe('parseRegisteredPayment', () => {
  it('treats an http message as the redirect URL', () => {
    const payment = parseRegisteredPayment({ transactionId: 'tx-1', msg: 'https://secure.dpay.pl/pay/1' })
    expect(payment.transactionId).toBe('tx-1')
    expect(payment.redirectUrl).toBe('https://secure.dpay.pl/pay/1')
    expect(payment.isPaid).toBe(false)
  })

  it('recognises the two literal status messages', () => {
    expect(parseRegisteredPayment({ msg: 'Transaction paid' }).isPaid).toBe(true)
    expect(parseRegisteredPayment({ msg: 'Internal processing' }).isInternalProcessing).toBe(true)
    expect(parseRegisteredPayment({ msg: 'Transaction paid' }).redirectUrl).toBeNull()
  })

  it('reads the card recurring alias out of additionalInfo', () => {
    const payment = parseRegisteredPayment({ additionalInfo: { card_recurring_alias: 'al-1' } })
    expect(payment.cardRecurringAlias).toBe('al-1')
    expect(parseRegisteredPayment({ additionalInfo: 'nope' }).cardRecurringAlias).toBeNull()
  })

  it('reads the registered recurring payment, keeping only string methods', () => {
    const payment = parseRegisteredPayment({
      msg: 'Internal processing',
      additionalInfo: { recurring_registration: { alias: 'SUB-1', methods: ['blik', 7, null] } },
    })
    expect(payment.recurringAlias).toBe('SUB-1')
    expect(payment.recurringMethods).toEqual(['blik'])
    expect(Object.isFrozen(payment.recurringMethods)).toBe(true)

    const none = parseRegisteredPayment({ additionalInfo: { recurring_registration: 'nope' } })
    expect(none.recurringAlias).toBeNull()
    expect(none.recurringMethods).toEqual([])
    expect(parseRegisteredPayment({}).recurringMethods).toEqual([])
  })

  it('coerces scalars and keeps the raw payload', () => {
    const payment = parseRegisteredPayment({ transactionId: 77, msg: null, extra: 1 })
    expect(payment.transactionId).toBe('77')
    expect(payment.message).toBe('')
    expect(payment.raw).toEqual({ transactionId: 77, msg: null, extra: 1 })
  })

  it('is frozen', () => {
    expect(Object.isFrozen(parseRegisteredPayment({}))).toBe(true)
  })
})

describe('parseTransaction', () => {
  it('reads the nested transaction envelope', () => {
    const transaction = parseTransaction({
      transaction: {
        id: 'tx-1',
        value: '29.99',
        status: 'paid',
        settled: true,
        refunded_amount: 5,
        available_refund_amount: '24.99',
        fully_refunded: false,
      },
      payer: { email: 'jan@example.com' },
      refunds: [{ payment_id: 'r-1', value: '5.00', status: 'paid' }, 'skipped'],
    })
    expect(transaction.id).toBe('tx-1')
    expect(transaction.value.toDecimal()).toBe('29.99')
    expect(transaction.isPaid).toBe(true)
    expect(transaction.isSettled).toBe(true)
    expect(transaction.refundedAmount.toDecimal()).toBe('5.00')
    expect(transaction.availableRefundAmount.toDecimal()).toBe('24.99')
    expect(transaction.payer).toEqual({ email: 'jan@example.com' })
    expect(transaction.refunds).toHaveLength(1)
    expect(transaction.refunds[0]?.paymentId).toBe('r-1')
  })

  it('counts captured as paid', () => {
    expect(parseTransaction({ transaction: { status: 'captured' } }).isPaid).toBe(true)
    expect(parseTransaction({ transaction: { status: 'created' } }).isPaid).toBe(false)
  })

  it('keeps an unknown status instead of throwing', () => {
    expect(parseTransaction({ transaction: { status: 'brand_new' } }).status).toBe('brand_new')
  })

  it('falls back to zero for unparsable amounts', () => {
    expect(parseTransaction({ transaction: { value: 'abc' } }).value.toDecimal()).toBe('0.00')
    expect(parseTransaction({}).value.toDecimal()).toBe('0.00')
  })

  it('defaults a refund status to paid, like the PHP SDK', () => {
    const transaction = parseTransaction({ refunds: [{ payment_id: 'r-1' }] })
    expect(transaction.refunds[0]?.status).toBe('paid')
  })

  it('deeply freezes transaction and refunds, but leaves raw and payer mutable', () => {
    const transaction = parseTransaction({
      transaction: { id: 'tx-1', value: '100.00', status: 'paid' },
      payer: { email: 'test@example.com' },
      refunds: [{ payment_id: 'r-1', value: '25.00', status: 'paid' }],
    })
    // Transaction object is frozen
    expect(Object.isFrozen(transaction)).toBe(true)
    // Refunds array is frozen
    expect(Object.isFrozen(transaction.refunds)).toBe(true)
    // Nested refund is frozen
    expect(Object.isFrozen(transaction.refunds[0])).toBe(true)
    // raw field is deliberately left mutable
    expect(Object.isFrozen(transaction.raw)).toBe(false)
    // payer field is deliberately left mutable
    expect(Object.isFrozen(transaction.payer)).toBe(false)
  })
})

describe('parseRegisteredPayment Multibanco and paid transaction fallbacks', () => {
  it('defaults the Multibanco currency to EUR and accepts integer fields', () => {
    const multibanco = parseRegisteredPayment({
      multibanco: { entity: 12345, reference: 123456789, amount: 'x' },
    }).multibanco
    expect(multibanco?.entity).toBe('12345')
    expect(multibanco?.reference).toBe('123456789')
    expect(multibanco?.currency).toBe('EUR')
    expect(multibanco?.amount).toBeNull()
    expect(multibanco?.expiresAt).toBeNull()
    expect(parseRegisteredPayment({ multibanco: { currency: 'eur' } }).multibanco?.currency).toBe('EUR')
    expect(
      parseRegisteredPayment({ multibanco: { currency: 'USD', amount: 3 } }).multibanco?.amount?.currency,
    ).toBe('USD')
    expect(parseRegisteredPayment({ multibanco: 'nope' }).multibanco).toBeNull()
  })

  it('reads a captured paid transaction in PLN by default', () => {
    const transaction = parseRegisteredPayment({
      msg: 'Transaction paid',
      additionalInfo: { transaction: { payment_id: 'P-1', status: 'captured', value: '1.00' } },
    }).paidTransaction
    expect(transaction?.isPaid).toBe(true)
    expect(transaction?.value?.equals(Money.pln(100))).toBe(true)
    expect(parseRegisteredPayment({ additionalInfo: { transaction: [] } }).paidTransaction).toBeNull()
  })
})

describe('parseTransaction fees and URLs', () => {
  const fixture = (transaction: Record<string, unknown>): Record<string, unknown> => ({
    transaction: { id: 'x', value: '1.00', status: 'paid', ...transaction },
  })

  it('maps the commission and the URLs', () => {
    const transaction = parseTransaction(
      fixture({
        rate: 2,
        minimal_fee: 20,
        permanent_fee: 0,
        urls: {
          success: 'https://shop.example/ok',
          fail: 'https://shop.example/fail',
          ipn: 'https://shop.example/ipn',
        },
      }),
    )
    expect(transaction.rate).toBe('2')
    expect(transaction.minimalFee).toBe(20)
    expect(transaction.permanentFee).toBe(0)
    expect(transaction.urls).toEqual({
      success: 'https://shop.example/ok',
      fail: 'https://shop.example/fail',
      ipn: 'https://shop.example/ipn',
    })
  })

  it('reads fees from database strings and a missing IPN', () => {
    const transaction = parseTransaction(
      fixture({
        rate: '1.49',
        minimal_fee: '30',
        urls: { success: 'https://shop.example/ok', fail: '', ipn: null },
      }),
    )
    expect(transaction.rate).toBe('1.49')
    expect(transaction.minimalFee).toBe(30)
    expect(transaction.permanentFee).toBeNull()
    expect(transaction.urls?.fail).toBeNull()
    expect(transaction.urls?.ipn).toBeNull()
  })

  it('leaves missing or unparsable fees and URLs null', () => {
    const transaction = parseTransaction(fixture({ minimal_fee: 20.5, permanent_fee: '1.5', rate: true }))
    expect(transaction.rate).toBeNull()
    expect(transaction.minimalFee).toBeNull()
    expect(transaction.permanentFee).toBeNull()
    expect(transaction.urls).toBeNull()
    expect(parseTransaction(fixture({ rate: 1.5, minimal_fee: '-5' })).rate).toBe('1.5')
    expect(parseTransaction(fixture({ minimal_fee: '-5' })).minimalFee).toBe(-5)
  })
})
