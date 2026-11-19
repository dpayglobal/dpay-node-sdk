import { isNumeric, isPhpInt, isScalar, phpInt } from '../internal/php.js'
import { Money } from '../money.js'
import { currencyCodeOrPln, moneyOrZero, record, strictString } from '../payment/models.js'
import { PayoutState, type PayoutType } from './enums.js'

/** Beneficiary of a payout. */
export interface PayoutReceiver {
  readonly nrb: string | null
  readonly title: string | null
  /** In the currency of the payout. */
  readonly amount: Money | null
  readonly service: string | null
  readonly receiverName: string | null
  readonly receiverAddress: string | null
  readonly raw: Record<string, unknown>
}

/**
 * Payout header: `payouts.details()`, and `settlement` of `payouts.detailsFull()` (`PayoutSettlement`). Amounts are
 * in `currency` - `currency_code` when the API sends it, otherwise PLN.
 */
export interface PayoutDetails {
  readonly id: number
  /** 0 waiting, 1 processed, -1 failed (`PayoutState`). */
  readonly state: number
  readonly net: Money
  readonly fee: Money
  readonly gross: Money
  /** Currency of the amounts (`currency_code`; PLN when the API does not send it). */
  readonly currency: string
  readonly creationDate: string | null
  /** When the transfer was sent to the bank (`payouts.detailsFull()` only); null until then. */
  readonly exportDate: string | null
  /** Paysafecard payout (`paysafecard` = 1, present only for regular, non-direct settlements). */
  readonly isPaysafecard: boolean
  readonly isDirectSettlement: boolean
  readonly nrb: string | null
  readonly isDeclined: boolean
  readonly declineReason: string | null
  readonly declineStatus: string | null
  readonly receiver: PayoutReceiver | null
  readonly isWaiting: boolean
  readonly isProcessed: boolean
  readonly isFailed: boolean
  readonly raw: Record<string, unknown>
}

/** `meta` of a paginated payout response: the page returned, its size and the totals of the whole result. */
export interface PageMeta {
  /** Page that was returned - echoed back even beyond the last page. */
  readonly page: number
  readonly perPage: number
  /** Number of items in the whole result. */
  readonly total: number
  /** 0 when the result is empty. */
  readonly totalPages: number
  /** `page < totalPages`. */
  readonly hasMore: boolean
}

/** One payout of `payouts.list()`. The account, receiver and decline reason are in `payouts.details()`. */
export interface PayoutListItem {
  /** Use as `withdrawId` in `payouts.details()` and `payouts.detailsFull()`. */
  readonly id: number
  /** `standard`, `direct` or `paysafecard` (`PayoutType`). */
  readonly type: PayoutType | (string & {}) | null
  /** 0 waiting, 1 processed, -1 failure (`PayoutState`). */
  readonly state: number
  readonly isWaiting: boolean
  readonly isProcessed: boolean
  readonly isFailed: boolean
  readonly net: Money
  readonly fee: Money
  readonly gross: Money
  /** `currency_code` when it is a valid code, otherwise PLN. */
  readonly currency: string
  readonly creationDate: string | null
  /** When the transfer was sent to the bank; null until then. */
  readonly exportDate: string | null
  readonly isDeclined: boolean
  readonly raw: Record<string, unknown>
}

/** One page of `payouts.list()`, newest payouts first. */
export interface PayoutPage {
  readonly items: readonly PayoutListItem[]
  readonly meta: PageMeta
  /** The page has items and is not the last one. */
  readonly hasMore: boolean
}

/** A payment settled by a payout (`transactions[]` of `withdraws/details/full`). Amounts in the payout currency. */
export interface SettlementPosition {
  /** Payment ID - the same as in the IPN; null when unknown. */
  readonly paymentId: string | null
  /** When the payment was made. */
  readonly date: string | null
  /** Amount credited to you. */
  readonly net: Money
  /** Commission charged on this payment. */
  readonly fee: Money
  /** Amount paid by the payer. */
  readonly gross: Money
  /** Only when the API sends an integer. */
  readonly serviceId: number | null
  readonly serviceName: string | null
  /** The `custom` value from the registration, as in the IPN. */
  readonly custom: string | null
  /** KSeF payment identifier of a payment settled with an e-invoice. */
  readonly ipksef: string | null
  readonly raw: Record<string, unknown>
}

/**
 * `payouts.detailsFull()`: the payout header, the totals of the WHOLE settlement and one page of the payments it
 * settles. A payout of exactly one payment returns one position; a payout with unknown positions returns none.
 */
export interface PayoutSettlement {
  /** Payout header (state, amounts, currency, account or receiver, decline reason). */
  readonly settlement: PayoutDetails
  /** Net total of the whole settlement. */
  readonly summaryNet: Money
  readonly summaryFee: Money
  readonly summaryGross: Money
  /** Number of positions in the whole settlement. */
  readonly summaryCount: number
  /** Positions of this page. */
  readonly positions: readonly SettlementPosition[]
  readonly meta: PageMeta
  readonly raw: Record<string, unknown>
}

