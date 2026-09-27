import { PANEL } from '../internal/base-urls.js'
import type { ChecksumCalculator } from '../internal/checksum.js'
import { type Operation, decodeRecordOrFail } from '../internal/operation.js'
import { type PayoutDetails, parsePayoutDetails } from './models.js'

export interface PayoutDetailsParams {
  withdrawId: number
  timestamp?: number
}

export function payoutDetailsOperation(
  service: string,
  checksum: ChecksumCalculator,
  params: PayoutDetailsParams,
): Operation<PayoutDetails> {
  const body: Record<string, unknown> = { service }
  if (params.timestamp !== undefined) body.timestamp = params.timestamp
  body.withdraw_id = params.withdrawId
  body.checksum = checksum.orderedBody(body)
  return {
    method: 'POST',
    host: PANEL,
    path: '/api/v1/pbl/withdraws/details',
    body,
    parse: (response) => parsePayoutDetails(decodeRecordOrFail(response)),
  }
}
