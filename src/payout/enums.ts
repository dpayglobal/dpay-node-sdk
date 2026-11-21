import { DPayValueError } from '../errors.js'

/** Payout `state`: 0 waiting, 1 processed, -1 failure. */
export const PayoutState = { WAITING: 0, PROCESSED: 1, FAILED: -1 } as const

export type PayoutState = (typeof PayoutState)[keyof typeof PayoutState]

/** Validates that the value is a known payout state, throws DPayValueError otherwise. */
export function assertPayoutState(value: unknown): void {
  if (!(Object.values(PayoutState) as unknown[]).includes(value)) {
    throw new DPayValueError(`Invalid payout state "${String(value)}"`)
  }
}

/**
 * Payout `type` in the payout list: `direct` covers exactly one payment (1:1 payout instruction, refund form
 * payout).
 */
export const PayoutType = { STANDARD: 'standard', DIRECT: 'direct', PAYSAFECARD: 'paysafecard' } as const

export type PayoutType = (typeof PayoutType)[keyof typeof PayoutType]

/** Validates that the value is a known payout type, throws DPayValueError otherwise. */
export function assertPayoutType(value: unknown): void {
  if (!(Object.values(PayoutType) as unknown[]).includes(value)) {
    throw new DPayValueError(`Invalid payout type "${String(value)}"`)
  }
}
