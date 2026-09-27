import type { BlikAliasRegistrationParams } from '../blik/params.js'
import { serializeBlikAliasRegistration } from '../blik/params.js'
import { type CardRecurringOperation, assertCardRecurringOperation } from '../card/enums.js'
import type { CardRecurringRegistrationParams } from '../card/recurring-params.js'
import { serializeCardRecurringRegistration } from '../card/recurring-params.js'
import { assertCurrency } from '../currency.js'
import { DPayValueError } from '../errors.js'
import { phpMbStrlen, phpStrlen, phpTrim } from '../internal/php.js'
import { hasControlCharacters, isValidEmail, isValidIp, isValidUrl } from '../internal/validation.js'
import type { Money } from '../money.js'
import type { RecurringRegistrationParams } from '../recurring/params.js'
import { serializeRecurringRegistration } from '../recurring/params.js'
import { WebhookEventType } from '../webhook/event-type.js'
import { type WebhookTarget, serializeWebhookTarget } from '../webhook/target.js'
import { TransactionType, assertTransactionType } from './enums.js'
import type {
  DeviceInfoParams,
  InvoiceParams,
  PayerParams,
  PayoutInstructionParams,
  ReturnUrls,
} from './params.js'
import { serializeDeviceInfo, serializeInvoice, serializePayoutInstruction } from './params.js'

const PARTNER_PLATFORM = /^[A-Z0-9]{1,64}$/
const BLIK_CODE = /^\d{6}$/

/** Everything `payments.register` accepts. Only the first three fields are required. */
export interface RegisterPaymentParams {
  /** Amount to charge. */
  amount: Money
  /** Payment flow. */
  transactionType: TransactionType | (string & {})
  /** Success, failure and (optional) IPN URLs. */
  urls: ReturnUrls
  description?: string
  /** Opaque merchant reference, echoed back in the IPN. */
  custom?: string
  payer?: PayerParams
  acceptTos?: boolean
  /** Payment channel identifier from panel.dpay.pl. */
  channel?: string
  creditCard?: boolean
  paysafecard?: boolean
  blik?: boolean
  installment?: boolean
  paypal?: boolean
  /** Hides the bank list on the payment page. */
  noBanks?: boolean
  /** Requires `currencyCode` to be set as well. */
  phoneNumber?: string
  currencyCode?: string
  /** Uppercase letters and digits, up to 64 characters. */
  partnerPlatform?: string
  /**
   * Payer's browser. Required together with `blikCode` or `blikAlias`; optional client context of a recurring
   * charge (`recurringAlias`).
   */
  userAgent?: string
  /**
   * Payer's IP address. Required together with `blikCode` or `blikAlias`; optional client context of a recurring
   * charge (`recurringAlias`), validated as an IPv4 or IPv6 address when given without a BLIK code or alias.
   */
  userIp?: string
  /** Exactly six digits. Cannot be combined with `blikAlias`. */
  blikCode?: string
  /** BLIK OneClick alias (`UID`). Cannot be combined with `blikCode`, alias registrations or recurring payments. */
  blikAlias?: string
  registerBlikAlias?: BlikAliasRegistrationParams
  /**
   * Registers a recurring payment together with this payment. Requires the customer's `blikCode` and
   * `transactionType` `transfers`; the amount may be 0 (consent only) or an initial fee.
   */
  recurringRegistration?: RecurringRegistrationParams
  /**
   * Charges a registered recurring payment server-to-server (no BLIK code), 1 to 128 characters.
   * `transactionType` `transfers`, amount above 0. The alias is appended to the checksum, binding the charge
   * to that customer.
   */
  recurringAlias?: string
  aliasIpnUrl?: string
  noDelay?: boolean
  /** Cannot be combined with `cardRecurringAlias`. */
  registerCardRecurring?: CardRecurringRegistrationParams
  /** Cannot be combined with `registerCardRecurring`. */
  cardRecurringAlias?: string
  authorizeOnly?: boolean
  cardRecurringOperation?: CardRecurringOperation | (string & {})
  payout?: PayoutInstructionParams
  billingAddress?: Record<string, unknown>
  shippingAddress?: Record<string, unknown>
  deviceInfo?: DeviceInfoParams
  products?: ReadonlyArray<Record<string, unknown>>
  /** Only valid when `transactionType` is `transfers`. */
  efaktura?: boolean
  invoice?: InvoiceParams
  /**
   * Also sends this payment's events (and later events of its refunds and recurring payment) to this URL,
   * signed with the service's webhook secret. Payment and recurring payment events only. Not part of the checksum.
   */
  webhook?: WebhookTarget
  /**
   * Your reference of the payment, 1 to 64 characters after trimming, without control characters; returned as
   * `references.merchant` in webhooks. Not part of the checksum.
   */
  reference?: string
}

