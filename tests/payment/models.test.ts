import { describe, expect, it } from 'vitest'
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
