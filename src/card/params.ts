import type { Money } from '../money.js'
import type { DeviceInfoParams } from '../payment/params.js'
import { serializeDeviceInfo } from '../payment/params.js'
import type { WebhookTarget } from '../webhook/target.js'
import { type DccDecision, assertDccDecision } from './enums.js'

/** Capture of a pre-authorization. */
export interface CardCaptureParams {
  /** Amount to capture; partial captures are allowed up to the authorization. */
  amount: Money
  /** Sends the `payment.captured` event of this capture to this URL. Not part of the checksum. */
  webhook?: WebhookTarget
}

/** Cancellation of a pre-authorization. */
export interface CardCancelParams {
  /** Amount to release; without it the whole uncaptured remainder is cancelled. */
  amount?: Money
}

/** Server-to-server card payment. */
export interface CardPaymentParams {
  /** 3-D Secure device fingerprint. Required. */
  deviceInfo: DeviceInfoParams
  email?: string
  channelId?: number
  cardHolderFirstName?: string
  cardHolderLastName?: string
  /** Base64 payload produced by `CardEncryptor`. */
  encryptedCardData?: string
  threeDsConfirmed?: boolean
  /** Answer to a pending dynamic currency conversion offer. */
  dccDecision?: DccDecision | (string & {})
}

/** Google Pay payment. */
export interface GooglePayParams {
  token: string
  deviceInfo: DeviceInfoParams
  email?: string
  channelId?: number
}

/** Apple Pay. Omit `token` to initialise a session. */
export interface ApplePayParams {
  deviceInfo: DeviceInfoParams
  token?: string
  channelId?: number
}

/**
 * Builds the wire-format card payment object, in the exact key order dpay expects on the
 * wire: the card fields, then `deviceInfo`, then the 3-D Secure / DCC fields. Validates
 * `dccDecision` when given. Throws DPayValueError if the decision is invalid.
 */
export function serializeCardPayment(params: CardPaymentParams): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (params.email !== undefined) body.email = params.email
  if (params.channelId !== undefined) body.channelId = params.channelId
  if (params.cardHolderFirstName !== undefined) body.cardHolderFirstName = params.cardHolderFirstName
  if (params.cardHolderLastName !== undefined) body.cardHolderLastName = params.cardHolderLastName
  if (params.encryptedCardData !== undefined) body.encryptedCardData = params.encryptedCardData
  body.deviceInfo = serializeDeviceInfo(params.deviceInfo)
  if (params.threeDsConfirmed !== undefined) body.threeDsConfirmed = params.threeDsConfirmed
  if (params.dccDecision !== undefined) {
    assertDccDecision(params.dccDecision)
    body.dccDecision = params.dccDecision
  }
  return body
}

/** Builds the wire-format Google Pay object. Always sends `xPayType: "GOOGLE_PAY"` and the token. */
export function serializeGooglePay(params: GooglePayParams): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (params.email !== undefined) body.email = params.email
  if (params.channelId !== undefined) body.channelId = params.channelId
  body.xPayType = 'GOOGLE_PAY'
  body.xPayToken = params.token
  body.deviceInfo = serializeDeviceInfo(params.deviceInfo)
  return body
}

/**
 * Builds the wire-format Apple Pay object. Omitting `token` sends `xPayType: "APPLE_PAY_INIT"`
 * with no `xPayToken`, to initialise a session; giving a `token` sends `xPayType: "APPLE_PAY"`
 * with that token, to pay.
 */
export function serializeApplePay(params: ApplePayParams): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (params.channelId !== undefined) body.channelId = params.channelId
  body.xPayType = params.token === undefined ? 'APPLE_PAY_INIT' : 'APPLE_PAY'
  if (params.token !== undefined) body.xPayToken = params.token
  body.deviceInfo = serializeDeviceInfo(params.deviceInfo)
  return body
}
