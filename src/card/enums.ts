import { DPayValueError } from '../errors.js'

/** What the merchant must do next after a card operation. */
export const RedirectType = {
  SUCCESS: 'SUCCESS',
  FORM: 'FORM',
  URL: 'URL',
  DCC_OFFER: 'DCC_OFFER',
} as const

export type RedirectType = (typeof RedirectType)[keyof typeof RedirectType]

/** Payer's answer to a dynamic currency conversion offer. */
export const DccDecision = { ACCEPT: 'accept', REJECT: 'reject' } as const

export type DccDecision = (typeof DccDecision)[keyof typeof DccDecision]

/** Validates that the value is a known DCC decision, throws DPayValueError otherwise. */
export function assertDccDecision(value: string): void {
  if (!Object.values(DccDecision).includes(value as DccDecision)) {
    throw new DPayValueError(`Invalid DCC decision "${value}"`)
  }
}

/** Card-on-file operation requested at registration time. */
export const CardRecurringOperation = {
  ADD_CARD: 'add_card',
  COF_INITIAL: 'cof_initial',
  CHARGE: 'charge',
} as const

export type CardRecurringOperation = (typeof CardRecurringOperation)[keyof typeof CardRecurringOperation]

/** Validates that the value is a known card recurring operation, throws DPayValueError otherwise. */
export function assertCardRecurringOperation(value: string): void {
  if (!Object.values(CardRecurringOperation).includes(value as CardRecurringOperation)) {
    throw new DPayValueError(`Invalid card recurring operation "${value}"`)
  }
}

/** Charge cadence of a card mandate. */
export const CardRecurringFrequency = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  BIWEEKLY: 'BIWEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  SEMIANNUAL: 'SEMIANNUAL',
  ANNUAL: 'ANNUAL',
} as const

export type CardRecurringFrequency = (typeof CardRecurringFrequency)[keyof typeof CardRecurringFrequency]

/** Validates that the value is a known card recurring frequency, throws DPayValueError otherwise. */
export function assertCardRecurringFrequency(value: string): void {
  if (!Object.values(CardRecurringFrequency).includes(value as CardRecurringFrequency)) {
    throw new DPayValueError(`Invalid card recurring frequency "${value}"`)
  }
}
