import { DPayValueError } from '../errors.js'
import { phpMbStrlen, phpStrlen } from '../internal/php.js'
import { assertDate, isValidUrl } from '../internal/validation.js'
import { RecurringMethod, RecurringModel } from './enums.js'

const FREQUENCY = /^[1-9][0-9]{0,2}[DWMY]$/

/**
 * The `recurring_registration` object: registers a recurring payment (today BLIK) together with a payment
 * that carries the customer's BLIK code. See `RecurringModel` for what each model requires.
 */
export interface RecurringRegistrationParams {
  /** 1 to 50 characters, shown to the customer. */
  label: string
  model: RecurringModel | (string & {})
  /** The merchant's terms the customer accepted (consent evidence). Valid URL, at most 2048 characters. */
  termsUrl: string
  /** Your own alias, 1 to 128 characters; without it dpay assigns one. */
  alias?: string
  /** 1 to 64 characters. */
  termsVersion?: string
  /** Distinct methods, today only `blik`. */
  methods?: readonly (RecurringMethod | (string & {}))[]
  /** `1M`, `2W`, `14D`, `1Y` - 1 to 999 days, weeks, months or years. Required in A, not allowed in O. */
  frequency?: string
  /** Single payment limit in minor units (grosz), at least 1. Required in A, not allowed in O. */
  limitAmt?: number
  /** Total limit of all payments in minor units (grosz), at least 1. Required in A, not allowed in O. */
  totLimitAmt?: number
  /** Fixed amount. Model A allows only `true`; not allowed in O. */
  limitAmtFixed?: boolean
  /** YYYY-MM-DD, after today and at most 10 years ahead. Required in A. */
  expirationDate?: string
  /** YYYY-MM-DD, the first charge date (today or later). Required in A. */
  initDate?: string
}

/**
 * Builds the wire-format `recurring_registration` object in the key order dpay expects: `label, alias, model,
 * frequency, limit_amt, tot_limit_amt, is_limit_amt_fixed, expiration_date, init_date, methods, terms_url,
 * terms_version`. Validates every field and the model rules. Throws DPayValueError if validation fails.
 */
export function serializeRecurringRegistration(params: RecurringRegistrationParams): Record<string, unknown> {
  if (params.label === '' || phpMbStrlen(params.label) > 50) {
    throw new DPayValueError('Recurring payment label must be 1-50 characters')
  }
  if (!(Object.values(RecurringModel) as string[]).includes(params.model)) {
    throw new DPayValueError(`Invalid recurring model "${params.model}"`)
  }
  if (phpStrlen(params.termsUrl) > 2048 || !isValidUrl(params.termsUrl)) {
    throw new DPayValueError(`Invalid terms URL "${params.termsUrl}"`)
  }
  if (params.alias !== undefined && (params.alias === '' || phpStrlen(params.alias) > 128)) {
    throw new DPayValueError('Recurring alias must be 1-128 characters')
  }
  if (
    params.termsVersion !== undefined &&
    (params.termsVersion === '' || phpMbStrlen(params.termsVersion) > 64)
  ) {
    throw new DPayValueError('Terms version must be 1-64 characters')
  }
  if (params.methods !== undefined) assertMethods(params.methods)
  if (params.frequency !== undefined && !FREQUENCY.test(params.frequency)) {
    throw new DPayValueError(`Invalid recurring frequency "${params.frequency}"`)
  }
  if (params.limitAmt !== undefined) assertMinorUnits(params.limitAmt, 'limit_amt')
  if (params.totLimitAmt !== undefined) assertMinorUnits(params.totLimitAmt, 'tot_limit_amt')
  if (params.expirationDate !== undefined) assertDate(params.expirationDate)
  if (params.initDate !== undefined) assertDate(params.initDate)
  assertModelRules(params)

  const data: Record<string, unknown> = { label: params.label }
  if (params.alias !== undefined) data.alias = params.alias
  data.model = params.model
  if (params.frequency !== undefined) data.frequency = params.frequency
  if (params.limitAmt !== undefined) data.limit_amt = params.limitAmt
  if (params.totLimitAmt !== undefined) data.tot_limit_amt = params.totLimitAmt
  if (params.limitAmtFixed !== undefined) data.is_limit_amt_fixed = params.limitAmtFixed
  if (params.expirationDate !== undefined) data.expiration_date = params.expirationDate
  if (params.initDate !== undefined) data.init_date = params.initDate
  if (params.methods !== undefined) data.methods = [...params.methods]
  data.terms_url = params.termsUrl
  if (params.termsVersion !== undefined) data.terms_version = params.termsVersion
  return data
}

function assertMethods(methods: readonly string[]): void {
  if (!Array.isArray(methods) || methods.length === 0 || new Set(methods).size !== methods.length) {
    throw new DPayValueError('Methods must be a non-empty list of distinct methods')
  }
  for (const method of methods) {
    if (method !== RecurringMethod.BLIK) {
      throw new DPayValueError(`Unsupported recurring method "${method}"`)
    }
  }
}

function assertMinorUnits(value: number, field: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new DPayValueError(`${field} must be an integer number of minor units`)
  }
  if (value < 1) throw new DPayValueError(`${field} must be at least 1 (minor units)`)
}

function assertModelRules(params: RecurringRegistrationParams): void {
  if (params.model === RecurringModel.O) {
    const forbidden: Array<[string, unknown]> = [
      ['frequency', params.frequency],
      ['limit_amt', params.limitAmt],
      ['tot_limit_amt', params.totLimitAmt],
      ['is_limit_amt_fixed', params.limitAmtFixed],
    ]
    for (const [field, value] of forbidden) {
      if (value !== undefined) throw new DPayValueError(`${field} is not allowed in recurring model O`)
    }
  }
  if (params.model === RecurringModel.A) {
    const required: Array<[string, unknown]> = [
      ['frequency', params.frequency],
      ['limit_amt', params.limitAmt],
      ['tot_limit_amt', params.totLimitAmt],
      ['expiration_date', params.expirationDate],
      ['init_date', params.initDate],
    ]
    for (const [field, value] of required) {
      if (value === undefined) throw new DPayValueError(`${field} is required in recurring model A`)
    }
    if (params.limitAmtFixed === false) {
      throw new DPayValueError('Recurring model A requires a fixed amount (is_limit_amt_fixed = true)')
    }
  }
}
