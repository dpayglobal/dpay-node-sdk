import { Currency } from '../currency.js'
import { isScalar, phpStrval } from '../internal/php.js'
import { Money } from '../money.js'
import { TransactionStatus } from './enums.js'

const HTTP_URL = /^https?:\/\//

/** Result of a successful payment registration. */
export interface RegisteredPayment {
  readonly transactionId: string
  /** Raw `msg` field. Carries either a URL or a status sentence. */
  readonly message: string
  /** KSeF invoice identifier, when e-invoicing was requested. */
  readonly ipksef: string | null
  /** Where to send the payer, or null when there is nothing to redirect to. */
  readonly redirectUrl: string | null
  /** True when the payment was already settled inline. */
  readonly isPaid: boolean
  /** True when dpay is processing the payment without a payer redirect. */
  readonly isInternalProcessing: boolean
  /** Alias returned when a card mandate was registered. */
  readonly cardRecurringAlias: string | null
  readonly raw: Record<string, unknown>
}

/** A single refund attached to a transaction. */
export interface TransactionRefund {
  readonly paymentId: string
  readonly value: Money
  readonly status: TransactionStatus | (string & {})
  readonly creationDate: string | null
  readonly paymentDate: string | null
  readonly raw: Record<string, unknown>
}

/** Full transaction state from `pbl/details`. */
export interface Transaction {
  readonly id: string
  readonly value: Money
  readonly status: TransactionStatus | (string & {})
  readonly paymentMethod: string | null
  readonly creationDate: string | null
  readonly paymentDate: string | null
  readonly isPaid: boolean
  readonly isSettled: boolean
  readonly isRefunded: boolean
  readonly refundedAmount: Money
  readonly availableRefundAmount: Money
  readonly isFullyRefunded: boolean
  readonly isDirect: boolean
  readonly gatewayId: string | null
  readonly payer: Record<string, unknown>
  readonly refunds: readonly TransactionRefund[]
  readonly raw: Record<string, unknown>
}

/**
 * Builds a frozen `RegisteredPayment` from the raw JSON body of `payments/register`.
 *
 * Reproduces the API's quirks verbatim: `redirectUrl` is set only when `msg` is itself an
 * `http(s)://` URL, and `isPaid` / `isInternalProcessing` are literal string comparisons
 * against the two known status sentences, not a general status parse.
 */
export function parseRegisteredPayment(data: Record<string, unknown>): RegisteredPayment {
  const message = scalarString(data, 'msg')
  const additional = record(data.additionalInfo)
  return Object.freeze({
    transactionId: scalarString(data, 'transactionId'),
    message,
    ipksef: strictString(data, 'ipksef'),
    redirectUrl: HTTP_URL.test(message) ? message : null,
    isPaid: message === 'Transaction paid',
    isInternalProcessing: message === 'Internal processing',
    cardRecurringAlias: additional === null ? null : strictString(additional, 'card_recurring_alias'),
    raw: data,
  })
}

/**
 * Builds a frozen `Transaction` (with frozen nested refunds) from the raw JSON body of
 * `pbl/details`. Amounts that cannot be parsed fall back to `Money.pln(0)` instead of
 * throwing, and an unrecognised `status` is kept as-is rather than rejected.
 */
export function parseTransaction(data: Record<string, unknown>): Transaction {
  const inner = record(data.transaction) ?? {}
  const status = scalarString(inner, 'status')
  const refunds = Array.isArray(data.refunds) ? data.refunds : []
  return Object.freeze({
    id: scalarString(inner, 'id'),
    value: moneyOrZero(inner, 'value'),
    status,
    paymentMethod: scalarStringOrNull(inner, 'payment_method'),
    creationDate: scalarStringOrNull(inner, 'creation_date'),
    paymentDate: strictString(inner, 'payment_date'),
    isPaid: status === TransactionStatus.PAID || status === TransactionStatus.CAPTURED,
    isSettled: Boolean(inner.settled),
    isRefunded: Boolean(inner.refunded),
    refundedAmount: moneyOrZero(inner, 'refunded_amount'),
    availableRefundAmount: moneyOrZero(inner, 'available_refund_amount'),
    isFullyRefunded: Boolean(inner.fully_refunded),
    isDirect: Boolean(inner.direct),
    gatewayId: strictString(inner, 'gateway_id'),
    payer: record(data.payer) ?? {},
    refunds: Object.freeze(
      refunds
        .filter((item): item is Record<string, unknown> => record(item) !== null)
        .map(parseTransactionRefund),
    ),
    raw: data,
  })
}

function parseTransactionRefund(data: Record<string, unknown>): TransactionRefund {
  const status = scalarStringOrNull(data, 'status')
  return Object.freeze({
    paymentId: scalarString(data, 'payment_id'),
    value: moneyOrZero(data, 'value'),
    status: status ?? TransactionStatus.PAID,
    creationDate: scalarStringOrNull(data, 'creation_date'),
    paymentDate: scalarStringOrNull(data, 'payment_date'),
    raw: data,
  })
}

/**
 * Reads `data[key]` as a string when it is a scalar (string, number or boolean), applying
 * PHP's string-cast rules. Returns the empty string for anything else, including missing
 * keys, `null`, arrays and objects. Shared across every response model in the SDK.
 */
export function scalarString(data: Record<string, unknown>, key: string): string {
  const value = data[key]
  return isScalar(value) ? phpStrval(value) : ''
}

/**
 * Same as {@link scalarString}, but returns `null` instead of the empty string when the
 * value is missing or not a scalar, so "absent" can be told apart from "empty".
 */
export function scalarStringOrNull(data: Record<string, unknown>, key: string): string | null {
  const value = data[key]
  return isScalar(value) ? phpStrval(value) : null
}

/**
 * Reads `data[key]` only when it is already a `string`, returning `null` otherwise. Unlike
 * {@link scalarString} and {@link scalarStringOrNull}, this never coerces numbers or
 * booleans, matching the fields the PHP SDK never stringifies.
 */
export function strictString(data: Record<string, unknown>, key: string): string | null {
  const value = data[key]
  return typeof value === 'string' ? value : null
}

/**
 * Narrows `value` to `Record<string, unknown>` when it is a plain object (not an array,
 * not `null`), returning `null` otherwise. Shared guard for decoding nested API payloads
 * that are not guaranteed to be objects.
 */
export function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * Parses `data[key]` as a PLN amount, the only currency the response models carry (the
 * API payloads behind these models have no currency field). Returns `Money.pln(0)` when
 * the key is missing or the value cannot be parsed, instead of throwing.
 */
export function moneyOrZero(data: Record<string, unknown>, key: string): Money {
  return Money.tryFromApiNumber(data[key] ?? 0, Currency.PLN) ?? Money.pln(0)
}
