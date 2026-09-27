import { describe, expect, it } from 'vitest'
import { Config } from '../../src/config.js'
import { DPayValueError, PaymentRejectedError } from '../../src/errors.js'
import { ApiRequestor } from '../../src/internal/requestor.js'
import { Money } from '../../src/money.js'
import type { ReturnUrls } from '../../src/payment/params.js'
import { type RegisterPaymentParams, buildRegisterBody } from '../../src/payment/register-body.js'
import { PaymentService } from '../../src/payment/service.js'
import { RecurringModel } from '../../src/recurring/enums.js'
import type { RecurringRegistrationParams } from '../../src/recurring/params.js'
import { MockHttpClient } from '../../src/testing.js'
import { WebhookTarget } from '../../src/webhook/target.js'

/** Registration and charges of recurring payments, optional IPN, webhook target and reference (SDK 0.2.0). */
const build = (): { transport: MockHttpClient; payments: PaymentService } => {
  const transport = new MockHttpClient()
  const config = Config.fromOptions({
    service: 'sdk-test-service',
    secretHash: 'sdk-test-hash-0001',
    httpClient: transport,
  })
  return { transport, payments: new PaymentService(new ApiRequestor(config, transport)) }
}

const urls = (ipn: string | null = 'https://shop.example/ipn'): ReturnUrls => ({
  success: 'https://shop.example/ok',
  fail: 'https://shop.example/fail',
  ipn,
})

const registration: RecurringRegistrationParams = {
  label: 'Abonament',
  model: RecurringModel.O,
  termsUrl: 'https://shop.example/terms',
  alias: 'SUB-0001',
}

const internalProcessing = { error: false, msg: 'Internal processing', status: true, transactionId: 'TX' }

describe('recurring registration', () => {
  it('sends the object with the BLIK code, without IPN', async () => {
    const { transport, payments } = build()
    transport.queueJson(200, {
      ...internalProcessing,
      transactionId: 'TX-REG',
      additionalInfo: { recurring_registration: { alias: 'SUB-0001', methods: ['blik'] } },
    })

    const payment = await payments.register({
      amount: Money.pln(0),
      transactionType: 'transfers',
      urls: urls(null),
      blikCode: '777123',
      userAgent: 'Mozilla/5.0',
      userIp: '83.238.17.42',
      recurringRegistration: registration,
    })

    const body = transport.lastRequestBody
    expect(body).not.toHaveProperty('url_ipn')
    expect(body).not.toHaveProperty('register_blik_recurring_alias')
    expect(body.recurring_registration).toEqual({
      label: 'Abonament',
      alias: 'SUB-0001',
      model: 'O',
      terms_url: 'https://shop.example/terms',
    })
    expect(body.blik_code).toBe('777123')
    // Without IPN: an empty last segment, and a registration keeps the alias out of the checksum
    expect(body.checksum).toBe('b5dbca75c515bc76094dba4d2853493bf050bfcd47c25bc899361884080f3544')
    expect(payment.recurringAlias).toBe('SUB-0001')
    expect(payment.recurringMethods).toEqual(['blik'])
    expect(payment.isInternalProcessing).toBe(true)
  })

  it('is rejected without the BLIK code before anything is sent', () => {
    expect(() =>
      buildRegisterBody('sdk-test-service', {
        amount: Money.pln(0),
        transactionType: 'transfers',
        urls: urls(),
        recurringRegistration: registration,
      }),
    ).toThrow(/BLIK code/)
  })

  it('exposes the decline description of an immediate BLIK rejection', async () => {
    const { transport, payments } = build()
    transport.queueJson(200, {
      error: true,
      msg: 'Transaction canceled',
      status: false,
      transactionId: 'TX-REG',
      additionalInfo: { error: 'INSUFFICIENT_FUNDS', error_description: 'IssId: 1' },
    })
    const error = await payments
      .register({
        amount: Money.pln(0),
        transactionType: 'transfers',
        urls: urls(null),
        blikCode: '777123',
        userAgent: 'Mozilla/5.0',
        userIp: '83.238.17.42',
        recurringRegistration: registration,
      })
      .catch((caught) => caught)
    expect(error).toBeInstanceOf(PaymentRejectedError)
    expect(error.errorCode).toBe('INSUFFICIENT_FUNDS')
    expect(error.errorDescription).toBe('IssId: 1')
    expect(error.transactionId).toBe('TX-REG')
  })
})