/** Builds a frozen `PayoutDetails` from the raw JSON body of `pbl/withdraws/details` (or `settlement`). */
export function parsePayoutDetails(data: Record<string, unknown>): PayoutDetails {
  const state = isScalar(data.state) ? phpInt(data.state) : 0
  const receiver = record(data.receiver)
  const currency = currencyCodeOrPln(data)
  return Object.freeze({
    id: isScalar(data.id) ? phpInt(data.id) : 0,
    state,
    net: moneyOrZero(data, 'net', currency),
    fee: moneyOrZero(data, 'fee', currency),
    gross: moneyOrZero(data, 'gross', currency),
    currency,
    creationDate: strictString(data, 'creation_date'),
    exportDate: strictString(data, 'export_date'),
    isPaysafecard: flag(data, 'paysafecard'),
    isDirectSettlement: flag(data, 'direct_settlement'),
    nrb: strictString(data, 'nrb'),
    isDeclined: flag(data, 'declined'),
    declineReason: strictString(data, 'decline_reason'),
    declineStatus: strictString(data, 'decline_status'),
    receiver: receiver === null ? null : parsePayoutReceiver(receiver, currency),
    isWaiting: state === PayoutState.WAITING,
    isProcessed: state === PayoutState.PROCESSED,
    isFailed: state === PayoutState.FAILED,
    raw: data,
  })
}

/** Builds a frozen `PayoutPage` from the raw JSON body of `pbl/withdraws`. */
export function parsePayoutPage(response: Record<string, unknown>): PayoutPage {
  const rows = Array.isArray(response.withdraws) ? response.withdraws : []
  const items = rows
    .filter((item): item is Record<string, unknown> => record(item) !== null)
    .map(parsePayoutListItem)
  const meta = parsePageMeta(record(response.meta) ?? {})
  return Object.freeze({
    items: Object.freeze(items),
    meta,
    hasMore: items.length > 0 && meta.hasMore,
  })
}

/** Builds a frozen `PayoutSettlement` from the raw JSON body of `pbl/withdraws/details/full`. */
export function parsePayoutSettlement(data: Record<string, unknown>): PayoutSettlement {
  const settlement = parsePayoutDetails(record(data.settlement) ?? {})
  const currency = settlement.currency
  const summary = record(data.summary) ?? {}
  const positions = Array.isArray(data.transactions) ? data.transactions : []
  return Object.freeze({
    settlement,
    summaryNet: moneyOrZero(summary, 'net', currency),
    summaryFee: moneyOrZero(summary, 'fee', currency),
    summaryGross: moneyOrZero(summary, 'gross', currency),
    summaryCount: numericInt(summary, 'count', 0),
    positions: Object.freeze(
      positions
        .filter((item): item is Record<string, unknown> => record(item) !== null)
        .map((item) => parseSettlementPosition(item, currency)),
    ),
    meta: parsePageMeta(record(data.meta) ?? {}),
    raw: data,
  })
}

function parsePayoutListItem(data: Record<string, unknown>): PayoutListItem {
  const state = numericInt(data, 'state', 0)
  const currency = currencyCodeOrPln(data)
  return Object.freeze({
    id: numericInt(data, 'id', 0),
    type: strictString(data, 'type'),
    state,
    isWaiting: state === PayoutState.WAITING,
    isProcessed: state === PayoutState.PROCESSED,
    isFailed: state === PayoutState.FAILED,
    net: moneyOrZero(data, 'net', currency),
    fee: moneyOrZero(data, 'fee', currency),
    gross: moneyOrZero(data, 'gross', currency),
    currency,
    creationDate: strictString(data, 'creation_date'),
    exportDate: strictString(data, 'export_date'),
    isDeclined: numericInt(data, 'declined', 0) === 1,
    raw: data,
  })
}

function parseSettlementPosition(data: Record<string, unknown>, currency: string): SettlementPosition {
  return Object.freeze({
    paymentId: strictString(data, 'payment_id'),
    date: strictString(data, 'date'),
    net: moneyOrZero(data, 'net', currency),
    fee: moneyOrZero(data, 'fee', currency),
    gross: moneyOrZero(data, 'gross', currency),
    serviceId: isPhpInt(data.service_id) ? (data.service_id as number) : null,
    serviceName: strictString(data, 'service_name'),
    custom: strictString(data, 'custom'),
    ipksef: strictString(data, 'ipksef'),
    raw: data,
  })
}

function parsePageMeta(data: Record<string, unknown>): PageMeta {
  const page = numericInt(data, 'page', 1)
  const totalPages = numericInt(data, 'total_pages', 0)
  return Object.freeze({
    page,
    perPage: numericInt(data, 'per_page', 0),
    total: numericInt(data, 'total', 0),
    totalPages,
    hasMore: page < totalPages,
  })
}

function parsePayoutReceiver(data: Record<string, unknown>, currency: string): PayoutReceiver {
  return Object.freeze({
    nrb: strictString(data, 'nrb'),
    title: strictString(data, 'title'),
    amount: Money.tryFromApiNumber(data.amount, currency),
    service: strictString(data, 'service'),
    receiverName: strictString(data, 'receiverName'),
    receiverAddress: strictString(data, 'receiverAddress'),
    raw: data,
  })
}

function flag(data: Record<string, unknown>, key: string): boolean {
  const value = data[key]
  return isScalar(value) ? phpInt(value) === 1 : false
}

/** PHP `is_numeric($value) ? (int) $value : $default`. */
function numericInt(data: Record<string, unknown>, key: string, fallback: number): number {
  const value = data[key]
  return isNumeric(value) ? phpInt(value) : fallback
}
