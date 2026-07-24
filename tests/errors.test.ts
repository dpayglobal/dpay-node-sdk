import { describe, expect, it } from 'vitest'
import {
  ApiError,
  AuthenticationError,
  CardPaymentError,
  DPayError,
  DPayValueError,
  PaymentRejectedError,
  RateLimitError,
  TransportError,
} from '../src/errors.js'

describe('error hierarchy', () => {
  it('roots every error at DPayError', () => {
    expect(new DPayValueError('x')).toBeInstanceOf(DPayError)
    expect(new TransportError('x')).toBeInstanceOf(DPayError)
    expect(new AuthenticationError('x', 401)).toBeInstanceOf(ApiError)
    expect(new AuthenticationError('x', 401)).toBeInstanceOf(DPayError)
  })

  it('sets name and message like a native Error', () => {
    const error = new AuthenticationError('bad checksum', 401)
    expect(error.name).toBe('AuthenticationError')
    expect(error.message).toBe('bad checksum')
    expect(error.stack).toContain('AuthenticationError')
  })

  it('carries a discriminating type for switch narrowing', () => {
    expect(new DPayValueError('x').type).toBe('value_error')
    expect(new TransportError('x').type).toBe('transport_error')
    expect(new AuthenticationError('x', 401).type).toBe('authentication_error')
    expect(new ApiError('x', 418).type).toBe('api_error')
  })

  it('preserves cause on TransportError', () => {
    const cause = new Error('ECONNRESET')
    expect(new TransportError('network failure', { cause }).cause).toBe(cause)
  })

  it('exposes API error details', () => {
    const error = new ApiError('nope', 400, 'err01', { value: ['required'] }, '{"a":1}')
    expect(error.httpStatus).toBe(400)
    expect(error.errorCode).toBe('err01')
    expect(error.fieldErrors).toEqual({ value: ['required'] })
    expect(error.rawBody).toBe('{"a":1}')
  })

  it('defaults fieldErrors to an empty object', () => {
    expect(new ApiError('nope', 500).fieldErrors).toEqual({})
    expect(new ApiError('nope', 500).errorCode).toBeNull()
  })

  it('reads rate limit metadata', () => {
    const error = new RateLimitError('slow down', 429, 30, 100, 0, '')
    expect(error.retryAfter).toBe(30)
    expect(error.limit).toBe(100)
    expect(error.remaining).toBe(0)
  })
})

describe('PaymentRejectedError.fromApi', () => {
  it('extracts message, error code and transaction id', () => {
    const error = PaymentRejectedError.fromApi({
      error: true,
      msg: 'Rejected',
      transactionId: 'tx-1',
      additionalInfo: { error: 'BLIK_DECLINED' },
    })
    expect(error.message).toBe('Rejected')
    expect(error.errorCode).toBe('BLIK_DECLINED')
    expect(error.transactionId).toBe('tx-1')
    expect(error.httpStatus).toBe(200)
  })

  it('falls back when fields are missing or wrongly typed', () => {
    const error = PaymentRejectedError.fromApi({ error: true, msg: 42, additionalInfo: 'nope' })
    expect(error.message).toBe('Payment rejected')
    expect(error.errorCode).toBeNull()
    expect(error.transactionId).toBeNull()
  })

  it('stringifies a scalar transaction id', () => {
    expect(PaymentRejectedError.fromApi({ transactionId: 77 }).transactionId).toBe('77')
  })
})

describe('CardPaymentError.fromApi', () => {
  it('keeps the PHP quirk where errorCode equals the message', () => {
    const error = CardPaymentError.fromApi({ success: false, message: 'DCC_OFFER_EXPIRED' })
    expect(error.message).toBe('DCC_OFFER_EXPIRED')
    expect(error.errorCode).toBe('DCC_OFFER_EXPIRED')
    expect(error.httpStatus).toBe(200)
  })

  it('falls back when the message is missing', () => {
    expect(CardPaymentError.fromApi({ success: false }).message).toBe('Card payment failed')
  })
})