describe('recurring charge', () => {
  it('binds the alias in the checksum', async () => {
    const { transport, payments } = build()
    transport.queueJson(200, { ...internalProcessing, transactionId: 'TX-CHG' })

    await payments.register({
      amount: Money.pln(4999),
      transactionType: 'transfers',
      urls: urls(),
      recurringAlias: 'SUB-0001',
      description: 'Abonament 10/2026',
    })

    const body = transport.lastRequestBody
    expect(body.recurring_alias).toBe('SUB-0001')
    expect(body).not.toHaveProperty('user_ip')
    // sha256(service|hash|value|url_success|url_fail|url_ipn|recurring_alias)
    expect(body.checksum).toBe('96b80b9bceab99b92228bc8bd793b432b1594484ac45dc2715d2ebd542f3b2aa')
  })

  it('keeps the empty IPN segment without IPN and sends the client context', async () => {
    const { transport, payments } = build()
    transport.queueJson(200, { ...internalProcessing, transactionId: 'TX-CHG' })

    await payments.register({
      amount: Money.pln(4999),
      transactionType: 'transfers',
      urls: urls(null),
      recurringAlias: 'SUB-0001',
      userAgent: 'Mozilla/5.0',
      userIp: '83.238.17.42',
    })

    const body = transport.lastRequestBody
    expect(body.user_ip).toBe('83.238.17.42')
    expect(body.user_agent).toBe('Mozilla/5.0')
    expect(body.checksum).toBe('b521018f255bab928187d73802d2dd79c48dda4c6574d1f57e7395cda70a8e5c')
  })

  it('validates the IP of the client context', () => {
    for (const userIp of ['not-an-ip', '256.1.1.1', 'fe80::1%eth0']) {
      expect(() =>
        buildRegisterBody('s', {
          amount: Money.pln(4999),
          transactionType: 'transfers',
          urls: urls(),
          recurringAlias: 'SUB-0001',
          userAgent: 'Mozilla/5.0',
          userIp,
        }),
      ).toThrow(`Invalid user IP "${userIp}"`)
    }
    expect(() =>
      buildRegisterBody('s', {
        amount: Money.pln(4999),
        transactionType: 'transfers',
        urls: urls(),
        recurringAlias: 'SUB-0001',
        userAgent: 'Mozilla/5.0',
        userIp: '2001:db8::1',
      }),
    ).not.toThrow()
  })

  it('cannot carry a BLIK code, a zero amount or another transaction type', () => {
    const invalid: RegisterPaymentParams[] = [
      {
        amount: Money.pln(4999),
        transactionType: 'transfers',
        urls: urls(),
        blikCode: '777123',
        userAgent: 'Mozilla/5.0',
        userIp: '83.238.17.42',
        recurringAlias: 'SUB-0001',
      },
      { amount: Money.pln(0), transactionType: 'transfers', urls: urls(), recurringAlias: 'SUB-0001' },
      {
        amount: Money.pln(4999),
        transactionType: 'card_recurring',
        urls: urls(),
        recurringAlias: 'SUB-0001',
      },
    ]
    const messages = [
      'blik_code cannot be combined with a recurring payment',
      'A recurring charge requires an amount above 0',
      'Recurring payments require transactionType "transfers"',
    ]
    invalid.forEach((params, index) => {
      expect(() => buildRegisterBody('s', params)).toThrow(messages[index])
    })
  })

  it('rejects the other combinations a recurring payment excludes', () => {
    const charge: RegisterPaymentParams = {
      amount: Money.pln(4999),
      transactionType: 'transfers',
      urls: urls(),
      recurringAlias: 'SUB-0001',
    }
    expect(() => buildRegisterBody('s', { ...charge, recurringRegistration: registration })).toThrow(
      'recurring_registration cannot be combined with recurring_alias',
    )
    expect(() => buildRegisterBody('s', { ...charge, cardRecurringAlias: 'card-1' })).toThrow(
      'card_recurring_alias cannot be combined with a recurring payment',
    )
    expect(() => buildRegisterBody('s', { ...charge, registerCardRecurring: { label: 'Mandat' } })).toThrow(
      'register_card_recurring cannot be combined with a recurring payment',
    )
    expect(() =>
      buildRegisterBody('s', { ...charge, blikAlias: 'a-1', userAgent: 'u', userIp: '10.0.0.1' }),
    ).toThrow('blik_alias cannot be combined with blik_code, alias registration or recurring payments')
    expect(() => buildRegisterBody('s', { ...charge, recurringAlias: '' })).toThrow(
      'Recurring alias must be 1-128 characters',
    )
    expect(() => buildRegisterBody('s', { ...charge, recurringAlias: 'x'.repeat(129) })).toThrow(
      DPayValueError,
    )

    const registering: RegisterPaymentParams = {
      amount: Money.pln(0),
      transactionType: 'transfers',
      urls: urls(),
      blikCode: '777123',
      userAgent: 'Mozilla/5.0',
      userIp: '83.238.17.42',
      recurringRegistration: registration,
    }
    expect(() => buildRegisterBody('s', { ...registering, channel: '86' })).toThrow(
      'channel cannot be combined with a recurring payment',
    )
    expect(() => buildRegisterBody('s', { ...registering, registerBlikAlias: { label: 'l' } })).toThrow(
      'register_blik_alias cannot be combined with a recurring payment',
    )
  })
})

