import { isPhpInt, phpStrval } from '../internal/php.js'

/**
 * Card decline details: the `error` object of a declined card operation (HTTP 200, `success: false`) and the
 * `cardError` object of a Payments API error (for example a declined charge on a saved card). Every field can be
 * null.
 */
export interface CardError {
  /** Stable dpay reason, for example `payment_declined`, `invalid_card`, `card_already_registered`. */
  readonly code: string | null
  /** Two-character card network response code (ISO 8583), for example `05`, `51`; null when not from an authorisation. */
  readonly declineCode: string | null
  /** English description of the decline code - localise from `declineCode`, not from this text. */
  readonly declineMessage: string | null
}

/** Builds a frozen `CardError`; a field is kept when it is a string or an integer (as its decimal string). */
export function parseCardError(data: Record<string, unknown>): CardError {
  return Object.freeze({
    code: stringOrInt(data.code),
    declineCode: stringOrInt(data.declineCode),
    declineMessage: stringOrInt(data.declineMessage),
  })
}

function stringOrInt(value: unknown): string | null {
  return typeof value === 'string' || isPhpInt(value) ? phpStrval(value) : null
}
