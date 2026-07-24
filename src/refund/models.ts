import { scalarStringOrNull } from '../payment/models.js'

/** Outcome of a refund request. */
export interface Refund {
  readonly isAccepted: boolean
  readonly message: string | null
  readonly raw: Record<string, unknown>
}

/** Outcome of a refund availability check. */
export interface RefundAvailability {
  readonly isAvailable: boolean
  readonly message: string | null
  /** HTTP status the API answered with. The API signals refusal through the status. */
  readonly httpStatus: number
  readonly raw: Record<string, unknown>
}

/** Builds a frozen `Refund` from the raw JSON body of `pbl/refund`. */
export function parseRefund(data: Record<string, unknown>): Refund {
  return Object.freeze({
    isAccepted: data.status === 'success' && data.refund === true,
    message: scalarStringOrNull(data, 'message'),
    raw: data,
  })
}

/** Builds a frozen `RefundAvailability` from the raw JSON body of `pbl/check-refund-availability`. */
export function parseRefundAvailability(
  data: Record<string, unknown>,
  httpStatus: number,
): RefundAvailability {
  return Object.freeze({
    isAvailable: data.refund === true,
    message: scalarStringOrNull(data, 'message'),
    httpStatus,
    raw: data,
  })
}
