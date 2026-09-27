import type { ApiResponse } from '../http/types.js'
import { API_PAYMENTS } from '../internal/base-urls.js'
import type { ChecksumCalculator } from '../internal/checksum.js'
import { type Operation, decodeRecordOrFail } from '../internal/operation.js'
import { record } from '../payment/models.js'
import { type BlikAliasType, assertBlikAliasType } from './enums.js'
import { type BlikAlias, parseBlikAlias } from './models.js'

export interface BlikAliasParams {
  aliasValue: string
  /** Defaults to `UID`, the only type the API accepts. */
  aliasType?: BlikAliasType | (string & {})
}

export interface BlikUnregisterAliasParams extends BlikAliasParams {
  reason?: string
}

function aliasBody(service: string, params: BlikAliasParams): Record<string, unknown> {
  const aliasType = params.aliasType ?? 'UID'
  assertBlikAliasType(aliasType)
  return { service, alias_value: params.aliasValue, alias_type: aliasType }
}

function envelope(response: ApiResponse): Record<string, unknown> {
  return record(decodeRecordOrFail(response).data) ?? {}
}

export function aliasOperation(
  service: string,
  checksum: ChecksumCalculator,
  params: BlikAliasParams,
): Operation<BlikAlias> {
  const body = aliasBody(service, params)
  body.checksum = checksum.secretSecond(service, [params.aliasValue])
  return {
    method: 'POST',
    host: API_PAYMENTS,
    path: '/api/v1_0/payments/blik/aliases',
    body,
    parse: (response) => parseBlikAlias(envelope(response)),
  }
}

export function unregisterAliasOperation(
  service: string,
  checksum: ChecksumCalculator,
  params: BlikUnregisterAliasParams,
): Operation<void> {
  const body = aliasBody(service, params)
  if (params.reason !== undefined) body.reason = params.reason
  body.checksum = checksum.secretSecond(service, [params.aliasValue])
  return {
    method: 'POST',
    host: API_PAYMENTS,
    path: '/api/v1_0/payments/blik/aliases/unregister',
    body,
    parse: (response) => {
      decodeRecordOrFail(response)
    },
  }
}