/**
 * Builds the request body for `payments/register`, in the exact key order dpay expects on the wire.
 *
 * Validates the mandatory fields (transaction type, URLs, payer email when present), enforces the
 * cross-field exclusions and companion-field requirements the PHP SDK enforced through its builder
 * method signatures, and the combinations a recurring payment allows.
 *
 * Nested objects and arrays are copied, not aliased, so mutating the caller's `params` after this
 * call cannot change the returned body.
 *
 * Throws `DPayValueError` if any field fails validation or an exclusion/companion rule is violated.
 */
export function buildRegisterBody(service: string, params: RegisterPaymentParams): Record<string, unknown> {
  assertTransactionType(params.transactionType)
  assertExclusions(params)
  assertRecurringCombination(params)

  const body: Record<string, unknown> = {
    service,
    value: params.amount.toDecimal(),
    transactionType: params.transactionType,
    url_success: assertUrl(params.urls.success, 'success'),
    url_fail: assertUrl(params.urls.fail, 'fail'),
  }
  if (params.urls.ipn !== undefined && params.urls.ipn !== null) {
    body.url_ipn = assertUrl(params.urls.ipn, 'ipn')
  }

  if (params.description !== undefined) body.description = params.description
  if (params.custom !== undefined) body.custom = params.custom
  if (params.payer?.email !== undefined) {
    if (!isValidEmail(params.payer.email)) throw new DPayValueError(`Invalid email "${params.payer.email}"`)
    body.email = params.payer.email
  }
  if (params.payer?.firstName !== undefined) body.client_name = params.payer.firstName
  if (params.payer?.lastName !== undefined) body.client_surname = params.payer.lastName
  if (params.acceptTos !== undefined) body.accept_tos = params.acceptTos
  if (params.channel !== undefined) body.channel = params.channel

  const toggles: Array<[string, boolean | undefined]> = [
    ['creditcard', params.creditCard],
    ['paysafecard', params.paysafecard],
    ['blik', params.blik],
    ['installment', params.installment],
    ['paypal', params.paypal],
    ['nobanks', params.noBanks],
  ]
  for (const [key, flag] of toggles) {
    if (flag !== undefined) body[key] = flag ? 1 : 0
  }

  if (params.phoneNumber !== undefined) body.phone_number = params.phoneNumber
  if (params.currencyCode !== undefined) {
    assertCurrency(params.currencyCode)
    body.currency_code = params.currencyCode
  }
  if (params.partnerPlatform !== undefined) {
    if (!PARTNER_PLATFORM.test(params.partnerPlatform)) {
      throw new DPayValueError('Partner platform must match ^[A-Z0-9]{1,64}$')
    }
    body.partner_platform = params.partnerPlatform
  }
  if (params.userAgent !== undefined) body.user_agent = params.userAgent
  if (params.userIp !== undefined) body.user_ip = params.userIp
  if (params.blikCode !== undefined) {
    if (!BLIK_CODE.test(params.blikCode)) throw new DPayValueError('BLIK code must be exactly 6 digits')
    body.blik_code = params.blikCode
  }
  if (params.blikAlias !== undefined) body.blik_alias = params.blikAlias
  if (params.registerBlikAlias !== undefined) {
    body.register_blik_alias = serializeBlikAliasRegistration(params.registerBlikAlias)
  }
  if (params.recurringRegistration !== undefined) {
    body.recurring_registration = serializeRecurringRegistration(params.recurringRegistration)
  }
  if (params.recurringAlias !== undefined) body.recurring_alias = params.recurringAlias
  if (params.aliasIpnUrl !== undefined) {
    if (!isValidUrl(params.aliasIpnUrl)) {
      throw new DPayValueError(`Invalid alias IPN URL "${params.aliasIpnUrl}"`)
    }
    body.alias_ipn_url = params.aliasIpnUrl
  }
  if (params.noDelay !== undefined) body.no_delay = params.noDelay
  if (params.registerCardRecurring !== undefined) {
    body.register_card_recurring = serializeCardRecurringRegistration(params.registerCardRecurring)
  }
  if (params.cardRecurringAlias !== undefined) body.card_recurring_alias = params.cardRecurringAlias
  if (params.authorizeOnly !== undefined) body.authorize_only = params.authorizeOnly
  if (params.cardRecurringOperation !== undefined) {
    assertCardRecurringOperation(params.cardRecurringOperation)
    body.card_recurring_operation = params.cardRecurringOperation
  }
  if (params.payout !== undefined) body.payout = serializePayoutInstruction(params.payout)
  if (params.billingAddress !== undefined) body.billing_address = { ...params.billingAddress }
  if (params.shippingAddress !== undefined) body.shipping_address = { ...params.shippingAddress }
  if (params.deviceInfo !== undefined) body.device_info = serializeDeviceInfo(params.deviceInfo)
  if (params.products !== undefined) body.products = params.products.map((product) => ({ ...product }))
  if (params.efaktura !== undefined) body.efaktura = params.efaktura
  if (params.invoice !== undefined) body.invoice = serializeInvoice(params.invoice)
  if (params.webhook !== undefined) {
    body.webhook = serializeWebhookTarget(
      params.webhook,
      WebhookEventType.PAYMENT_REGISTRATION,
      'a payment registration',
    )
  }
  if (params.reference !== undefined) body.reference = normalizeReference(params.reference)

  return body
}

