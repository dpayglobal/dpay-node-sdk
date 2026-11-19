import { Currency, isValidCurrency } from '../currency.js'
import { isPhpInt } from '../internal/php.js'
import { Money } from '../money.js'
import { record, stringOrInt } from '../payment/models.js'

/**
 * dpay decline codes (`failure.code` of webhook objects). React to a decline by `Failure.category` and
 * `Failure.isRetryable`; new codes may appear - treat an unknown code like `generic_decline`.
 */
export const DeclineCode = {
  INSUFFICIENT_FUNDS: 'insufficient_funds',
  LIMIT_EXCEEDED: 'limit_exceeded',
  CUSTOMER_DECLINED: 'customer_declined',
  CUSTOMER_TIMEOUT: 'customer_timeout',
  INVALID_CODE: 'invalid_code',
  EXPIRED: 'expired',
  APP_UPDATE_REQUIRED: 'app_update_required',
  ISSUER_DECLINED: 'issuer_declined',
  CARD_INVALID: 'card_invalid',
  AUTHENTICATION_REQUIRED: 'authentication_required',
  ALIAS_INVALID: 'alias_invalid',
  UNSUPPORTED_BY_BANK: 'unsupported_by_bank',
  GENERIC_DECLINE: 'generic_decline',
  SECURITY_DECLINED: 'security_declined',
  BLOCKED: 'blocked',
  RECURRING_CONDITIONS_NOT_MET: 'recurring_conditions_not_met',
  INVALID_REQUEST: 'invalid_request',
  REFUND_WINDOW_EXPIRED: 'refund_window_expired',
  REFUND_AMOUNT_EXCEEDED: 'refund_amount_exceeded',
  PAYOUT_FAILED: 'payout_failed',
  REFUND_FAILED: 'refund_failed',
  PROCESSING_ERROR: 'processing_error',
} as const

export type DeclineCode = (typeof DeclineCode)[keyof typeof DeclineCode]

/** Who can fix a decline (`failure.category`). */
export const FailureCategory = {
  /** The customer (funds, limits, code, bank app) - they can pay again. */
  CUSTOMER: 'customer',
  /** Your request or configuration. */
  MERCHANT: 'merchant',
  /** Security checks - do not retry automatically. */
  RISK: 'risk',
  /** dpay or the provider - temporary errors. */
  SYSTEM: 'system',
} as const

export type FailureCategory = (typeof FailureCategory)[keyof typeof FailureCategory]

/** Status of the `payment` webhook object. */
export const PaymentObjectStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  SUCCEEDED: 'succeeded',
  CAPTURED: 'captured',
  FAILED: 'failed',
  REVERSED: 'reversed',
  CHARGED_BACK: 'charged_back',
} as const

export type PaymentObjectStatus = (typeof PaymentObjectStatus)[keyof typeof PaymentObjectStatus]

/** `recurring.sequence` of a payment: `first` (the registration payment) or `subsequent` (a charge). */
export const RecurringSequence = { FIRST: 'first', SUBSEQUENT: 'subsequent' } as const

export type RecurringSequence = (typeof RecurringSequence)[keyof typeof RecurringSequence]

/** Status of the `refund` webhook object. */
export const RefundObjectStatus = { SUCCEEDED: 'succeeded', FAILED: 'failed' } as const

export type RefundObjectStatus = (typeof RefundObjectStatus)[keyof typeof RefundObjectStatus]

/** Status of the `recurring_payment` webhook object. */
export const RecurringPaymentStatus = {
  PENDING: 'pending',
  ACTIVE: 'active',
  CANCELED: 'canceled',
  EXPIRED: 'expired',
  DECLINED: 'declined',
} as const

export type RecurringPaymentStatus = (typeof RecurringPaymentStatus)[keyof typeof RecurringPaymentStatus]

/** Who canceled a recurring payment (`canceled_by`). */
export const RecurringCanceledBy = { MERCHANT: 'merchant', CUSTOMER: 'customer', DPAY: 'dpay' } as const

export type RecurringCanceledBy = (typeof RecurringCanceledBy)[keyof typeof RecurringCanceledBy]

/** Status of the `payout` webhook object. */
export const PayoutObjectStatus = { PENDING: 'pending', PAID: 'paid', FAILED: 'failed' } as const

export type PayoutObjectStatus = (typeof PayoutObjectStatus)[keyof typeof PayoutObjectStatus]

/** Decline reason of a webhook object (`failure`): payment.failed, refund.failed, payout.failed. */
export interface Failure {
  /** dpay decline code (`DeclineCode`), for example `insufficient_funds`; `generic_decline` when missing or empty. */
  readonly code: DeclineCode | (string & {})
  /** English description of the code. */
  readonly message: string | null
  /** `customer`, `merchant`, `risk` or `system` (`FailureCategory`). */
  readonly category: FailureCategory | (string & {}) | null
  /** Whether the same payment may succeed when tried again (for example after topping up the account). */
  readonly isRetryable: boolean
  /** Original provider code (for example a BLIK code), or for `payout_failed` what happened to the funds. */
  readonly providerCode: string | null
  readonly raw: Record<string, unknown>
}