describe('webhook and reference', () => {
  it('stay out of the checksum', async () => {
    const { transport, payments } = build()
    transport.queueJson(200, {
      error: false,
      msg: 'https://secure.dpay.pl/transfer@pay@TX',
      status: true,
      transactionId: 'TX',
    })

    await payments.register({
      amount: Money.pln(1000),
      transactionType: 'transfers',
      urls: urls(),
      webhook: WebhookTarget.create('https://shop.example/webhooks', ['payment.succeeded', 'payment.failed']),
      reference: 'order-1234',
    })

    const body = transport.lastRequestBody
    expect(body.webhook).toEqual({
      url: 'https://shop.example/webhooks',
      events: ['payment.succeeded', 'payment.failed'],
    })
    expect(body.reference).toBe('order-1234')
    expect(Object.keys(body).slice(-3)).toEqual(['webhook', 'reference', 'checksum'])
    expect(body.checksum).toBe('0a163ad60b5d2fd09eacce0032cc4d584e707c457051d2c4365b320dc340bc28')
  })

  it('accepts only the events of a payment in the webhook', () => {
    expect(() =>
      buildRegisterBody('s', {
        amount: Money.pln(1000),
        transactionType: 'transfers',
        urls: urls(),
        webhook: WebhookTarget.create('https://shop.example/webhooks', ['payout.paid']),
      }),
    ).toThrow('Event "payout.paid" is not allowed in the webhook object of a payment registration')
  })

  it('trims the reference and rejects control characters or more than 64 characters', () => {
    const params: RegisterPaymentParams = {
      amount: Money.pln(1000),
      transactionType: 'transfers',
      urls: urls(),
    }
    expect(buildRegisterBody('s', { ...params, reference: '  order-1 \n' }).reference).toBe('order-1')
    expect(buildRegisterBody('s', { ...params, reference: 'ż'.repeat(64) }).reference).toBe('ż'.repeat(64))
    for (const reference of ['   ', 'order\u0000-1', 'order\t1', 'x'.repeat(65)]) {
      expect(() => buildRegisterBody('s', { ...params, reference })).toThrow(
        'Reference must be 1-64 characters without control characters',
      )
    }
  })
})
