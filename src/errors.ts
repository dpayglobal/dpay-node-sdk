import { isScalar, phpJsonEncode, phpStrval } from './internal/php.js'

export type DPayErrorType =
  | 'value_error'
  | 'transport_error'
  | 'signature_verification_error'
  | 'card_encryption_error'
  | 'api_error'
  | 'authentication_error'
  | 'invalid_request_error'
  | 'access_denied_error'
  | 'not_found_error'
  | 'rate_limit_error'
  | 'card_payment_error'
  | 'payment_rejected_error'
  | 'api_server_error'

/** Base class for every error thrown by this SDK. */
export class DPayError extends Error {
  /** Stable discriminator, usable in `switch` when `instanceof` is unreliable. */
  readonly type: DPayErrorType = 'value_error'

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = new.target.name
    Error.captureStackTrace?.(this, new.target)
  }
}

/** Invalid argument passed to the SDK. Thrown before any network call. */
export class DPayValueError extends DPayError {
  override readonly type = 'value_error'
}

/** Network failure, timeout or abort. The payment status is unknown. */
export class TransportError extends DPayError {
  override readonly type = 'transport_error'
}

/** The IPN payload is malformed or its signature does not match. */
export class SignatureVerificationError extends DPayError {
  override readonly type = 'signature_verification_error'
}

/** Card data could not be encrypted with the public key from the API. */
export class CardEncryptionError extends DPayError {
  override readonly type = 'card_encryption_error'
}

/** The API answered, but rejected the request. */
export class ApiError extends DPayError {
  override readonly type: DPayErrorType = 'api_error'
  /** HTTP status of the response, or 200 for rejections carried in a success body. */
  readonly httpStatus: number
  /** Business error code from the API, when present. */
  readonly errorCode: string | null
  /** Per-field validation messages, normalized across the 400 and 422 formats. */
  readonly fieldErrors: Record<string, string[]>
  /** Unparsed response body. */
  readonly rawBody: string

  constructor(
    message: string,
    httpStatus: number,
    errorCode: string | null = null,
    fieldErrors: Record<string, string[]> = {},
    rawBody = '',
  ) {
    super(message)
    this.httpStatus = httpStatus
    this.errorCode = errorCode
    this.fieldErrors = fieldErrors
    this.rawBody = rawBody
  }
}

/** HTTP 401 - usually a wrong checksum. */
export class AuthenticationError extends ApiError {
  override readonly type = 'authentication_error'
}

/** HTTP 400 or 422 - see `fieldErrors`. */
export class InvalidRequestError extends ApiError {
  override readonly type = 'invalid_request_error'
}

/** HTTP 403. */
export class AccessDeniedError extends ApiError {
  override readonly type = 'access_denied_error'
}

/** HTTP 404. */
export class NotFoundError extends ApiError {
  override readonly type = 'not_found_error'
}

/** HTTP 5xx. */
export class ApiServerError extends ApiError {
  override readonly type = 'api_server_error'
}

/** HTTP 429. */
export class RateLimitError extends ApiError {
  override readonly type = 'rate_limit_error'
  /** Seconds from the `Retry-After` header. */
  readonly retryAfter: number | null
  /** Value of `X-RateLimit-Limit`. */
  readonly limit: number | null
  /** Value of `X-RateLimit-Remaining`. */
  readonly remaining: number | null

  constructor(
    message: string,
    httpStatus: number,
    retryAfter: number | null = null,
    limit: number | null = null,
    remaining: number | null = null,
    rawBody = '',
  ) {
    super(message, httpStatus, null, {}, rawBody)
    this.retryAfter = retryAfter
    this.limit = limit
    this.remaining = remaining
  }
}

/** Payment registration rejected with HTTP 200 and `error: true`. */
export class PaymentRejectedError extends ApiError {
  override readonly type = 'payment_rejected_error'
  /** Transaction identifier returned alongside the rejection, when present. */
  readonly transactionId: string | null

  constructor(
    message: string,
    httpStatus: number,
    errorCode: string | null = null,
    fieldErrors: Record<string, string[]> = {},
    rawBody = '',
    transactionId: string | null = null,
  ) {
    super(message, httpStatus, errorCode, fieldErrors, rawBody)
    this.transactionId = transactionId
  }

  static fromApi(data: Record<string, unknown>): PaymentRejectedError {
    const message = typeof data.msg === 'string' ? data.msg : 'Payment rejected'
    const additional = isRecord(data.additionalInfo) ? data.additionalInfo : {}
    const errorCode = typeof additional.error === 'string' ? additional.error : null
    const transactionId = isScalar(data.transactionId) ? phpStrval(data.transactionId) : null
    return new PaymentRejectedError(message, 200, errorCode, {}, phpJsonEncode(data), transactionId)
  }
}

/** Card payment rejected with HTTP 200 and `success != true`. */
export class CardPaymentError extends ApiError {
  override readonly type = 'card_payment_error'

  static fromApi(data: Record<string, unknown>): CardPaymentError {
    const message = typeof data.message === 'string' ? data.message : 'Card payment failed'
    return new CardPaymentError(message, 200, message, {}, phpJsonEncode(data))
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