/** The `payment` object of payment.* events. Amounts in minor units of `currency`, times in UTC (ISO 8601). */
export interface PaymentObject {
  /** Payment ID - the `transactionId` of the registration; empty when missing. */
  readonly id: string
  readonly status: PaymentObjectStatus | (string & {}) | null
  /** `currency` when it is a valid code, otherwise PLN. */
  readonly currency: string
  readonly amount: Money
  readonly amountRefunded: Money
  /** Total captured from a card pre-authorisation. */
  readonly amountCaptured: Money
  readonly description: string | null
  readonly created: string | null
  /** Null until the payment is paid. */
  readonly paidAt: string | null
  /** `{type, <type>: {details}}`, for example `{"type": "blik", "blik": {"flow": "code"}}`; null while unknown. */
  readonly paymentMethod: Record<string, unknown> | null
  /** blik, card, bank_transfer, twisto, multibanco, blik_pay_later, mb_way, paypal, paypo, paysafecard. */
  readonly paymentMethodType: string | null
  /** Decline reason in payment.failed. */
  readonly failure: Failure | null
  readonly isRecurring: boolean
  /** Alias of the recurring payment (BLIK or card) this payment belongs to. */
  readonly recurringAlias: string | null
  /** ID of the payment that registered the recurring payment. */
  readonly recurringRegistration: string | null
  /** `first` (the registration payment) or `subsequent` (a charge) - `RecurringSequence`. */
  readonly recurringSequence: RecurringSequence | (string & {}) | null
  /** Your `reference` from the registration. */
  readonly merchantReference: string | null
  /** Transaction ID at the provider (BLIK, card processor), if available. */
  readonly providerReference: string | null
  readonly custom: string | null
  readonly raw: Record<string, unknown>
}

/** The `refund` object of refund.* events. */
export interface RefundObject {
  /** Refund ID (`ZWROT-...`); null for a refund rejected before it was created. */
  readonly id: string | null
  /** ID of the refunded payment. */
  readonly payment: string | null
  readonly status: RefundObjectStatus | (string & {}) | null
  readonly currency: string
  /** Positive minor units. */
  readonly amount: Money
  readonly created: string | null
  readonly succeededAt: string | null
  /** Rejection reason in refund.failed, for example `refund_window_expired`. */
  readonly failure: Failure | null
  readonly raw: Record<string, unknown>
}

/**
 * The `recurring_payment` object of recurring_payment.* events, identified by the registration payment. It
 * carries no currency, so the limits are plain minor units.
 */
export interface RecurringPaymentObject {
  /** ID of the registration payment; empty when missing. */
  readonly id: string
  /** The alias you charge the recurring payment with. */
  readonly alias: string | null
  readonly status: RecurringPaymentStatus | (string & {}) | null
  /** `merchant`, `customer` or `dpay` when canceled (`RecurringCanceledBy`); null in other states. */
  readonly canceledBy: RecurringCanceledBy | (string & {}) | null
  readonly paymentMethod: Record<string, unknown> | null
  readonly paymentMethodType: string | null
  /** Recurring model: A, M or O (BLIK). */
  readonly model: string | null
  /** For example `1M`. */
  readonly frequency: string | null
  /** Single charge limit in minor units (only a JSON integer). */
  readonly limitAmount: number | null
  /** Total limit in minor units (only a JSON integer). */
  readonly totalLimitAmount: number | null
  /** YYYY-MM-DD. */
  readonly startsOn: string | null
  /** YYYY-MM-DD. */
  readonly expiresOn: string | null
  readonly created: string | null
  readonly raw: Record<string, unknown>
}

/** The `payout` object of payout.* events (account events, without a service). */
export interface PayoutObject {
  /** Payout ID - the `withdrawId` of `payouts.details()`; empty when missing. */
  readonly id: string
  readonly status: PayoutObjectStatus | (string & {}) | null
  readonly currency: string
  /** Net payout amount. */
  readonly amount: Money
  readonly fee: Money
  /** Last 4 digits of the destination account. */
  readonly bankAccountLast4: string | null
  readonly created: string | null
  readonly paidAt: string | null
  /** In payout.failed: `payout_failed`, `providerCode` tells what happened to the funds. */
  readonly failure: Failure | null
  readonly raw: Record<string, unknown>
}

