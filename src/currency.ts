import { DPayValueError } from './errors.js'

const PATTERN = /^[A-Z]{3}$/

/** Currency codes used by dpay. Any ISO-4217 style code is accepted. */
export const Currency = { PLN: 'PLN', EUR: 'EUR', CZK: 'CZK' } as const

export type Currency = (typeof Currency)[keyof typeof Currency] | (string & {})

export function isValidCurrency(code: string): boolean {
  return PATTERN.test(code)
}

export function assertCurrency(code: string): void {
  if (!isValidCurrency(code)) throw new DPayValueError(`Invalid currency code "${code}"`)
}
