import { isNumeric, isScalar, phpInt, phpStrval } from '../internal/php.js'

/** Kind of notification dpay sent. */
export const IpnType = { TRANSFER: 'transfer', CAPTURE: 'capture', DCB: 'dcb' } as const

export type IpnType = (typeof IpnType)[keyof typeof IpnType]

/**
 * Body dpay requires in the IPN response. It must be exactly this string;
 * the HTTP status is ignored.
 */
export const IPN_ACK = 'OK'

/** A verified IPN notification. */
export interface IpnEvent {
  readonly id: string
  /** Raw decimal string. The payload carries no currency, so compare it to your own order. */
  readonly amount: string
  readonly email: string | null
  readonly type: IpnType | (string & {})
  readonly attempt: number
  readonly version: number
  /** Whatever you passed as `custom` at registration time. */
  readonly custom: string | null
  readonly capturePaymentId: string | null
  readonly signature: string
  readonly isTransfer: boolean
  readonly isCapture: boolean
  readonly isDcb: boolean
  readonly raw: Record<string, unknown>
}

export function buildIpnEvent(raw: Record<string, unknown>): IpnEvent {
  const type = scalar(raw, 'type') ?? ''
  return Object.freeze({
    id: scalar(raw, 'id') ?? '',
    amount: scalar(raw, 'amount') ?? '',
    email: scalar(raw, 'email'),
    type,
    attempt: isNumeric(raw.attempt) ? phpInt(raw.attempt) : 0,
    version: isNumeric(raw.version) ? phpInt(raw.version) : 0,
    custom: scalar(raw, 'custom'),
    capturePaymentId: scalar(raw, 'capture_payment_id'),
    signature: scalar(raw, 'signature') ?? '',
    isTransfer: type === IpnType.TRANSFER,
    isCapture: type === IpnType.CAPTURE,
    isDcb: type === IpnType.DCB,
    raw,
  })
}

function scalar(raw: Record<string, unknown>, key: string): string | null {
  const value = raw[key]
  return isScalar(value) ? phpStrval(value) : null
}
