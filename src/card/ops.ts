import { CardPaymentError, DPayValueError } from '../errors.js'
import type { ApiResponse } from '../http/types.js'
import { API_PAYMENTS } from '../internal/base-urls.js'
import type { ChecksumCalculator } from '../internal/checksum.js'
import { type Operation, decodeRecordOrFail } from '../internal/operation.js'
import { WebhookEventType } from '../webhook/event-type.js'
import { serializeWebhookTarget } from '../webhook/target.js'
import { type CardPaymentResult, parseCardPaymentResult } from './models.js'
import type {
  ApplePayParams,
  CardCancelParams,
  CardCaptureParams,
  CardPaymentParams,
  GooglePayParams,
} from './params.js'
import { serializeApplePay, serializeCardPayment, serializeGooglePay } from './params.js'

export function publicKeyOperation(): Operation<string> {
  return {
    method: 'GET',
    host: API_PAYMENTS,
    path: '/api/v1_0/cards/public-key',
    parse: (response) => response.body.trim(),
  }
}

function paymentOperation(
  transactionId: string,
  suffix: string,
  body: Record<string, unknown>,
): Operation<CardPaymentResult> {
  return {
    method: 'POST',
    host: API_PAYMENTS,
    path: `/api/v1_0/cards/payment/${encodeURIComponent(transactionId)}${suffix}`,
    body,
    parse: parseResult,
  }
}

function parseResult(response: ApiResponse): CardPaymentResult {
  const data = decodeRecordOrFail(response)
  if (data.success !== true) throw CardPaymentError.fromApi(data)
  return parseCardPaymentResult(data)
}

export function payOtpOperation(id: string, params: CardPaymentParams): Operation<CardPaymentResult> {
  return paymentOperation(id, '/pay/card-otp', serializeCardPayment(params))
}

export function preAuthOperation(id: string, params: CardPaymentParams): Operation<CardPaymentResult> {
  return paymentOperation(id, '/pay/card-pre-auth', serializeCardPayment(params))
}

/**
 * `{service, amount, webhook?, checksum}`, signed with sha256(capture|service|transaction_id|amount|hash) -
 * the amount with two decimal places, the webhook object outside the checksum.
 */
export function captureOperation(
  service: string,
  checksum: ChecksumCalculator,
  id: string,
  params: CardCaptureParams,
): Operation<CardPaymentResult> {
  if (params?.amount === undefined) throw new DPayValueError('A capture requires an amount')
  const amount = params.amount.toDecimal()
  const body: Record<string, unknown> = { service, amount: Number(amount) }
  if (params.webhook !== undefined) {
    body.webhook = serializeWebhookTarget(params.webhook, WebhookEventType.CAPTURE, 'a card capture')
  }
  body.checksum = checksum.operation('capture', service, id, amount)
  return paymentOperation(id, '/capture', body)
}

/**
 * `{service, amount?, checksum}`, signed with sha256(cancellation|service|transaction_id|amount|hash) - an empty
 * amount segment without an amount.
 */
export function cancelOperation(
  service: string,
  checksum: ChecksumCalculator,
  id: string,
  params: CardCancelParams,
): Operation<CardPaymentResult> {
  const amount = params.amount === undefined ? null : params.amount.toDecimal()
  const body: Record<string, unknown> = { service }
  if (amount !== null) body.amount = Number(amount)
  body.checksum = checksum.operation('cancellation', service, id, amount)
  return paymentOperation(id, '/cancellation', body)
}

export function googlePayOperation(id: string, params: GooglePayParams): Operation<CardPaymentResult> {
  return paymentOperation(id, '/pay/google-pay', serializeGooglePay(params))
}

export function applePayOperation(id: string, params: ApplePayParams): Operation<CardPaymentResult> {
  return paymentOperation(id, '/pay/apple-pay', serializeApplePay(params))
}
