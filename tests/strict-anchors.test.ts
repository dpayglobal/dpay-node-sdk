import { describe, expect, it } from 'vitest'
import { CardData } from '../src/card/card-data.js'
import { serializeCardRecurringRegistration } from '../src/card/recurring-params.js'
import { Config } from '../src/config.js'
import { isValidCurrency } from '../src/currency.js'
import { DPayValueError, SignatureVerificationError } from '../src/errors.js'
import { PANEL } from '../src/internal/base-urls.js'
import { decodeRecordOrFail } from '../src/internal/operation.js'
import { ApiRequestor } from '../src/internal/requestor.js'
import { Money } from '../src/money.js'
import { parseTransaction } from '../src/payment/models.js'
import { isValidPolishIban, serializeInvoice } from '../src/payment/params.js'
import { type RegisterPaymentParams, buildRegisterBody } from '../src/payment/register-body.js'
import { RecurringModel } from '../src/recurring/enums.js'
import { serializeRecurringRegistration } from '../src/recurring/params.js'
import { RefundService } from '../src/refund/service.js'
import { MockHttpClient } from '../src/testing.js'
import { EventService } from '../src/webhook/service.js'
import { WebhookVerifier } from '../src/webhook/verifier.js'

/**
 * Every validation pattern must match the whole string: a trailing "\n" (PHP `$` without `D`, Python `re.match`
 * with `$`) or a Unicode digit must not pass. JavaScript `^...$` without the `m` flag is already absolute and `\d`
 * is ASCII - these vectors keep it that way.
 */
const requestor = (transport = new MockHttpClient()): ApiRequestor =>
  new ApiRequestor(Config.fromOptions({ service: 's', secretHash: 'h', httpClient: transport }), transport)

const urls = { success: 'https://shop.test/ok', fail: 'https://shop.test/fail', ipn: 'https://shop.test/ipn' }
const register = (params: Partial<RegisterPaymentParams>): Record<string, unknown> =>
  buildRegisterBody('s', {
    amount: Money.pln(1000),
    transactionType: 'transfers',
    urls,
    ...params,
  } as RegisterPaymentParams)

const card = { pan: '4111111111111111', cvv: '123', expiry: '12/30' }

describe('validation patterns match the whole string', () => {
  it('rejects a request header name with a trailing newline', async () => {
    const transport = new MockHttpClient()
    const operation = {
      method: 'POST' as const,
      host: PANEL,
      path: '/x',
      body: {},
      headers: { 'X-Id\n': 'v' },
      parse: decodeRecordOrFail,
    }
    await expect(requestor(transport).execute(operation)).rejects.toThrow(
      new DPayValueError('Invalid request header "X-Id\n"'),
    )
    expect(transport.requests).toHaveLength(0)
  })

  it('rejects the refund message ID "RET\\n" with the message ID error', async () => {
    const transport = new MockHttpClient()
    const refunds = new RefundService(requestor(transport))
    await expect(refunds.create({ transactionId: 'TX-1', messageId: 'RET\n' })).rejects.toThrow(
      new DPayValueError('Refund message ID must be non-empty printable ASCII'),
    )
  })

  it.each([
    [{ ...card, pan: '4111111111111111\n' }, 'Card number must be 12-19 digits'],
    [{ ...card, pan: '４１１１１１１１１１１１１１１１' }, 'Card number must be 12-19 digits'],
    [{ ...card, cvv: '123\n' }, 'CVV must be 3-4 digits'],
    [{ ...card, cvv: '١٢٣' }, 'CVV must be 3-4 digits'],
    [{ ...card, expiry: '12/30\n' }, 'Expiry must be in MM/YY format'],
  ])('rejects card data %j', (params, message) => {
    expect(() => new CardData(params)).toThrow(new DPayValueError(message))
  })

  it('rejects dates, frequency, partner platform and BLIK code with a trailing newline', () => {
    expect(() => serializeCardRecurringRegistration({ label: 'x', initDate: '2026-12-01\n' })).toThrow(
      new DPayValueError('Date "2026-12-01\n" must be in YYYY-MM-DD format'),
    )
    const recurring = { label: 'x', model: RecurringModel.A, termsUrl: 'https://shop.test/terms' }
    expect(() => serializeRecurringRegistration({ ...recurring, initDate: '2026-12-01\n' })).toThrow(
      new DPayValueError('Date "2026-12-01\n" must be in YYYY-MM-DD format'),
    )
    expect(() => serializeRecurringRegistration({ ...recurring, frequency: '1M\n' })).toThrow(
      new DPayValueError('Invalid recurring frequency "1M\n"'),
    )
    expect(() => serializeInvoice({ paymentDueDate: '2026-12-01\n' })).toThrow(
      new DPayValueError('Payment due date must be in YYYY-MM-DD format'),
    )
    expect(() => serializeInvoice({ paymentDueDate: '２０２６-12-01' })).toThrow(DPayValueError)
    expect(() => register({ partnerPlatform: 'SHOPER\n' })).toThrow(
      new DPayValueError('Partner platform must match ^[A-Z0-9]{1,64}$'),
    )
    expect(() => register({ blikCode: '123456\n', userAgent: 'u', userIp: '127.0.0.1' })).toThrow(
      new DPayValueError('BLIK code must be exactly 6 digits'),
    )
  })

  it('rejects money amounts and currencies with a trailing newline', () => {
    expect(() => Money.fromDecimal('10.00\n', 'PLN')).toThrow(
      new DPayValueError('Invalid money amount "10.00\n"'),
    )
    expect(() => Money.fromDecimal('１0.00', 'PLN')).toThrow(DPayValueError)
    expect(Money.tryFromApiNumber('10.00\n', 'PLN')).toBeNull()
    expect(isValidCurrency('PLN\n')).toBe(false)
    expect(isValidCurrency('PLN')).toBe(true)
  })

  it('removes the whitespace of an IBAN before the pattern, so a trailing newline still passes', () => {
    expect(isValidPolishIban('PL61109010140000071219812874\n')).toBe(true)
    expect(isValidPolishIban('PL6110901014000007121981287４')).toBe(false)
  })

  it('rejects starting_after with a trailing newline', async () => {
    const transport = new MockHttpClient()
    const events = new EventService(requestor(transport))
    await expect(events.list({ startingAfter: 'evt_01k6a8q2m4pz7h8c3v5n9t2x6y\n' })).rejects.toThrow(
      new DPayValueError('starting_after must be an event id (evt_...)'),
    )
    expect(transport.requests).toHaveLength(0)
  })

  it('rejects a webhook-timestamp header with a trailing newline', () => {
    const headers = {
      'webhook-id': 'evt_1',
      'webhook-timestamp': '1790503500\n',
      'webhook-signature': 'v1,x',
    }
    expect(() => WebhookVerifier.verify('{}', headers, 'whsec_ZHBheQ==', { now: 1790503500 })).toThrow(
      new SignatureVerificationError('Invalid webhook-timestamp header'),
    )
  })

  it('reads transaction fees only from an integer or a whole-string integer', () => {
    const transaction = parseTransaction({ transaction: { minimal_fee: '30\n', permanent_fee: '30' } })
    expect(transaction.minimalFee).toBeNull()
    expect(transaction.permanentFee).toBe(30)
    expect(parseTransaction({ transaction: { minimal_fee: '٣٠' } }).minimalFee).toBeNull()
  })
})
