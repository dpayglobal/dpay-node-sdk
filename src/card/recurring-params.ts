import { DPayValueError } from '../errors.js'
import { assertDate } from '../internal/validation.js'
import type { Money } from '../money.js'
import { type CardRecurringFrequency, assertCardRecurringFrequency } from './enums.js'

/** Registers a card mandate alongside a payment. */
export interface CardRecurringRegistrationParams {
  /** 1 to 50 characters. */
  label: string
  frequency?: CardRecurringFrequency | (string & {})
  limitAmt?: Money
  totLimitAmt?: Money
  limitAmtFixed?: boolean
  /** YYYY-MM-DD. */
  expirationDate?: string
  /** YYYY-MM-DD. */
  initDate?: string
}

/** Builds the wire-format card recurring registration object, taking `limitAmt` and `totLimitAmt` from `Money.minor`. Validates the label length (1-50 characters), the frequency and any dates. Throws DPayValueError if validation fails. */
export function serializeCardRecurringRegistration(
  params: CardRecurringRegistrationParams,
): Record<string, unknown> {
  if (params.label === '' || params.label.length > 50) {
    throw new DPayValueError('Mandate label must be 1-50 characters')
  }
  const data: Record<string, unknown> = { label: params.label }
  if (params.frequency !== undefined) {
    assertCardRecurringFrequency(params.frequency)
    data.frequency = params.frequency
  }
  if (params.limitAmt !== undefined) data.limit_amt = params.limitAmt.minor
  if (params.totLimitAmt !== undefined) data.tot_limit_amt = params.totLimitAmt.minor
  if (params.limitAmtFixed !== undefined) data.is_limit_amt_fixed = params.limitAmtFixed
  if (params.expirationDate !== undefined) data.expiration_date = assertDate(params.expirationDate)
  if (params.initDate !== undefined) data.init_date = assertDate(params.initDate)
  return data
}
