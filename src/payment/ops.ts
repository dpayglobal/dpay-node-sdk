import { PaymentRejectedError } from '../errors.js'
import type { ApiResponse } from '../http/types.js'
import { API_PAYMENTS, PANEL } from '../internal/base-urls.js'
import type { ChecksumCalculator } from '../internal/checksum.js'
import { type Operation, decodeRecordOrFail } from '../internal/operation.js'
import { isScalar, phpStrval } from '../internal/php.js'
import { requiredTrimmed, signPanelBody } from '../internal/server-trim.js'
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
  // Without an IPN URL its segment stays empty
  const fields = [
    stringField(body, 'value'),
    stringField(body, 'url_success'),
    stringField(body, 'url_fail'),
    stringField(body, 'url_ipn'),
  ]
  // A recurring charge binds the checksum to the customer's alias
  if (body.recurring_alias !== undefined && body.recurring_alias !== null) {
    fields.push(stringField(body, 'recurring_alias'))
  }
  body.checksum = checksum.secretSecond(service, fields)
  return {
    method: 'POST',
    host: API_PAYMENTS,
    path: '/api/v1_0/payments/register',
    body,
    parse: (response) => parseRegisterResponse(response, params.amount.currency),
  }
}

function parseRegisterResponse(response: ApiResponse, currency: string): RegisteredPayment {
  const data = decodeRecordOrFail(response)
  if (data.error === true || data.status === false) throw PaymentRejectedError.fromApi(data)
  return parseRegisteredPayment(data, currency)
}

export function detailsOperation(
  service: string,
  checksum: ChecksumCalculator,
  transactionId: string,
): Operation<Transaction> {
  // Sent and signed trimmed, the way the API trims strings before it verifies the checksum
  const body = signPanelBody(checksum, {
    service: requiredTrimmed(service, 'service'),
    transaction_id: requiredTrimmed(transactionId, 'transaction_id'),
  })
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
