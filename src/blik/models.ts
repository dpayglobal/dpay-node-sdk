import { isPhpBool, isPhpInt, isScalar, phpStrval } from '../internal/php.js'
import { record, strictString } from '../payment/models.js'
import { BlikAliasType } from './enums.js'

/** A banking app that accepted the alias. */
export interface BlikApp {
  readonly key: string | null
  readonly label: string | null
}

/** A registered BLIK alias. */
export interface BlikAlias {
  readonly aliasValue: string
  readonly aliasType: BlikAliasType | (string & {})
  readonly status: string | null
  readonly expirationDate: string | null
  readonly apps: readonly BlikApp[]
  readonly isActive: boolean
  readonly raw: Record<string, unknown>
}

/** Mandate parameters attached to a recurring alias. */
export interface BlikRecurringRegistrationInfo {
  readonly model: string | null
  readonly frequency: string | null
  /** Single charge limit in minor units. */
  readonly limitAmt: number | null
  /** Total limit in minor units. */
  readonly totLimitAmt: number | null
  readonly isLimitAmtFixed: boolean | null
  readonly initDate: string | null
  readonly label: string | null
  readonly registeredAt: string | null
  readonly raw: Record<string, unknown>
}

/** State of a recurring BLIK mandate. */
export interface BlikRecurringStatus {
  readonly aliasValue: string
  readonly aliasType: BlikAliasType | (string & {})
  readonly status: string | null
  readonly expirationDate: string | null
  readonly registration: BlikRecurringRegistrationInfo | null
  readonly isActive: boolean
  readonly raw: Record<string, unknown>
}

/** Builds a frozen `BlikAlias` from the unwrapped `data` object of `blik/aliases`. */
export function parseBlikAlias(data: Record<string, unknown>): BlikAlias {
  const status = strictString(data, 'status')
  const apps = Array.isArray(data.apps) ? data.apps : []
  return Object.freeze({
    aliasValue: scalarStringOr(data, 'alias_value', ''),
    aliasType: scalarStringOr(data, 'alias_type', BlikAliasType.UID),
    status,
    expirationDate: strictString(data, 'expiration_date'),
    apps: Object.freeze(
      apps
        .filter((app): app is Record<string, unknown> => record(app) !== null)
        .map((app) => Object.freeze({ key: strictString(app, 'key'), label: strictString(app, 'label') })),
    ),
    isActive: status === 'ACTIVE',
    raw: data,
  })
}

/** Builds a frozen `BlikRecurringStatus` from the unwrapped `data` object of `blik/recurring/status`. */
export function parseBlikRecurringStatus(data: Record<string, unknown>): BlikRecurringStatus {
  const status = strictString(data, 'status')
  const registration = record(data.registration)
  return Object.freeze({
    aliasValue: scalarStringOr(data, 'alias_value', ''),
    aliasType: scalarStringOr(data, 'alias_type', BlikAliasType.PAYID),
    status,
    expirationDate: strictString(data, 'expiration_date'),
    registration: registration === null ? null : parseRegistrationInfo(registration),
    isActive: status === 'ACTIVE',
    raw: data,
  })
}

function parseRegistrationInfo(data: Record<string, unknown>): BlikRecurringRegistrationInfo {
  return Object.freeze({
    model: strictString(data, 'model'),
    frequency: strictString(data, 'frequency'),
    limitAmt: isPhpInt(data.limit_amt) ? (data.limit_amt as number) : null,
    totLimitAmt: isPhpInt(data.tot_limit_amt) ? (data.tot_limit_amt as number) : null,
    isLimitAmtFixed: isPhpBool(data.is_limit_amt_fixed) ? (data.is_limit_amt_fixed as boolean) : null,
    initDate: strictString(data, 'init_date'),
    label: strictString(data, 'label'),
    registeredAt: strictString(data, 'registered_at'),
    raw: data,
  })
}

function scalarStringOr(data: Record<string, unknown>, key: string, fallback: string): string {
  const value = data[key]
  return isScalar(value) ? phpStrval(value) : fallback
}
