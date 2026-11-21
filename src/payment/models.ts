import { Currency, isValidCurrency } from '../currency.js'
import { isPhpInt, isScalar, phpInt, phpStrval } from '../internal/php.js'
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
  /** Alias of the recurring payment registered with this payment (`recurringRegistration`). */
  readonly recurringAlias: string | null
  /** Payment methods of that recurring payment, for example `['blik']`. */
  readonly recurringMethods: readonly string[]
  /** Multibanco reference to show the payer (registration with the Multibanco channel). */
  readonly multibanco: MultibancoReference | null
  /** The already paid transaction of a "Transaction paid" answer (`additionalInfo.transaction`). */
  readonly paidTransaction: RegisteredTransaction | null
  readonly raw: Record<string, unknown>
}

/**
 * Multibanco payment reference returned by the registration (`multibanco`): the payer pays it at an ATM or in
 * online banking with the entity and reference numbers, so you can show them without redirecting to the gateway.
 */
export interface MultibancoReference {
  /** Entity number (5 digits), empty when missing. */
  readonly entity: string
  /** Reference number (9 digits, without spaces), empty when missing. */
  readonly reference: string
  /** Amount to pay in `currency` (EUR). */
  readonly amount: Money | null
  /** `currency` when it is a valid code, otherwise `EUR`. */
  readonly currency: string
  /** Expiry in UTC, ISO 8601 (for example `2026-11-21T10:00:00+00:00`). */
  readonly expiresAt: string | null
  readonly raw: Record<string, unknown>
}

/** Status of the transaction returned with a "Transaction paid" registration (`RegisteredTransaction`). */
export const RegisteredTransactionStatus = {
  PENDING: 'pending',
  PAID: 'paid',
  CAPTURED: 'captured',
  CANCELED: 'canceled',
} as const

export type RegisteredTransactionStatus =
  (typeof RegisteredTransactionStatus)[keyof typeof RegisteredTransactionStatus]

/**
 * The transaction returned with a registration answered "Transaction paid" (`additionalInfo.transaction`) - the
 * payment was already paid (for example a repeated registration). Its statuses differ from `Transaction.status`:
 * pending, paid, captured, canceled (`RegisteredTransactionStatus`).
 */
export interface RegisteredTransaction {
  readonly paymentId: string
  readonly status: RegisteredTransactionStatus | (string & {}) | null
  /** Status `paid` or `captured`. */
  readonly isPaid: boolean
  /** `value` in the currency of the registered amount (the object carries none). */
  readonly value: Money | null
  readonly email: string | null
  readonly description: string | null
  readonly name: string | null
  readonly surname: string | null
  /** Provider transaction identifier, when known. */
  readonly pid: string | null
  readonly mtid: string | null
  readonly creationDate: string | null
  readonly paymentDate: string | null
  readonly raw: Record<string, unknown>
}

/** Return and IPN addresses stored with a transaction (`transaction.urls` of `payments.details()`). */
export interface TransactionUrls {
  readonly success: string | null
  readonly fail: string | null
  /** Null when the payment was registered without an IPN address. */
  readonly ipn: string | null
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
  /** dpay commission rate in percent as sent (for example `1.50`). */
  readonly rate: string | null
  /** Minimal commission as sent by the API (`minimal_fee`, for example 20 = 0.20 PLN). */
  readonly minimalFee: number | null
  /** Added fixed commission as sent by the API (`permanent_fee`, cards only). */
  readonly permanentFee: number | null
  /** Return and IPN addresses of the registration. */
  readonly urls: TransactionUrls | null
  readonly raw: Record<string, unknown>
}

/**
 * Builds a frozen `RegisteredPayment` from the raw JSON body of `payments/register`.
 *
 * Reproduces the API's quirks verbatim: `redirectUrl` is set only when `msg` is itself an
 * `http(s)://` URL, and `isPaid` / `isInternalProcessing` are literal string comparisons
 * against the two known status sentences, not a general status parse.
 *
 * `currency` is the currency of the registered amount, used for `paidTransaction.value`.
 */
