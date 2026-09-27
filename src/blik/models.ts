import { isScalar, phpStrval } from '../internal/php.js'
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

function scalarStringOr(data: Record<string, unknown>, key: string, fallback: string): string {
  const value = data[key]
  return isScalar(value) ? phpStrval(value) : fallback
}
