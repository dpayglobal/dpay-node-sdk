import { DPayValueError } from '../errors.js'
import { phpMbStrlen } from '../internal/php.js'
import { BlikAliasType, assertBlikAliasType } from './enums.js'

/** Registers a one-off BLIK alias alongside a payment. */
export interface BlikAliasRegistrationParams {
  /** 1 to 35 characters (BLIK limit), shown in the payer's banking app. */
  label: string
  /** Defaults to `UID`, the only type the API accepts. */
  type?: BlikAliasType | (string & {})
}

/** Builds the wire-format BLIK alias registration object. Defaults `type` to `UID` and validates the label length (1-35 characters) and the type. Throws DPayValueError if validation fails. */
export function serializeBlikAliasRegistration(params: BlikAliasRegistrationParams): Record<string, unknown> {
  if (params.label === '' || phpMbStrlen(params.label) > 35) {
    throw new DPayValueError('Alias label must be 1-35 characters')
  }
  const type = params.type ?? BlikAliasType.UID
  assertBlikAliasType(type)
  return { label: params.label, type }
}
