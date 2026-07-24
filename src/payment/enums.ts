import { DPayValueError } from '../errors.js'

/** Payment flow requested at registration time. */
export const TransactionType = {
  TRANSFERS: 'transfers',
  DCB_GATEWAY: 'dcb_gateway',
  CARD_AUTH: 'card_auth',
  MB_WAY_DIRECT: 'mb_way_direct',
  BIZUM_DIRECT: 'bizum_direct',
  BLIK_RECURRING: 'blik_recurring',
  CARD_RECURRING: 'card_recurring',
} as const

export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType]

/** Validates that the value is a known transaction type, throws DPayValueError otherwise. */
export function assertTransactionType(value: string): void {
  if (!Object.values(TransactionType).includes(value as TransactionType)) {
    throw new DPayValueError(`Invalid transaction type "${value}"`)
  }
}

/** Lifecycle state of a transaction. The API may return values outside this list. */
export const TransactionStatus = {
  PAID: 'paid',
  CREATED: 'created',
  PROCESSING: 'processing',
  EXPIRED: 'expired',
  CAPTURED: 'captured',
} as const

export type TransactionStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus]

/** Who absorbs the payout fee. */
export const PayoutFeeMode = { NET: 'net', GROSS: 'gross' } as const

export type PayoutFeeMode = (typeof PayoutFeeMode)[keyof typeof PayoutFeeMode]

/** Validates that the value is a known payout fee mode, throws DPayValueError otherwise. */
export function assertPayoutFeeMode(value: string): void {
  if (!Object.values(PayoutFeeMode).includes(value as PayoutFeeMode)) {
    throw new DPayValueError(`Invalid payout fee mode "${value}"`)
  }
}
