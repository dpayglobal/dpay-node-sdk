import { DPayValueError } from '../errors.js'
import { PANEL } from '../internal/base-urls.js'
import type { ChecksumCalculator } from '../internal/checksum.js'
import { type Operation, decodeRecordOrFail } from '../internal/operation.js'
import { requiredTrimmed, signPanelBody } from '../internal/server-trim.js'
import { type PayoutState, type PayoutType, assertPayoutState, assertPayoutType } from './enums.js'
import {
  type PayoutDetails,
  type PayoutPage,
  type PayoutSettlement,
  parsePayoutDetails,
  parsePayoutPage,
  parsePayoutSettlement,
} from './models.js'

const LIST_KEYS = ['dateFrom', 'dateTo', 'state', 'type', 'page', 'perPage']

export interface PayoutDetailsParams {
  withdrawId: number
  timestamp?: number
}

/** Filters of `payouts.list()` and `payouts.iterate()`. */
export interface PayoutFilters {
  /**
   * Creation date from - any date or date-time the API parses, for example `2026-07-01`. Sent trimmed: the API
   * trims strings before it verifies the checksum.
   */
  dateFrom?: string
  /** Creation date to, for example `2026-07-31 23:59:59`. Sent trimmed. */
  dateTo?: string
  /** `PayoutState`: 0 waiting, 1 processed, -1 failure. */
  state?: PayoutState
  /** `PayoutType`: `standard`, `direct` or `paysafecard`. */
  type?: PayoutType | (string & {})
  /** Page size, 1-200 (the API defaults to 50). */
  perPage?: number
}

/** `payouts.list()` parameters: the filters and the page. */
export interface ListPayoutsParams extends PayoutFilters {
  /** Page number, at least 1. */
  page?: number
}

/** `payouts.detailsFull()` parameters. */
export interface PayoutDetailsFullParams {
  withdrawId: number
  /** Page number of the positions, at least 1. */
  page?: number
  /** Page size, 1-500 (the API defaults to 100). */
  perPage?: number
}

export function payoutDetailsOperation(
  service: string,
  checksum: ChecksumCalculator,
  params: PayoutDetailsParams,
): Operation<PayoutDetails> {
  const fields: Record<string, unknown> = { service: requiredTrimmed(service, 'service') }
  if (params.timestamp !== undefined) fields.timestamp = params.timestamp
  fields.withdraw_id = params.withdrawId
  const body = signPanelBody(checksum, fields)
  return {
    method: 'POST',
    host: PANEL,
    path: '/api/v1/pbl/withdraws/details',
    body,
    parse: (response) => parsePayoutDetails(decodeRecordOrFail(response)),
  }
}

/**
 * `{service, date_from?, date_to?, state?, type?, page?, per_page?, checksum}` - this order whatever the order of
 * `params`, strings trimmed like the API trims them, signed with sha256(value1|value2|...|hash) over the values sent.
 */
export function listPayoutsOperation(
  service: string,
  checksum: ChecksumCalculator,
  params: ListPayoutsParams,
): Operation<PayoutPage> {
  const fields: Record<string, unknown> = { service: requiredTrimmed(service, 'service') }
  const unknown = Object.keys(params).filter((key) => !LIST_KEYS.includes(key))
  if (unknown.length > 0) throw new DPayValueError(`Unknown payout filter "${unknown.join('", "')}"`)

  // Like PHP isset(): a null filter is not sent. Wrong types throw DPayValueError, like every argument check.
  for (const [key, field] of [
    ['dateFrom', 'date_from'],
    ['dateTo', 'date_to'],
  ] as const) {
    const value: unknown = params[key]
    if (value === undefined || value === null) continue
    if (typeof value !== 'string') throw new DPayValueError(`${field} must be a string`)
    // The API trims strings before it verifies the checksum - an untrimmed value would fail with 401
    fields[field] = requiredTrimmed(value, field)
  }
  const state: unknown = params.state
  if (state !== undefined && state !== null) {
    if (typeof state !== 'number' || !Number.isInteger(state)) {
      throw new DPayValueError('state must be an integer')
    }
    assertPayoutState(state)
    fields.state = state
  }
  const type: unknown = params.type
  if (type !== undefined && type !== null) {
    if (typeof type !== 'string') throw new DPayValueError('type must be a string')
    assertPayoutType(type)
    fields.type = type
  }
  addPage(fields, params.page, params.perPage, 200)
  const body = signPanelBody(checksum, fields)
  return {
    method: 'POST',
    host: PANEL,
    path: '/api/v1/pbl/withdraws',
    body,
    parse: (response) => parsePayoutPage(decodeRecordOrFail(response)),
  }
}

/** `{service, withdraw_id, page?, per_page?, checksum}`, signed in this order. */
export function payoutDetailsFullOperation(
  service: string,
  checksum: ChecksumCalculator,
  params: PayoutDetailsFullParams,
): Operation<PayoutSettlement> {
  const fields: Record<string, unknown> = {
    service: requiredTrimmed(service, 'service'),
    withdraw_id: params.withdrawId,
  }
  addPage(fields, params.page, params.perPage, 500)
  const body = signPanelBody(checksum, fields)
  return {
    method: 'POST',
    host: PANEL,
    path: '/api/v1/pbl/withdraws/details/full',
    body,
    parse: (response) => parsePayoutSettlement(decodeRecordOrFail(response)),
  }
}

function addPage(
  body: Record<string, unknown>,
  page: number | undefined,
  perPage: number | undefined,
  maxPerPage: number,
): void {
  if (page !== undefined) {
    if (!Number.isSafeInteger(page) || page < 1) throw new DPayValueError('page must be at least 1')
    body.page = page
  }
  if (perPage !== undefined) {
    if (!Number.isSafeInteger(perPage) || perPage < 1 || perPage > maxPerPage) {
      throw new DPayValueError(`per_page must be between 1 and ${maxPerPage}`)
    }
    body.per_page = perPage
  }
}
