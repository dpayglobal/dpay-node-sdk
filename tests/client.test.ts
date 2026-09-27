import { describe, expect, it } from 'vitest'
import * as api from '../src/index.js'
import { DPayClient } from '../src/index.js'
import { MockHttpClient } from '../src/testing.js'

describe('DPayClient', () => {
  it('mounts all nine services', () => {
    const dpay = new DPayClient({ service: 's', secretHash: 'h' })
    const services = [
      'payments',
      'refunds',
      'banks',
      'blik',
      'cards',
      'payouts',
      'recurring',
      'events',
      'ipn',
    ] as const
    for (const name of services) {
      expect(dpay[name]).toBeDefined()
    }
  })

  it('defaults to the fetch transport and accepts a custom one', async () => {
    const transport = new MockHttpClient()
    transport.queueJson(200, { transaction: { id: 'tx-1', status: 'paid' } })
    const dpay = new DPayClient({ service: 's', secretHash: 'h', httpClient: transport })
    expect((await dpay.payments.details('tx-1')).isPaid).toBe(true)
  })

  it('verifies an IPN with the configured secret, without repeating it', () => {
    const dpay = new DPayClient({ service: 'test_service', secretHash: 'sekret-hash-123' })
    const body = JSON.stringify({
      id: 'tx-1',
      amount: '29.99',
      email: 'jan@example.com',
      type: 'transfer',
      attempt: 1,
      version: 2,
      custom: 'order-1',
      signature: '6493bb71d07d0cfee9ee0eea8f6af2a40beaac8b7e7b6b0b6d4b29e35801dd9d',
    })
    expect(dpay.ipn.constructEvent(body).id).toBe('tx-1')
  })

  it('exposes the SDK version', () => {
    expect(new DPayClient({ service: 's', secretHash: 'h' }).VERSION).toBe(api.SDK_VERSION)
  })
})

describe('public surface', () => {
  it('exports every name an integrator needs', () => {
    const expected = [
      'DPayClient',
      'SDK_VERSION',
      'Money',
      'Currency',
      'CardData',
      'CardEncryptor',
      'TransactionType',
      'TransactionStatus',
      'PayoutFeeMode',
      'BlikAliasType',
      'RedirectType',
      'DccDecision',
      'CardRecurringOperation',
      'CardRecurringFrequency',
      'RecurringModel',
      'RecurringMethod',
      'RecurringAliasStatus',
      'RecurringRetryStatus',
      'WebhookEventType',
      'WebhookTarget',
      'WebhookVerifier',
      'IpnType',
      'IPN_ACK',
      'constructIpnEvent',
      'readRawBody',
      'FetchHttpClient',
      'ApiResponse',
      'DPayError',
      'DPayValueError',
      'TransportError',
      'SignatureVerificationError',
      'CardEncryptionError',
      'ApiError',
      'AuthenticationError',
      'InvalidRequestError',
      'AccessDeniedError',
      'NotFoundError',
      'RateLimitError',
      'CardPaymentError',
      'PaymentRejectedError',
      'ApiServerError',
    ]
    for (const name of expected) {
      expect(api, `missing export: ${name}`).toHaveProperty(name)
    }
  })

  it('does not leak internals', () => {
    for (const name of [
      'ApiRequestor',
      'ChecksumCalculator',
      'phpStrval',
      'Config',
      'buildRegisterBody',
      'serializeWebhookTarget',
      'assertEventsAllowed',
    ]) {
      expect(api, `internal leaked: ${name}`).not.toHaveProperty(name)
    }
  })
})
