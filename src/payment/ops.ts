import { PaymentRejectedError } from '../errors.js'
import type { ApiResponse } from '../http/types.js'
import { API_PAYMENTS, PANEL } from '../internal/base-urls.js'
import type { ChecksumCalculator } from '../internal/checksum.js'
import { type Operation, decodeRecordOrFail } from '../internal/operation.js'
import { isScalar, phpStrval } from '../internal/php.js'
import {
  type RegisteredPayment,
  type Transaction,
  parseRegisteredPayment,
  parseTransaction,
} from './models.js'
import { type RegisterPaymentParams, buildRegisterBody } from './register-body.js'

export function registerOperation(
  service: string,
  checksum: ChecksumCalculator,
  params: RegisterPaymentParams,
): Operation<RegisteredPayment> {
  const body = buildRegisterBody(service, params)
  body.checksum = checksum.secretSecond(service, [
    stringField(body, 'value'),
    stringField(body, 'url_success'),
    stringField(body, 'url_fail'),
    stringField(body, 'url_ipn'),
  ])
  return {
    method: 'POST',
    host: API_PAYMENTS,
    path: '/api/v1_0/payments/register',
    body,
    parse: parseRegisterResponse,
  }
}

function parseRegisterResponse(response: ApiResponse): RegisteredPayment {
  const data = decodeRecordOrFail(response)
  if (data.error === true || data.status === false) throw PaymentRejectedError.fromApi(data)
  return parseRegisteredPayment(data)
}

export function detailsOperation(
  service: string,
  checksum: ChecksumCalculator,
  transactionId: string,
): Operation<Transaction> {
  const body: Record<string, unknown> = { service, transaction_id: transactionId }
  body.checksum = checksum.orderedBody(Object.values(body))
  return {
    method: 'POST',
    host: PANEL,
    path: '/api/v1/pbl/details',
    body,
    parse: (response) => parseTransaction(decodeRecordOrFail(response)),
  }
}

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  return isScalar(value) ? phpStrval(value) : ''
}
