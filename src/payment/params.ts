import { DPayValueError } from '../errors.js'
import { isValidDate } from '../internal/validation.js'
import type { Money } from '../money.js'
import { PayoutFeeMode, assertPayoutFeeMode } from './enums.js'

/** Where dpay sends the payer back, and where it posts the IPN. */
export interface ReturnUrls {
  /** Payer returns here after a successful payment. */
  success: string
  /** Payer returns here after a failed payment. */
  fail: string
  /**
   * dpay posts the IPN here. Must be reachable from the internet. Optional: without it `url_ipn` is not
   * sent and no IPN arrives - the outcome comes as a webhook event.
   */
  ipn?: string | null | undefined
}

/** Optional payer identity, prefilled on the payment page. */
export interface PayerParams {
  email?: string
  firstName?: string
  lastName?: string
}

/** 3-D Secure device fingerprint, required for card payments. */
export interface DeviceInfoParams {
  browserAcceptHeader: string
  browserLanguage: string
  browserColorDepth: number
  browserScreenHeight: number
  browserScreenWidth: number
  /** Timezone offset in minutes, as reported by `Date.prototype.getTimezoneOffset`. */
  browserTz: number
  browserUserAgent: string
  systemFamily: string
  geoLocalization: string
  /** 1 to 64 characters. */
  deviceId: string
  /** 1 to 64 characters. */
  applicationName: string
  browserJavaEnabled?: boolean | undefined
}

/** KSeF invoice details, only valid together with `efaktura`. */
export interface InvoiceParams {
  payerNip?: string
  payerName?: string
  invoiceNumber?: string
  /** YYYY-MM-DD. */
  paymentDueDate?: string
  vatAmount?: Money
}

/** One leg of a 1:1 payout attached to a payment. */
export interface PayoutPositionParams {
  iban: string
  /** 1 to 255 characters. */
  title: string
  amount: Money
}

/** Payout instruction attached to a payment. */
export interface PayoutInstructionParams {
  positions: readonly PayoutPositionParams[]
  /** Defaults to `net`. */
  feeMode?: PayoutFeeMode | (string & {})
}

/** Builds the wire-format device_info object, validating deviceId and applicationName are 1-64 characters. Throws DPayValueError if length bounds are violated. */
export function serializeDeviceInfo(info: DeviceInfoParams): Record<string, unknown> {
  if (info.deviceId === '' || info.deviceId.length > 64) {
    throw new DPayValueError('Device ID must be 1-64 characters')
  }
  if (info.applicationName === '' || info.applicationName.length > 64) {
    throw new DPayValueError('Application name must be 1-64 characters')
  }
  const data: Record<string, unknown> = {
    browserAcceptHeader: info.browserAcceptHeader,
    browserLanguage: info.browserLanguage,
    browserColorDepth: info.browserColorDepth,
    browserScreenHeight: info.browserScreenHeight,
    browserScreenWidth: info.browserScreenWidth,
    browserTZ: info.browserTz,
    browserUserAgent: info.browserUserAgent,
    systemFamily: info.systemFamily,
    geoLocalization: info.geoLocalization,
    deviceID: info.deviceId,
    applicationName: info.applicationName,
  }
  if (info.browserJavaEnabled !== undefined) {
    data.browserJavaEnabled = info.browserJavaEnabled ? 'true' : 'false'
  }
  return data
}

/** Builds the wire-format invoice object. Throws DPayValueError if payment due date is not in YYYY-MM-DD format. */
export function serializeInvoice(invoice: InvoiceParams): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  if (invoice.payerNip !== undefined) data.payer_nip = invoice.payerNip
  if (invoice.payerName !== undefined) data.payer_name = invoice.payerName
  if (invoice.invoiceNumber !== undefined) data.invoice_number = invoice.invoiceNumber
  if (invoice.paymentDueDate !== undefined) {
    if (!isValidDate(invoice.paymentDueDate)) {
      throw new DPayValueError('Payment due date must be in YYYY-MM-DD format')
    }
    data.payment_due_date = invoice.paymentDueDate
  }
  if (invoice.vatAmount !== undefined) data.vat_amount = invoice.vatAmount.minor
  return data
}

/** Builds the wire-format payout object, requiring at least one position with valid IBAN and title (1-255 characters). Throws DPayValueError if validation fails. */
export function serializePayoutInstruction(payout: PayoutInstructionParams): Record<string, unknown> {
  if (payout.positions.length === 0) {
    throw new DPayValueError('Payout instruction requires at least one position')
  }
  const feeMode = payout.feeMode ?? PayoutFeeMode.NET
  assertPayoutFeeMode(feeMode)
  return {
    fee_mode: feeMode,
    positions: payout.positions.map((position) => {
      if (position.iban === '') throw new DPayValueError('Payout IBAN must not be empty')
      if (position.title === '' || position.title.length > 255) {
        throw new DPayValueError('Payout title must be 1-255 characters')
      }
      return { iban: position.iban, title: position.title, amount: Number(position.amount.toDecimal()) }
    }),
  }
}
