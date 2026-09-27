import { isPhpInt, phpInt } from '../internal/php.js'
import { record, scalarString, strictString } from '../payment/models.js'
import { RecurringAliasStatus, RecurringRetryStatus } from './enums.js'

const DIGITS = /^\d+$/

/** Terms of a registered recurring payment, as returned by the status endpoint. Amounts in minor units. */
export interface RecurringRegistrationInfo {
  /** `transactionId` of the registering payment. */
  readonly transactionId: string | null
  readonly label: string | null
  readonly model: string | null
  readonly frequency: string | null
  /** Single payment limit in minor units. */
  readonly limitAmt: number | null
  /** Total limit in minor units. */
  readonly totLimitAmt: number | null
  readonly isLimitAmtFixed: boolean | null
  readonly initDate: string | null
  readonly termsUrl: string | null
  readonly termsVersion: string | null
  /** ISO 8601 with offset. */
  readonly registeredAt: string | null
  readonly raw: Record<string, unknown>
}

/** Current state of a recurring payment, from `recurring.status()`. */
export interface RecurringStatus {
  readonly alias: string
  /** Payment method of the recurring payment, for example `blik`. */
  readonly method: string | null
  /** `ACTIVE`, `INACTIVE` (waiting for the customer), `UNREGISTERED`, `EXPIRED`, `DECLINED` or null. */
  readonly status: RecurringAliasStatus | (string & {}) | null
  readonly isActive: boolean
  /** YYYY-MM-DD. */
  readonly expirationDate: string | null
  readonly registration: RecurringRegistrationInfo | null
  readonly raw: Record<string, unknown>
}

/**
 * Result of retrying a declined recurring charge. `pending` - the retry went to the bank, the outcome comes
 * like for a charge (webhook, IPN, status); `failed` - the bank declined it at once (see `errorCode`).
 */
export interface RecurringRetryResult {
  readonly transactionId: string
  readonly status: RecurringRetryStatus | (string & {}) | null
  readonly isPending: boolean
  readonly isFailed: boolean
  /** Which retry this was (1-3). */
  readonly count: number | null
  readonly errorCode: string | null
  readonly errorDescription: string | null
  readonly raw: Record<string, unknown>
}

/** Builds a frozen `RecurringStatus` from the unwrapped `data` object of `recurring/status`. */
export function parseRecurringStatus(data: Record<string, unknown>): RecurringStatus {
  const status = strictString(data, 'status')
  const registration = record(data.registration)
  return Object.freeze({
    alias: strictString(data, 'alias') ?? '',
    method: strictString(data, 'method'),
    status,
    isActive: status === RecurringAliasStatus.ACTIVE,
    expirationDate: strictString(data, 'expiration_date'),
    registration: registration === null ? null : parseRegistrationInfo(registration),
    raw: data,
  })
}

function parseRegistrationInfo(data: Record<string, unknown>): RecurringRegistrationInfo {
  return Object.freeze({
    transactionId: strictString(data, 'transaction_id'),
    label: strictString(data, 'label'),
    model: strictString(data, 'model'),
    frequency: strictString(data, 'frequency'),
    limitAmt: minorUnits(data.limit_amt),
    totLimitAmt: minorUnits(data.tot_limit_amt),
    isLimitAmtFixed: typeof data.is_limit_amt_fixed === 'boolean' ? data.is_limit_amt_fixed : null,
    initDate: strictString(data, 'init_date'),
    termsUrl: strictString(data, 'terms_url'),
    termsVersion: strictString(data, 'terms_version'),
    registeredAt: strictString(data, 'registered_at'),
    raw: data,
  })
}

/** Builds a frozen `RecurringRetryResult` from the unwrapped `data` object of `recurring/retry`. */
export function parseRecurringRetryResult(data: Record<string, unknown>): RecurringRetryResult {
  const retry = record(data.retry) ?? {}
  const status = strictString(retry, 'status')
  return Object.freeze({
    transactionId: scalarString(data, 'transactionId'),
    status,
    isPending: status === RecurringRetryStatus.PENDING,
    isFailed: status === RecurringRetryStatus.FAILED,
    count: isPhpInt(retry.count) ? (retry.count as number) : null,
    errorCode: strictString(retry, 'error'),
    errorDescription: strictString(retry, 'error_description'),
    raw: data,
  })
}

/** An integer, or a string of digits only (the API may send limits as strings); anything else is null. */
function minorUnits(value: unknown): number | null {
  if (isPhpInt(value)) return value as number
  return typeof value === 'string' && DIGITS.test(value) ? phpInt(value) : null
}