export function parseRegisteredPayment(
  data: Record<string, unknown>,
  currency: string = Currency.PLN,
): RegisteredPayment {
  const message = scalarString(data, 'msg')
  const additional = record(data.additionalInfo)
  const recurring = record(additional?.recurring_registration) ?? {}
  const methods = Array.isArray(recurring.methods) ? recurring.methods : []
  const multibanco = record(data.multibanco)
  const paidTransaction = record(additional?.transaction)
  return Object.freeze({
    transactionId: scalarString(data, 'transactionId'),
    message,
    ipksef: strictString(data, 'ipksef'),
    redirectUrl: HTTP_URL.test(message) ? message : null,
    isPaid: message === 'Transaction paid',
    isInternalProcessing: message === 'Internal processing',
    cardRecurringAlias: additional === null ? null : strictString(additional, 'card_recurring_alias'),
    recurringAlias: strictString(recurring, 'alias'),
    recurringMethods: Object.freeze(methods.filter((method): method is string => typeof method === 'string')),
    multibanco: multibanco === null ? null : parseMultibancoReference(multibanco),
    paidTransaction:
      paidTransaction === null
        ? null
        : parseRegisteredTransaction(paidTransaction, isValidCurrency(currency) ? currency : Currency.PLN),
    raw: data,
  })
}

function parseMultibancoReference(data: Record<string, unknown>): MultibancoReference {
  const code = stringOrInt(data, 'currency')
  const currency = code !== null && isValidCurrency(code) ? code : Currency.EUR
  return Object.freeze({
    entity: stringOrInt(data, 'entity') ?? '',
    reference: stringOrInt(data, 'reference') ?? '',
    amount: Money.tryFromApiNumber(data.amount, currency),
    currency,
    expiresAt: stringOrInt(data, 'expires_at'),
    raw: data,
  })
}

function parseRegisteredTransaction(data: Record<string, unknown>, currency: string): RegisteredTransaction {
  const status = stringOrInt(data, 'status')
  return Object.freeze({
    paymentId: stringOrInt(data, 'payment_id') ?? '',
    status,
    isPaid: status === RegisteredTransactionStatus.PAID || status === RegisteredTransactionStatus.CAPTURED,
    value: Money.tryFromApiNumber(data.value, currency),
    email: stringOrInt(data, 'email'),
    description: stringOrInt(data, 'description'),
    name: stringOrInt(data, 'name'),
    surname: stringOrInt(data, 'surname'),
    pid: stringOrInt(data, 'pid'),
    mtid: stringOrInt(data, 'mtid'),
    creationDate: stringOrInt(data, 'creation_date'),
    paymentDate: stringOrInt(data, 'payment_date'),
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
  const urls = record(inner.urls)
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
    rate: typeof inner.rate === 'string' || typeof inner.rate === 'number' ? phpStrval(inner.rate) : null,
    minimalFee: integerOrNull(inner.minimal_fee),
    permanentFee: integerOrNull(inner.permanent_fee),
    urls: urls === null ? null : parseTransactionUrls(urls),
    raw: data,
  })
}

function parseTransactionUrls(data: Record<string, unknown>): TransactionUrls {
  const url = (key: string): string | null => {
    const value = data[key]
    return typeof value === 'string' && value !== '' ? value : null
  }
  return Object.freeze({ success: url('success'), fail: url('fail'), ipn: url('ipn') })
}

/** A JSON integer or a string of an integer (database columns arrive as strings); anything else is null. */
function integerOrNull(value: unknown): number | null {
  if (isPhpInt(value)) return value as number
  return typeof value === 'string' && /^-?\d+$/.test(value) ? phpInt(value) : null
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
 * Reads `data[key]` when it is a string or an integer (rendered as its decimal string), returning `null`
 * otherwise - the fields the API may send as a number or a string.
 */
export function stringOrInt(data: Record<string, unknown>, key: string): string | null {
  const value = data[key]
  return typeof value === 'string' || isPhpInt(value) ? phpStrval(value) : null
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
 * Parses `data[key]` as an amount in `currency` (PLN by default - most payloads behind these models have no
 * currency field). Returns zero in that currency when the key is missing or the value cannot be parsed, instead
 * of throwing. `currency` must be a valid code.
 */
export function moneyOrZero(
  data: Record<string, unknown>,
  key: string,
  currency: string = Currency.PLN,
): Money {
  return Money.tryFromApiNumber(data[key] ?? 0, currency) ?? Money.of(0, currency)
}

/** The `currency_code` of a payload when it is a valid code, otherwise PLN. */
export function currencyCodeOrPln(data: Record<string, unknown>): string {
  const code = data.currency_code
  return typeof code === 'string' && isValidCurrency(code) ? code : Currency.PLN
}
