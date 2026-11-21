import { describe, expect, it } from 'vitest'
import { Money } from '../../src/money.js'
import { type WebhookEvent, parseWebhookEvent } from '../../src/webhook/event.js'
import {
  DeclineCode,
  FailureCategory,
  PaymentObjectStatus,
  PayoutObjectStatus,
  RecurringCanceledBy,
  RecurringPaymentStatus,
  RecurringSequence,
  RefundObjectStatus,
  parsePaymentObject,
} from '../../src/webhook/objects.js'

/** Typed `data.object` models of webhook events (payloads as in the webhook documentation and the API). */
const event = (type: string, object: Record<string, unknown>): WebhookEvent =>
  parseWebhookEvent({
    id: 'evt_01k6a8q2m4pz7h8c3v5n9t2x6y',
    type,
    api_version: '2026-10-01',
    created: '2026-09-27T10:05:00Z',
    livemode: true,
    service: 'abc123',
    data: { object },
  })

describe('typed webhook objects', () => {
  it('reads payment.succeeded', () => {
    const succeeded = event('payment.succeeded', {
      object: 'payment',
      id: '8F2A11C4-5B6D-4E7F-8A9B-0C1D2E3F4A5B',
      status: 'succeeded',
      amount: 14900,
      currency: 'PLN',
      amount_refunded: 0,
      amount_captured: 0,
      description: 'Order 2026/09/123',
      created: '2026-09-27T10:03:12Z',
      paid_at: '2026-09-27T10:05:00Z',
      payment_method: { type: 'blik', blik: { flow: 'code' } },
      failure: null,
      recurring: null,
      references: { merchant: '2026/09/123', provider: '1234567890' },
      custom: 'order-789',
    })
    const payment = succeeded.payment

    expect(succeeded.refund).toBeNull()
    expect(succeeded.recurringPayment).toBeNull()
    expect(succeeded.payout).toBeNull()
    expect(payment?.id).toBe('8F2A11C4-5B6D-4E7F-8A9B-0C1D2E3F4A5B')
    expect(payment?.status).toBe(PaymentObjectStatus.SUCCEEDED)
    expect(payment?.amount.equals(Money.pln(14900))).toBe(true)
    expect(payment?.amountRefunded.equals(Money.pln(0))).toBe(true)
    expect(payment?.amountCaptured.minor).toBe(0)
    expect(payment?.description).toBe('Order 2026/09/123')
    expect(payment?.created).toBe('2026-09-27T10:03:12Z')
    expect(payment?.paidAt).toBe('2026-09-27T10:05:00Z')
    expect(payment?.paymentMethodType).toBe('blik')
    expect(payment?.paymentMethod).toEqual({ type: 'blik', blik: { flow: 'code' } })
    expect(payment?.failure).toBeNull()
    expect(payment?.isRecurring).toBe(false)
    expect(payment?.recurringAlias).toBeNull()
    expect(payment?.merchantReference).toBe('2026/09/123')
    expect(payment?.providerReference).toBe('1234567890')
    expect(payment?.custom).toBe('order-789')
    expect(Object.isFrozen(payment)).toBe(true)
  })

  it('reads a failed recurring charge in euro', () => {
    const payment = event('payment.failed', {
      object: 'payment',
      id: 'P-2',
      status: 'failed',
      amount: 4999,
      currency: 'EUR',
      amount_refunded: 0,
      amount_captured: 0,
      description: null,
      created: '2026-10-01T08:00:00Z',
      paid_at: null,
      payment_method: null,
      failure: {
        code: 'insufficient_funds',
        message: 'Insufficient funds',
        category: 'customer',
        retryable: true,
        provider_code: 'INSUFFICIENT_FUNDS',
      },
      recurring: { alias: 'SUB-0001', registration: 'P-1', sequence: 'subsequent' },
      references: { merchant: null, provider: null },
      custom: null,
    }).payment

    expect(payment?.status).toBe(PaymentObjectStatus.FAILED)
    expect(payment?.amount.equals(Money.of(4999, 'EUR'))).toBe(true)
    expect(payment?.paidAt).toBeNull()
    expect(payment?.paymentMethodType).toBeNull()
    expect(payment?.merchantReference).toBeNull()
    expect(payment?.isRecurring).toBe(true)
    expect(payment?.recurringAlias).toBe('SUB-0001')
    expect(payment?.recurringRegistration).toBe('P-1')
    expect(payment?.recurringSequence).toBe(RecurringSequence.SUBSEQUENT)
    expect(payment?.failure).toMatchObject({
      code: DeclineCode.INSUFFICIENT_FUNDS,
      message: 'Insufficient funds',
      category: FailureCategory.CUSTOMER,
      isRetryable: true,
      providerCode: 'INSUFFICIENT_FUNDS',
    })
  })

  it('reads refund.failed', () => {
    const refund = event('refund.failed', {
      object: 'refund',
      id: null,
      payment: '8F2A11C4-5B6D-4E7F-8A9B-0C1D2E3F4A5B',
      status: 'failed',
      amount: 2000,
      currency: 'PLN',
      created: '2026-10-01T08:00:00Z',
      succeeded_at: null,
      failure: {
        code: 'refund_window_expired',
        message: 'The refund period has expired',
        category: 'merchant',
        retryable: false,
        provider_code: null,
      },
    }).refund

    expect(refund?.id).toBeNull()
    expect(refund?.payment).toBe('8F2A11C4-5B6D-4E7F-8A9B-0C1D2E3F4A5B')
    expect(refund?.status).toBe(RefundObjectStatus.FAILED)
    expect(refund?.amount.minor).toBe(2000)
    expect(refund?.currency).toBe('PLN')
    expect(refund?.created).toBe('2026-10-01T08:00:00Z')
    expect(refund?.succeededAt).toBeNull()
    expect(refund?.failure?.code).toBe(DeclineCode.REFUND_WINDOW_EXPIRED)
    expect(refund?.failure?.category).toBe(FailureCategory.MERCHANT)
    expect(refund?.failure?.isRetryable).toBe(false)
    expect(refund?.failure?.providerCode).toBeNull()
  })

  it('reads recurring_payment.canceled', () => {
    const recurring = event('recurring_payment.canceled', {
      object: 'recurring_payment',
      id: 'P-1',
      alias: 'SUB-0001',
      status: 'canceled',
      canceled_by: 'customer',
      payment_method: { type: 'blik', blik: { flow: 'recurring' } },
      terms: {
        model: 'A',
        frequency: '1M',
        limit_amount: 5999,
        total_limit_amount: 71988,
        starts_on: '2026-11-01',
        expires_on: '2027-09-30',
      },
      created: '2026-09-26T10:00:00Z',
    }).recurringPayment

    expect(recurring?.id).toBe('P-1')
    expect(recurring?.alias).toBe('SUB-0001')
    expect(recurring?.status).toBe(RecurringPaymentStatus.CANCELED)
    expect(recurring?.canceledBy).toBe(RecurringCanceledBy.CUSTOMER)
    expect(recurring?.paymentMethodType).toBe('blik')
    expect(recurring?.model).toBe('A')
    expect(recurring?.frequency).toBe('1M')
    expect(recurring?.limitAmount).toBe(5999)
    expect(recurring?.totalLimitAmount).toBe(71988)
    expect(recurring?.startsOn).toBe('2026-11-01')
    expect(recurring?.expiresOn).toBe('2027-09-30')
    expect(recurring?.created).toBe('2026-09-26T10:00:00Z')
  })

  it('reads a model O recurring payment without limits', () => {
    const recurring = event('recurring_payment.activated', {
      object: 'recurring_payment',
      id: 'P-1',
      alias: 'SUB-0002',
      status: 'active',
      canceled_by: null,
      payment_method: null,
      terms: {
        model: 'O',
        frequency: null,
        limit_amount: null,
        total_limit_amount: '100',
        starts_on: null,
        expires_on: null,
      },
      created: '2026-09-26T10:00:00Z',
    }).recurringPayment

    expect(recurring?.status).toBe(RecurringPaymentStatus.ACTIVE)
    expect(recurring?.canceledBy).toBeNull()
    expect(recurring?.limitAmount).toBeNull()
    expect(recurring?.totalLimitAmount).toBeNull()
    expect(recurring?.frequency).toBeNull()
    expect(recurring?.paymentMethodType).toBeNull()
  })

  it('reads payout.failed', () => {
    const payout = event('payout.failed', {
      object: 'payout',
      id: '12345',
      status: 'failed',
      amount: 2715,
      fee: 306,
      currency: 'PLN',
      bank_account: { last4: '2874' },
      created: '2026-08-01T08:00:00Z',
      paid_at: null,
      failure: {
        code: 'payout_failed',
        message: 'The payout could not be completed',
        category: 'merchant',
        retryable: false,
        provider_code: 'RETURNED',
      },
    }).payout

    expect(payout?.id).toBe('12345')
    expect(payout?.status).toBe(PayoutObjectStatus.FAILED)
    expect(payout?.amount.minor).toBe(2715)
    expect(payout?.fee.minor).toBe(306)
    expect(payout?.bankAccountLast4).toBe('2874')
    expect(payout?.paidAt).toBeNull()
    expect(payout?.failure?.code).toBe(DeclineCode.PAYOUT_FAILED)
    expect(payout?.failure?.providerCode).toBe('RETURNED')
  })

  it('has no typed object for the test event', () => {
    const test = event('webhook.test', { object: 'webhook_endpoint', id: 'we_1' })
    expect(test.payment).toBeNull()
    expect(test.refund).toBeNull()
    expect(test.recurringPayment).toBeNull()
    expect(test.payout).toBeNull()
    expect(test.objectType).toBe('webhook_endpoint')
  })

  it('falls back for missing fields', () => {
    const payment = parsePaymentObject({ object: 'payment', currency: 'xx', failure: { code: '' } })
    expect(payment.id).toBe('')
    expect(payment.currency).toBe('PLN')
    expect(payment.amount.minor).toBe(0)
    expect(payment.failure?.code).toBe(DeclineCode.GENERIC_DECLINE)
    expect(payment.failure?.isRetryable).toBe(false)
    expect(payment.failure?.category).toBeNull()
    expect(
      parsePaymentObject({ amount: '14900', id: 7, failure: { retryable: 'true', provider_code: 51 } }),
    ).toMatchObject({
      id: '7',
      amount: Money.pln(0),
      failure: { isRetryable: false, providerCode: '51' },
    })
  })

  it('lists the decline catalog and the failure categories', () => {
    const codes = Object.values(DeclineCode)
    expect(codes).toHaveLength(22)
    expect(new Set(codes).size).toBe(22)
    expect(codes[0]).toBe('insufficient_funds')
    expect(codes.at(-1)).toBe('processing_error')
    expect(Object.values(FailureCategory)).toEqual(['customer', 'merchant', 'risk', 'system'])
  })
})
