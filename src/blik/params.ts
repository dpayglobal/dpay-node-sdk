import { DPayValueError } from '../errors.js'
import { assertDate } from '../internal/validation.js'
import type { Money } from '../money.js'
import { BlikAliasType, assertBlikAliasType } from './enums.js'

const FREQUENCY = /^[1-9][0-9]{0,2}[DWMQY]$/
const MODELS = ['A', 'M', 'O'] as const

/** Registers a one-off BLIK alias alongside a payment. */
export interface BlikAliasRegistrationParams {
  /** 1 to 50 characters, shown in the payer's banking app. */
  label: string
  /** Defaults to `UID`. */
  type?: BlikAliasType | (string & {})
}

/** Registers a recurring BLIK mandate alongside a payment. */
export interface BlikRecurringRegistrationParams {
  /** 1 to 50 characters. */
  label: string
  /** `A` automatic, `M` merchant initiated, `O` one-off. */
  model: (typeof MODELS)[number]
  /** Count plus unit, for example `12M`. Units: D, W, M, Q, Y. */
  frequency: string
  value?: Money
  /** Single charge limit in minor units. */
  limitAmt?: number
  /** Total limit in minor units. */
  totLimitAmt?: number
  limitAmtFixed?: boolean
  /** YYYY-MM-DD. */
  expirationDate?: string
  /** YYYY-MM-DD. */
  initDate?: string
}

/** Builds the wire-format BLIK alias registration object. Defaults `type` to `UID` and validates the label length (1-50 characters) and the type. Throws DPayValueError if validation fails. */
export function serializeBlikAliasRegistration(params: BlikAliasRegistrationParams): Record<string, unknown> {
  assertLabel(params.label, 'Alias label must be 1-50 characters')
  const type = params.type ?? BlikAliasType.UID
  assertBlikAliasType(type)
  return { label: params.label, type }
}

/** Builds the wire-format BLIK recurring registration object. Always forces `type` to `PAYID`, regardless of anything the caller set, and validates the label, model, frequency and any dates. Throws DPayValueError if validation fails. */
export function serializeBlikRecurringRegistration(
  params: BlikRecurringRegistrationParams,
): Record<string, unknown> {
  assertLabel(params.label, 'Alias label must be 1-50 characters')
  if (!(MODELS as readonly string[]).includes(params.model)) {
    throw new DPayValueError(`Invalid recurring model "${params.model}"`)
  }
  if (!FREQUENCY.test(params.frequency)) {
    throw new DPayValueError(`Invalid recurring frequency "${params.frequency}"`)
  }

  const data: Record<string, unknown> = {
    label: params.label,
    type: BlikAliasType.PAYID,
    model: params.model,
    frequency: params.frequency,
  }
  if (params.value !== undefined) data.value = params.value.toDecimal()
  if (params.limitAmt !== undefined) data.limit_amt = params.limitAmt
  if (params.totLimitAmt !== undefined) data.tot_limit_amt = params.totLimitAmt
  if (params.limitAmtFixed !== undefined) data.is_limit_amt_fixed = params.limitAmtFixed
  if (params.expirationDate !== undefined) data.expiration_date = assertDate(params.expirationDate)
  if (params.initDate !== undefined) data.init_date = assertDate(params.initDate)
  return data
}

function assertLabel(label: string, message: string): void {
  if (label === '' || label.length > 50) throw new DPayValueError(message)
}
