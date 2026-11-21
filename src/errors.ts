import { type CardError, parseCardError } from './card/card-error.js'
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

/**
 * The IPN or webhook payload is malformed, its signature does not match, or (webhooks) its timestamp is
 * outside the tolerance.
 */
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
  /**
   * Business error code from the API, when present: the `code` field (for example `CHECKSUM_REQUIRED`,
   * `INVALID_CHECKSUM`, `WEBHOOK_URL_INVALID`), otherwise the older `errorcode`.
   */
  readonly errorCode: string | null
  /** Per-field validation messages, normalized across the 400 and 422 formats. */
  readonly fieldErrors: Record<string, string[]>
  /** Unparsed response body. */
  readonly rawBody: string
  /** Detailed reason next to the code, for example `https_required` for `WEBHOOK_URL_INVALID`. */
  readonly reason: string | null
  /**
   * Transaction created before the error, when the API returned one (`transactionId`, for example a declined
   * charge on a saved card or a declined payment) - use it to query the transaction.
   */
  readonly transactionId: string | null
  /** Card decline details (`cardError` of a Payments API error, `error` of a declined card operation). */
  readonly cardError: CardError | null

  constructor(
    message: string,
    httpStatus: number,
    errorCode: string | null = null,
    fieldErrors: Record<string, string[]> = {},
    rawBody = '',
    reason: string | null = null,
    transactionId: string | null = null,
    cardError: CardError | null = null,
  ) {
    super(message)
    this.httpStatus = httpStatus
    this.errorCode = errorCode
    this.fieldErrors = fieldErrors
    this.rawBody = rawBody
    this.reason = reason
    this.transactionId = transactionId
    this.cardError = cardError
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
  /** Unix time (seconds) when the limit resets - the `X-RateLimit-Reset` header. */
  readonly reset: number | null

  constructor(
    message: string,
    httpStatus: number,
    retryAfter: number | null = null,
    limit: number | null = null,
    remaining: number | null = null,
    rawBody = '',
    reset: number | null = null,
  ) {
    super(message, httpStatus, null, {}, rawBody)
    this.retryAfter = retryAfter
    this.limit = limit
    this.remaining = remaining
    this.reset = reset
  }
}

/** Payment registration rejected with HTTP 200 and `error: true`. */
export class PaymentRejectedError extends ApiError {
  override readonly type = 'payment_rejected_error'
  /** Provider's description of the decline (`additionalInfo.error_description`), when it sent one. */
  readonly errorDescription: string | null

  constructor(
    message: string,
    httpStatus: number,
    errorCode: string | null = null,
    fieldErrors: Record<string, string[]> = {},
    rawBody = '',
    transactionId: string | null = null,
    errorDescription: string | null = null,
  ) {
    super(message, httpStatus, errorCode, fieldErrors, rawBody, null, transactionId)
    this.errorDescription = errorDescription
  }

  static fromApi(data: Record<string, unknown>): PaymentRejectedError {
    const message = typeof data.msg === 'string' ? data.msg : 'Payment rejected'
    const additional = isRecord(data.additionalInfo) ? data.additionalInfo : {}
    const errorCode = typeof additional.error === 'string' ? additional.error : null
    const transactionId = isScalar(data.transactionId) ? phpStrval(data.transactionId) : null
    const errorDescription =
      typeof additional.error_description === 'string' ? additional.error_description : null
    return new PaymentRejectedError(
      message,
      200,
      errorCode,
      {},
      phpJsonEncode(data),
      transactionId,
      errorDescription,
    )
  }
}

/**
 * Card payment rejected with HTTP 200 and `success != true`. `message` and `errorCode` hold the API `message`
 * (for example `DCC_OFFER_EXPIRED`); `cardError` holds the decline details (`error`) when the decline carries a
 * recognised code.
 */
export class CardPaymentError extends ApiError {
  override readonly type = 'card_payment_error'

  static fromApi(data: Record<string, unknown>): CardPaymentError {
    const message = typeof data.message === 'string' ? data.message : 'Card payment failed'
    const error = isRecord(data.error) ? parseCardError(data.error) : null
    return new CardPaymentError(message, 200, message, {}, phpJsonEncode(data), null, null, error)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
