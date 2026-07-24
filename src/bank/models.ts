import { isScalar, phpInt } from '../internal/php.js'
import { scalarString, strictString } from '../payment/models.js'

/** A bank offered on the transfer payment page. */
export interface Bank {
  readonly id: string
  readonly name: string
  /** Logo file name, when the API provides one. */
  readonly image: string | null
  /** First hour of the day the bank accepts transfers. */
  readonly onFrom: number
  /** Last hour of the day the bank accepts transfers. */
  readonly onTo: number
  readonly iterator: number | null
  readonly isTest: boolean
  readonly type: string | null
  readonly raw: Record<string, unknown>
}

/** Builds a frozen `Bank` from a single element of the `pbl/banks` response. */
export function parseBank(data: Record<string, unknown>): Bank {
  return Object.freeze({
    id: scalarString(data, 'id'),
    name: scalarString(data, 'name'),
    image: strictString(data, 'image'),
    onFrom: isScalar(data.on_from) ? phpInt(data.on_from) : 0,
    onTo: isScalar(data.on_to) ? phpInt(data.on_to) : 0,
    iterator: isScalar(data.iterator) ? phpInt(data.iterator) : null,
    isTest: isScalar(data.test) ? phpBool(data.test) : false,
    type: strictString(data, 'type'),
    raw: data,
  })
}

function phpBool(value: unknown): boolean {
  if (typeof value === 'string') return value !== '' && value !== '0'
  return Boolean(value)
}
