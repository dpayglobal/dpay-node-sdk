import type { ApiResponse } from '../http/types.js'
import { API_PAYMENTS } from '../internal/base-urls.js'
import type { ChecksumCalculator } from '../internal/checksum.js'
import { type Operation, decodeRecordOrFail } from '../internal/operation.js'
import { record, strictString } from '../payment/models.js'
import { RecurringAliasStatus } from './enums.js'
import {
  type RecurringRetryResult,
  type RecurringStatus,
  parseRecurringRetryResult,
  parseRecurringStatus,
} from './models.js'

/** Optional details of `recurring.cancel()`. */
export interface RecurringCancelParams {
  /** Why the recurring payment ends (at most 255 characters; BLIK keeps the first 20). */
  reason?: string
}

function envelope(response: ApiResponse): Record<string, unknown> {
  return record(decodeRecordOrFail(response).data) ?? {}
}

export function recurringStatusOperation(
  service: string,
  checksum: ChecksumCalculator,
  alias: string,
): Operation<RecurringStatus> {
  return {
    method: 'POST',
    host: API_PAYMENTS,
    path: '/api/v1_0/payments/recurring/status',
    body: { service, alias, checksum: checksum.secretSecond(service, [alias]) },
    parse: (response) => parseRecurringStatus(envelope(response)),
  }
}

export function recurringRetryOperation(
  service: string,
  checksum: ChecksumCalculator,
  transactionId: string,
): Operation<RecurringRetryResult> {
  return {
    method: 'POST',
    host: API_PAYMENTS,
    path: '/api/v1_0/payments/recurring/retry',
    body: {
      service,
      transaction_id: transactionId,
      checksum: checksum.secretSecond(service, [transactionId]),
    },
    parse: (response) => parseRecurringRetryResult(envelope(response)),
  }
}

export function recurringCancelOperation(
  service: string,
  checksum: ChecksumCalculator,
  alias: string,
  params: RecurringCancelParams,
): Operation<RecurringAliasStatus | (string & {})> {
  const body: Record<string, unknown> = { service, alias }
  if (params.reason !== undefined) body.reason = params.reason
  // The operation name ends the checksum, so a status checksum cannot cancel
  body.checksum = checksum.secretSecond(service, [alias, 'cancel'])
  return {
    method: 'POST',
    host: API_PAYMENTS,
    path: '/api/v1_0/payments/recurring/cancel',
    body,
    parse: (response) => strictString(envelope(response), 'status') ?? RecurringAliasStatus.UNREGISTERED,
  }
}
