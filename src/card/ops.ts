import { CardPaymentError } from '../errors.js'
import type { ApiResponse } from '../http/types.js'
import { API_PAYMENTS } from '../internal/base-urls.js'
import { type Operation, decodeRecordOrFail } from '../internal/operation.js'
import type { Money } from '../money.js'
import { type CardPaymentResult, parseCardPaymentResult } from './models.js'
import type { ApplePayParams, CardPaymentParams, GooglePayParams } from './params.js'
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

export function captureOperation(id: string, amount?: Money): Operation<CardPaymentResult> {
  return paymentOperation(id, '/capture', amountBody(amount))
}

export function cancelOperation(id: string, amount?: Money): Operation<CardPaymentResult> {
  return paymentOperation(id, '/cancellation', amountBody(amount))
}

export function googlePayOperation(id: string, params: GooglePayParams): Operation<CardPaymentResult> {
  return paymentOperation(id, '/pay/google-pay', serializeGooglePay(params))
}

export function applePayOperation(id: string, params: ApplePayParams): Operation<CardPaymentResult> {
  return paymentOperation(id, '/pay/apple-pay', serializeApplePay(params))
}

function amountBody(amount?: Money): Record<string, unknown> {
  return amount === undefined ? {} : { amount: Number(amount.toDecimal()) }
}
