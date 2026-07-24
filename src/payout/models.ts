import { Currency } from '../currency.js'
import { isScalar, phpInt } from '../internal/php.js'
import { Money } from '../money.js'
import { moneyOrZero, record, strictString } from '../payment/models.js'

/** Beneficiary of a payout. */
export interface PayoutReceiver {
  readonly nrb: string | null
  readonly title: string | null
  readonly amount: Money | null
  readonly service: string | null
  readonly receiverName: string | null
  readonly receiverAddress: string | null
  readonly raw: Record<string, unknown>
}

/** State of a single payout. */
export interface PayoutDetails {
  readonly id: number
  /** 0 waiting, 1 processed, -1 failed. */
  readonly state: number
  readonly net: Money
  readonly fee: Money
  readonly gross: Money
  readonly creationDate: string | null
  readonly isDirectSettlement: boolean
  readonly nrb: string | null
  readonly isDeclined: boolean
  readonly declineReason: string | null
  readonly declineStatus: string | null
  readonly receiver: PayoutReceiver | null
  readonly isWaiting: boolean
  readonly isProcessed: boolean
  readonly isFailed: boolean
  readonly raw: Record<string, unknown>
}

/** Builds a frozen `PayoutDetails` from the raw JSON body of `pbl/withdraws/details`. */
export function parsePayoutDetails(data: Record<string, unknown>): PayoutDetails {
  const state = isScalar(data.state) ? phpInt(data.state) : 0
  const receiver = record(data.receiver)
  return Object.freeze({
    id: isScalar(data.id) ? phpInt(data.id) : 0,
    state,
    net: moneyOrZero(data, 'net'),
    fee: moneyOrZero(data, 'fee'),
    gross: moneyOrZero(data, 'gross'),
    creationDate: strictString(data, 'creation_date'),
    isDirectSettlement: flag(data, 'direct_settlement'),
    nrb: strictString(data, 'nrb'),
    isDeclined: flag(data, 'declined'),
    declineReason: strictString(data, 'decline_reason'),
    declineStatus: strictString(data, 'decline_status'),
    receiver: receiver === null ? null : parsePayoutReceiver(receiver),
    isWaiting: state === 0,
    isProcessed: state === 1,
    isFailed: state === -1,
    raw: data,
  })
}

function parsePayoutReceiver(data: Record<string, unknown>): PayoutReceiver {
  return Object.freeze({
    nrb: strictString(data, 'nrb'),
    title: strictString(data, 'title'),
    amount: Money.tryFromApiNumber(data.amount, Currency.PLN),
    service: strictString(data, 'service'),
    receiverName: strictString(data, 'receiverName'),
    receiverAddress: strictString(data, 'receiverAddress'),
    raw: data,
  })
}

function flag(data: Record<string, unknown>, key: string): boolean {
  const value = data[key]
  return isScalar(value) ? phpInt(value) === 1 : false
}
