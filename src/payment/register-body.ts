import type { BlikAliasRegistrationParams } from '../blik/params.js'
import { serializeBlikAliasRegistration } from '../blik/params.js'
import { type CardRecurringOperation, assertCardRecurringOperation } from '../card/enums.js'
import type { CardRecurringRegistrationParams } from '../card/recurring-params.js'
import { serializeCardRecurringRegistration } from '../card/recurring-params.js'
import { Currency, assertCurrency } from '../currency.js'
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
/** Channels the API refuses as a direct `channel`. */
const FORBIDDEN_CHANNELS = ['tester', 'paypal', 'installment', 'paysafecard']

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
  /** Required with a direct `channel`; `false` is sent as `false`. */
  acceptTos?: boolean
  /**
   * Direct payment channel (bank or method ID, for example `373` for MB WAY), skipping the dpay gateway. A channel
   * requires the payer's email and name (`payer`) and `acceptTos`; it cannot be `tester`, `paypal`, `installment`
   * or `paysafecard`. An empty string is sent as before 0.3.0 and means no channel (the API turns it into null).
   */
  channel?: string
  creditCard?: boolean
  paysafecard?: boolean
  blik?: boolean
  installment?: boolean
  paypal?: boolean
  /** Hides the bank list on the payment page. */
  noBanks?: boolean
  /**
   * Payer's phone (MB WAY `+351...`), 9 to 15 characters. Requires `currencyCode` to be set as well.
   */
  phoneNumber?: string
  /**
   * Sends `currency_code` explicitly. Optional since 0.3.0: an amount in a currency other than PLN sends its
   * currency on its own. Must be the currency of the amount (`Money.of(500, Currency.EUR)`).
   */
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
  /** Address of `alias_update` notifications (BLIK OneClick and recurring payments), at most 500 characters. */
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
  /** Required with `browserJavaEnabled` for `mb_way_direct`. */
  deviceInfo?: DeviceInfoParams
  products?: ReadonlyArray<Record<string, unknown>>
  /**
   * Only valid when `transactionType` is `transfers`; cannot be combined with BLIK codes or aliases, recurring
   * payments or card aliases.
   */
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
  assertFieldRules(params)
  assertExclusions(params)
  assertRecurringCombination(params)
  assertDirectChannel(params)
  assertEfakturaCombination(params)

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
  // The API registers an amount without currency_code in PLN
  const currencyCode =
    params.currencyCode ?? (params.amount.currency !== Currency.PLN ? params.amount.currency : undefined)
  if (currencyCode !== undefined) body.currency_code = currencyCode
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
  if (params.aliasIpnUrl !== undefined) body.alias_ipn_url = params.aliasIpnUrl
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

/** The checks the PHP SDK runs in its setters: channel, phone, currency and alias IPN URL. */
function assertFieldRules(params: RegisterPaymentParams): void {
  if (params.channel !== undefined && FORBIDDEN_CHANNELS.includes(params.channel)) {
    throw new DPayValueError(`Channel "${params.channel}" cannot be used as a direct payment channel`)
  }
  if (params.phoneNumber !== undefined) {
    const length = phpMbStrlen(params.phoneNumber)
    if (length < 9 || length > 15) throw new DPayValueError('Phone number must be 9-15 characters')
  }
  if (params.currencyCode !== undefined) {
    assertCurrency(params.currencyCode)
    if (params.currencyCode !== params.amount.currency) {
      throw new DPayValueError(
        `Currency code "${params.currencyCode}" does not match the amount currency "${params.amount.currency}" - ` +
          `create the amount with Money.of(..., "${params.currencyCode}")`,
      )
    }
  }
  if (
    params.aliasIpnUrl !== undefined &&
    (phpMbStrlen(params.aliasIpnUrl) > 500 || !isValidUrl(params.aliasIpnUrl))
  ) {
    throw new DPayValueError(`Invalid alias IPN URL "${params.aliasIpnUrl}"`)
  }
}

/**
 * MB WAY (`mb_way_direct`) needs a channel (`373`) and the device info with `browserJavaEnabled`; any direct
 * channel needs the payer's email, name and the terms acceptance - otherwise the API answers 422. An empty
 * channel means no channel (the API turns it into null).
 */
function assertDirectChannel(params: RegisterPaymentParams): void {
  const hasChannel = params.channel !== undefined && params.channel !== ''
  if (params.transactionType === TransactionType.MB_WAY_DIRECT) {
    if (!hasChannel) {
      throw new DPayValueError('transactionType "mb_way_direct" requires a channel (channel: "373")')
    }
    if (params.deviceInfo?.browserJavaEnabled === undefined) {
      throw new DPayValueError(
        'transactionType "mb_way_direct" requires device info with browserJavaEnabled (deviceInfo)',
      )
    }
  }
  if (!hasChannel) return
  const payer = params.payer
  if (payer?.email === undefined || (payer.firstName ?? '') === '' || (payer.lastName ?? '') === '') {
    throw new DPayValueError("A direct channel requires the payer's email, first name and last name (payer)")
  }
  if (params.acceptTos === undefined) {
    throw new DPayValueError('A direct channel requires the terms acceptance (acceptTos)')
  }
}

function assertEfakturaCombination(params: RegisterPaymentParams): void {
  if (params.efaktura !== true) return
  const conflicts: Array<[string, unknown]> = [
    ['blik_code', params.blikCode],
    ['blik_alias', params.blikAlias],
    ['register_blik_alias', params.registerBlikAlias],
    ['recurring_registration', params.recurringRegistration],
    ['recurring_alias', params.recurringAlias],
    ['register_card_recurring', params.registerCardRecurring],
    ['card_recurring_alias', params.cardRecurringAlias],
  ]
  for (const [field, value] of conflicts) {
    if (value !== undefined) throw new DPayValueError(`efaktura cannot be combined with ${field}`)
  }
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
    // An empty channel means no channel
    conflicts.push(['channel', params.channel === '' ? undefined : params.channel])
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
