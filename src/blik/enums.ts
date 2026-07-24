import { DPayValueError } from '../errors.js'

/** BLIK alias namespace. */
export const BlikAliasType = { UID: 'UID', PAYID: 'PAYID' } as const

export type BlikAliasType = (typeof BlikAliasType)[keyof typeof BlikAliasType]

/** Validates that the value is a known BLIK alias type, throws DPayValueError otherwise. */
export function assertBlikAliasType(value: string): void {
  if (!Object.values(BlikAliasType).includes(value as BlikAliasType)) {
    throw new DPayValueError(`Invalid BLIK alias type "${value}"`)
  }
}
