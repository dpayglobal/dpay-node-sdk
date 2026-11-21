import { isNumeric, isPhpInt, isScalar, phpInt, phpStrval } from '../internal/php.js'
import { RecurringAliasStatus } from '../recurring/enums.js'

/** Kind of notification dpay sent. */
export const IpnType = {
  TRANSFER: 'transfer',
  /** @deprecated dpay no longer sends capture IPNs - use the `payment.captured` webhook event. */
  CAPTURE: 'capture',
  DCB: 'dcb',
  /** BLIK OneClick alias or recurring payment status change, sent to `aliasIpnUrl` (or the IPN URL). */
  ALIAS_UPDATE: 'alias_update',
} as const

export type IpnType = (typeof IpnType)[keyof typeof IpnType]

/**
 * Body dpay requires in the IPN response. It must be exactly this string;
 * the HTTP status is ignored.
 */
export const IPN_ACK = 'OK'

/** `change_type` of an `alias_update` IPN. */
export const AliasChangeType = {
  REGISTER: 'ALIAS_REGISTER',
  UPDATE: 'ALIAS_UPDATE',
  UNREGISTER: 'ALIAS_UNREGISTER',
  EXPIRED: 'ALIAS_EXPIRED',
  DECLINED: 'ALIAS_DECLINED',
} as const

export type AliasChangeType = (typeof AliasChangeType)[keyof typeof AliasChangeType]

/** `alias_type` of an `alias_update` IPN: `UID` (BLIK OneClick) or `PAYID` (recurring payment). */
export const IpnAliasType = { UID: 'UID', PAYID: 'PAYID' } as const

export type IpnAliasType = (typeof IpnAliasType)[keyof typeof IpnAliasType]

/**
 * Payload of an `alias_update` IPN: a BLIK OneClick alias (alias type `UID`) or a recurring payment (`PAYID`)
 * changed its status. Sent to `aliasIpnUrl` from the registration, or to the IPN URL without it. `aliasStatus`
 * takes the `RecurringAliasStatus` values (`ACTIVE`, `INACTIVE`, `UNREGISTERED`, `EXPIRED`, `DECLINED`).
 *
 * The signature covers only `id`, `type` and `version` - none of these fields. Anyone who has seen one
 * alias_update of a payment can replay it with a different status, so before acting on a change (for example
 * stopping a subscription) confirm the current state with `dpay.recurring.status()` or `dpay.blik.alias()`.
 */
export interface AliasUpdate {
  /** `ALIAS_REGISTER`, `ALIAS_UPDATE`, `ALIAS_UNREGISTER`, `ALIAS_EXPIRED` or `ALIAS_DECLINED` (`AliasChangeType`). */
  readonly changeType: AliasChangeType | (string & {}) | null
  /** `UID` (BLIK OneClick) or `PAYID` (recurring payment) - `IpnAliasType`. */
  readonly aliasType: IpnAliasType | (string & {}) | null
  /** `ACTIVE`, `INACTIVE`, `UNREGISTERED`, `EXPIRED` or `DECLINED` (`RecurringAliasStatus`). */
  readonly aliasStatus: RecurringAliasStatus | (string & {}) | null
  /** `aliasStatus` is `ACTIVE`. */
  readonly isActive: boolean
  /** Alias identifier at BLIK - not the alias value you send with payments. */
  readonly aliasKey: string | null
  readonly aliasLabel: string | null
  readonly aliasExpireAt: string | null
  readonly changeReasonCategory: string | null
  readonly changeReasonMessage: string | null
  readonly raw: Record<string, unknown>
}

/** A verified IPN notification. */
export interface IpnEvent {
  /** Payment ID - for `alias_update` the payment that registered the alias. */
  readonly id: string
  /**
   * Raw decimal string. The payload carries no currency, so compare it to your own order. Empty for
   * `alias_update` - its signature does not cover an amount, so a value in the payload is ignored.
   */
  readonly amount: string
  /** Payer's email; null for `alias_update` (not signed there). */
  readonly email: string | null
  readonly type: IpnType | (string & {})
  /** Delivery attempt; 0 for `alias_update` (not signed there). */
  readonly attempt: number
  readonly version: number
  /** Whatever you passed as `custom` at registration time; null for `alias_update` (not signed there). */
  readonly custom: string | null
  /** @deprecated dpay no longer sends capture IPNs - use the `payment.captured` webhook event. */
  readonly capturePaymentId: string | null
  readonly signature: string
  readonly isTransfer: boolean
  /** @deprecated dpay no longer sends capture IPNs - use the `payment.captured` webhook event. */
  readonly isCapture: boolean
  readonly isDcb: boolean
  /** BLIK OneClick alias or recurring payment status change - details in `aliasUpdate`. */
  readonly isAliasUpdate: boolean
  /** Alias change of an `alias_update` IPN; null for other types. */
  readonly aliasUpdate: AliasUpdate | null
  readonly raw: Record<string, unknown>
}

export function buildIpnEvent(raw: Record<string, unknown>): IpnEvent {
  const type = scalar(raw, 'type') ?? ''
  const isAliasUpdate = type === IpnType.ALIAS_UPDATE
  // The alias_update signature does not cover the transfer fields - an injected value must not be exposed
  const transfer: Record<string, unknown> = isAliasUpdate ? {} : raw
  return Object.freeze({
    id: scalar(raw, 'id') ?? '',
    amount: scalar(transfer, 'amount') ?? '',
    email: scalar(transfer, 'email'),
    type,
    attempt: isNumeric(transfer.attempt) ? phpInt(transfer.attempt) : 0,
    version: isNumeric(raw.version) ? phpInt(raw.version) : 0,
    custom: scalar(transfer, 'custom'),
    capturePaymentId: scalar(raw, 'capture_payment_id'),
    signature: scalar(raw, 'signature') ?? '',
    isTransfer: type === IpnType.TRANSFER,
    isCapture: type === IpnType.CAPTURE,
    isDcb: type === IpnType.DCB,
    isAliasUpdate,
    aliasUpdate: isAliasUpdate ? parseAliasUpdate(raw) : null,
    raw,
  })
}

function parseAliasUpdate(raw: Record<string, unknown>): AliasUpdate {
  const aliasStatus = stringOrInt(raw, 'alias_status')
  return Object.freeze({
    changeType: stringOrInt(raw, 'change_type'),
    aliasType: stringOrInt(raw, 'alias_type'),
    aliasStatus,
    isActive: aliasStatus === RecurringAliasStatus.ACTIVE,
    aliasKey: stringOrInt(raw, 'alias_key'),
    aliasLabel: stringOrInt(raw, 'alias_label'),
    aliasExpireAt: stringOrInt(raw, 'alias_expire_at'),
    changeReasonCategory: stringOrInt(raw, 'change_reason_category'),
    changeReasonMessage: stringOrInt(raw, 'change_reason_message'),
    raw,
  })
}

function stringOrInt(raw: Record<string, unknown>, key: string): string | null {
  const value = raw[key]
  return typeof value === 'string' || isPhpInt(value) ? phpStrval(value) : null
}

function scalar(raw: Record<string, unknown>, key: string): string | null {
  const value = raw[key]
  return isScalar(value) ? phpStrval(value) : null
}