function assertExclusions(params: RegisterPaymentParams): void {
  if (params.blikCode !== undefined && params.blikAlias !== undefined) {
    throw new DPayValueError('blik_code cannot be combined with blik_alias')
  }
  if (
    params.blikAlias !== undefined &&
    (params.registerBlikAlias !== undefined ||
      params.recurringRegistration !== undefined ||
      params.recurringAlias !== undefined)
  ) {
    throw new DPayValueError(
      'blik_alias cannot be combined with blik_code, alias registration or recurring payments',
    )
  }
  if (params.registerCardRecurring !== undefined && params.cardRecurringAlias !== undefined) {
    throw new DPayValueError('register_card_recurring cannot be combined with card_recurring_alias')
  }
  if (params.efaktura === true && params.transactionType !== 'transfers') {
    throw new DPayValueError('efaktura is allowed only for transactionType "transfers"')
  }
  if (
    (params.blikCode !== undefined || params.blikAlias !== undefined) &&
    (params.userAgent === undefined || params.userIp === undefined)
  ) {
    throw new DPayValueError('blik_code and blik_alias require user_agent and user_ip')
  }
  // Without a BLIK code or alias the payer's IP is the client context of the payment
  if (
    params.userIp !== undefined &&
    params.blikCode === undefined &&
    params.blikAlias === undefined &&
    !isValidIp(params.userIp)
  ) {
    throw new DPayValueError(`Invalid user IP "${params.userIp}"`)
  }
  if (params.phoneNumber !== undefined && params.currencyCode === undefined) {
    throw new DPayValueError('phone_number requires currency_code')
  }
  if (
    params.recurringAlias !== undefined &&
    (params.recurringAlias === '' || phpStrlen(params.recurringAlias) > 128)
  ) {
    throw new DPayValueError('Recurring alias must be 1-128 characters')
  }
}

/** The fields a recurring registration or charge excludes, and what each of them requires. */
function assertRecurringCombination(params: RegisterPaymentParams): void {
  const registration = params.recurringRegistration !== undefined
  const charge = params.recurringAlias !== undefined
  if (!registration && !charge) return
  if (registration && charge) {
    throw new DPayValueError('recurring_registration cannot be combined with recurring_alias')
  }
  if (params.transactionType !== TransactionType.TRANSFERS) {
    throw new DPayValueError('Recurring payments require transactionType "transfers"')
  }
  const conflicts: Array<[string, unknown]> = [
    ['blik_alias', params.blikAlias],
    ['register_blik_alias', params.registerBlikAlias],
    ['register_card_recurring', params.registerCardRecurring],
    ['card_recurring_alias', params.cardRecurringAlias],
  ]
  if (registration) {
    conflicts.push(['channel', params.channel])
    if (params.blikCode === undefined) {
      throw new DPayValueError("recurring_registration requires the customer's BLIK code (blikCode)")
    }
  } else {
    conflicts.push(['blik_code', params.blikCode])
    if (params.amount.minor <= 0) throw new DPayValueError('A recurring charge requires an amount above 0')
  }
  for (const [field, value] of conflicts) {
    if (value !== undefined) throw new DPayValueError(`${field} cannot be combined with a recurring payment`)
  }
}

function normalizeReference(reference: string): string {
  const trimmed = phpTrim(reference)
  if (trimmed === '' || phpMbStrlen(trimmed) > 64 || hasControlCharacters(trimmed)) {
    throw new DPayValueError('Reference must be 1-64 characters without control characters')
  }
  return trimmed
}

function assertUrl(url: string, name: string): string {
  if (!isValidUrl(url)) throw new DPayValueError(`Invalid ${name} URL "${url}"`)
  return url
}
