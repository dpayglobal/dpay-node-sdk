import { describe, expect, it } from 'vitest'
import { Config } from '../../src/config.js'
import { InvalidRequestError } from '../../src/errors.js'
import { ApiRequestor } from '../../src/internal/requestor.js'
import { RecurringAliasStatus } from '../../src/recurring/enums.js'
import { parseRecurringRetryResult, parseRecurringStatus } from '../../src/recurring/models.js'
import { RecurringService } from '../../src/recurring/service.js'
import { MockHttpClient } from '../../src/testing.js'

const TRANSACTION_ID = 'A75AEBB4-4B89-4834-AD43-EF442C133769'

const build = (): { transport: MockHttpClient; recurring: RecurringService } => {
  const transport = new MockHttpClient()
  const config = Config.fromOptions({
    service: 'sdk-test-service',
    secretHash: 'sdk-test-hash-0001',
    httpClient: transport,
  })
  return { transport, recurring: new RecurringService(new ApiRequestor(config, transport)) }
}

describe('RecurringService.status', () => {
  it('returns the alias and the terms', async () => {
    const { transport, recurring } = build()
    transport.queueJson(200, {
      status: 'success',
      data: {
        alias: 'SUB-0001',
        method: 'blik',
        status: 'ACTIVE',
        expiration_date: '2027-09-30',
        registration: {
          transaction_id: TRANSACTION_ID,
          label: 'Abonament',
          model: 'A',
          frequency: '1M',
          limit_amt: 5999,
          tot_limit_amt: 71988,
          is_limit_amt_fixed: true,
          init_date: '2026-11-01',
          terms_url: 'https://shop.example/terms',
          terms_version: '2026-09',
          registered_at: '2026-09-26T12:00:00+02:00',
        },
      },
    })

    const status = await recurring.status('SUB-0001')

    expect(transport.lastRequest.url).toBe('https://api-payments.dpay.pl/api/v1_0/payments/recurring/status')
    expect(transport.lastRequestBody).toEqual({
      service: 'sdk-test-service',
      alias: 'SUB-0001',
      // sha256(service|hash|alias)
      checksum: '01e38925de1ceefbfbaffdf84a917f1c95123403a0e51a7d74cb81f227c3e3ef',
    })
    expect(status.isActive).toBe(true)
    expect(status.status).toBe(RecurringAliasStatus.ACTIVE)
    expect(status.method).toBe('blik')
    expect(status.expirationDate).toBe('2027-09-30')
    expect(status.registration).toMatchObject({
      transactionId: TRANSACTION_ID,
      limitAmt: 5999,
      totLimitAmt: 71988,
      isLimitAmtFixed: true,
      termsUrl: 'https://shop.example/terms',
      termsVersion: '2026-09',
      registeredAt: '2026-09-26T12:00:00+02:00',
    })
    expect(Object.isFrozen(status)).toBe(true)
    expect(Object.isFrozen(status.registration)).toBe(true)
  })

  it('reads limits sent as digit strings and drops everything else', () => {
    const status = parseRecurringStatus({
      alias: 'SUB-2',
      status: 'UNREGISTERED',
      registration: { limit_amt: '100', tot_limit_amt: '1.5', is_limit_amt_fixed: 'true' },
    })
    expect(status.isActive).toBe(false)
    expect(status.registration?.limitAmt).toBe(100)
    expect(status.registration?.totLimitAmt).toBeNull()
    expect(status.registration?.isLimitAmtFixed).toBeNull()

    const broken = parseRecurringStatus({ registration: 'nope', status: 7 })
    expect(broken.alias).toBe('')
    expect(broken.status).toBeNull()
    expect(broken.registration).toBeNull()
  })
})

describe('RecurringService.cancel', () => {
  it('signs the operation, so a status checksum cannot cancel', async () => {
    const { transport, recurring } = build()
    transport.queueJson(200, { status: 'success', data: { alias: 'SUB-0001', status: 'UNREGISTERED' } })

    const status = await recurring.cancel('SUB-0001', { reason: 'Rezygnacja' })

    expect(status).toBe(RecurringAliasStatus.UNREGISTERED)
    expect(transport.lastRequest.url).toBe('https://api-payments.dpay.pl/api/v1_0/payments/recurring/cancel')
    expect(transport.lastRequestBody).toEqual({
      service: 'sdk-test-service',
      alias: 'SUB-0001',
      reason: 'Rezygnacja',
      // sha256(service|hash|alias|cancel)
      checksum: '848c236b3060a94c2ed14c150de154ee7aa2d64ec3682771259c30321cadf82b',
    })
  })

  it('sends no reason by default and falls back to UNREGISTERED', async () => {
    const { transport, recurring } = build()
    transport.queueJson(200, { status: 'success', data: {} })
    expect(await recurring.cancel('SUB-0001')).toBe('UNREGISTERED')
    expect(Object.keys(transport.lastRequestBody)).toEqual(['service', 'alias', 'checksum'])
  })
})

describe('RecurringService.retry', () => {
  it('returns the pending retry', async () => {
    const { transport, recurring } = build()
    transport.queueJson(200, {
      status: 'success',
      data: { transactionId: TRANSACTION_ID, retry: { status: 'pending', count: 1 } },
    })

    const result = await recurring.retry(TRANSACTION_ID)

    expect(transport.lastRequest.url).toBe('https://api-payments.dpay.pl/api/v1_0/payments/recurring/retry')
    expect(transport.lastRequestBody).toEqual({
      service: 'sdk-test-service',
      transaction_id: TRANSACTION_ID,
      // sha256(service|hash|transaction_id)
      checksum: '00bceec5fca2ee4c3a1737156df376441d225790eb61ca47fcbe9cba7243a77d',
    })
    expect(result.isPending).toBe(true)
    expect(result.isFailed).toBe(false)
    expect(result.count).toBe(1)
    expect(result.transactionId).toBe(TRANSACTION_ID)
  })

  it('treats a retry declined at once as a result, not an error', async () => {
    const { transport, recurring } = build()
    transport.queueJson(200, {
      status: 'success',
      data: {
        transactionId: TRANSACTION_ID,
        retry: { status: 'failed', count: 2, error: 'INSUFFICIENT_FUNDS', error_description: 'IssId: 1' },
      },
    })

    const result = await recurring.retry(TRANSACTION_ID)

    expect(result.isFailed).toBe(true)
    expect(result.errorCode).toBe('INSUFFICIENT_FUNDS')
    expect(result.errorDescription).toBe('IssId: 1')
  })

  it('carries the reason when the charge cannot be retried', async () => {
    const { transport, recurring } = build()
    transport.queueJson(400, {
      status: 'failed',
      message: 'Recurring charge cannot be retried (DECLINE_NOT_RETRYABLE).',
      errors: { retry: 'DECLINE_NOT_RETRYABLE', decline_reason: 'SEC_DECLINED' },
    })

    const error = await recurring.retry(TRANSACTION_ID).catch((caught) => caught)

    expect(error).toBeInstanceOf(InvalidRequestError)
    expect(error.httpStatus).toBe(400)
    expect(error.fieldErrors.retry).toEqual(['DECLINE_NOT_RETRYABLE'])
  })

  it('stringifies a scalar transaction id and ignores a malformed retry block', () => {
    const result = parseRecurringRetryResult({ transactionId: 42, retry: 'nope' })
    expect(result.transactionId).toBe('42')
    expect(result.status).toBeNull()
    expect(result.count).toBeNull()
    expect(parseRecurringRetryResult({}).transactionId).toBe('')
  })
})