/** Builds a frozen `PaymentObject` from `data.object` of a payment.* event. */
export function parsePaymentObject(data: Record<string, unknown>): PaymentObject {
  const currency = objectCurrency(data)
  const paymentMethod = record(data.payment_method)
  const recurring = record(data.recurring)
  const references = record(data.references) ?? {}
  return Object.freeze({
    id: stringOrInt(data, 'id') ?? '',
    status: stringOrInt(data, 'status'),
    currency,
    amount: minorMoney(data, 'amount', currency),
    amountRefunded: minorMoney(data, 'amount_refunded', currency),
    amountCaptured: minorMoney(data, 'amount_captured', currency),
    description: stringOrInt(data, 'description'),
    created: stringOrInt(data, 'created'),
    paidAt: stringOrInt(data, 'paid_at'),
    paymentMethod,
    paymentMethodType: stringOrInt(paymentMethod ?? {}, 'type'),
    failure: failureOrNull(data),
    isRecurring: recurring !== null,
    recurringAlias: stringOrInt(recurring ?? {}, 'alias'),
    recurringRegistration: stringOrInt(recurring ?? {}, 'registration'),
    recurringSequence: stringOrInt(recurring ?? {}, 'sequence'),
    merchantReference: stringOrInt(references, 'merchant'),
    providerReference: stringOrInt(references, 'provider'),
    custom: stringOrInt(data, 'custom'),
    raw: data,
  })
}

/** Builds a frozen `RefundObject` from `data.object` of a refund.* event. */
export function parseRefundObject(data: Record<string, unknown>): RefundObject {
  const currency = objectCurrency(data)
  return Object.freeze({
    id: stringOrInt(data, 'id'),
    payment: stringOrInt(data, 'payment'),
    status: stringOrInt(data, 'status'),
    currency,
    amount: minorMoney(data, 'amount', currency),
    created: stringOrInt(data, 'created'),
    succeededAt: stringOrInt(data, 'succeeded_at'),
    failure: failureOrNull(data),
    raw: data,
  })
}

/** Builds a frozen `RecurringPaymentObject` from `data.object` of a recurring_payment.* event. */
export function parseRecurringPaymentObject(data: Record<string, unknown>): RecurringPaymentObject {
  const paymentMethod = record(data.payment_method)
  const terms = record(data.terms) ?? {}
  return Object.freeze({
    id: stringOrInt(data, 'id') ?? '',
    alias: stringOrInt(data, 'alias'),
    status: stringOrInt(data, 'status'),
    canceledBy: stringOrInt(data, 'canceled_by'),
    paymentMethod,
    paymentMethodType: stringOrInt(paymentMethod ?? {}, 'type'),
    model: stringOrInt(terms, 'model'),
    frequency: stringOrInt(terms, 'frequency'),
    limitAmount: isPhpInt(terms.limit_amount) ? (terms.limit_amount as number) : null,
    totalLimitAmount: isPhpInt(terms.total_limit_amount) ? (terms.total_limit_amount as number) : null,
    startsOn: stringOrInt(terms, 'starts_on'),
    expiresOn: stringOrInt(terms, 'expires_on'),
    created: stringOrInt(data, 'created'),
    raw: data,
  })
}

/** Builds a frozen `PayoutObject` from `data.object` of a payout.* event. */
export function parsePayoutObject(data: Record<string, unknown>): PayoutObject {
  const currency = objectCurrency(data)
  return Object.freeze({
    id: stringOrInt(data, 'id') ?? '',
    status: stringOrInt(data, 'status'),
    currency,
    amount: minorMoney(data, 'amount', currency),
    fee: minorMoney(data, 'fee', currency),
    bankAccountLast4: stringOrInt(record(data.bank_account) ?? {}, 'last4'),
    created: stringOrInt(data, 'created'),
    paidAt: stringOrInt(data, 'paid_at'),
    failure: failureOrNull(data),
    raw: data,
  })
}

function failureOrNull(data: Record<string, unknown>): Failure | null {
  const failure = record(data.failure)
  if (failure === null) return null
  const code = failure.code
  const message = failure.message
  const category = failure.category
  return Object.freeze({
    code: typeof code === 'string' && code !== '' ? code : DeclineCode.GENERIC_DECLINE,
    message: typeof message === 'string' ? message : null,
    category: typeof category === 'string' ? category : null,
    isRetryable: failure.retryable === true,
    providerCode: stringOrInt(failure, 'provider_code'),
    raw: failure,
  })
}

/** `currency` of the object, PLN when missing or invalid. */
function objectCurrency(data: Record<string, unknown>): string {
  const currency = data.currency
  return typeof currency === 'string' && isValidCurrency(currency) ? currency : Currency.PLN
}

/** Amount in minor units (an integer in the payload); 0 when missing. */
function minorMoney(data: Record<string, unknown>, key: string, currency: string): Money {
  const minor = data[key]
  return Money.of(isPhpInt(minor) && Number.isSafeInteger(minor) ? (minor as number) : 0, currency)
}
