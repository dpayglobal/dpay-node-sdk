import { Currency } from '../currency.js'
import { isNumeric } from '../internal/php.js'
import { Money } from '../money.js'
import { record, scalarString, strictString } from '../payment/models.js'
import { RedirectType } from './enums.js'

/** One markup component of a DCC offer. */
export interface DccMarkup {
  readonly rate: number
  readonly additionalInfo: string | null
}

/** Dynamic currency conversion offer the payer must accept or reject. */
export interface DccOffer {
  readonly currencyConversionId: string
  readonly originalAmount: Money
  readonly convertedAmount: Money
  readonly exchangeRate: number
  readonly validUntil: string
  /** PSD2 declaration text that must be shown to the payer verbatim. */
  readonly declarationText: string
  readonly isEuropeanEconomicArea: boolean
  readonly markup: readonly DccMarkup[]
  readonly raw: Record<string, unknown>
}

/** Outcome of a card operation. */
export interface CardPaymentResult {
  readonly redirectType: RedirectType | (string & {}) | null
  readonly redirectText: string | null
  readonly isSuccess: boolean
  readonly requiresThreeDsForm: boolean
  readonly requiresRedirect: boolean
  readonly hasDccOffer: boolean
  /** Decoded 3-D Secure form to render, when `requiresThreeDsForm`. */
  readonly threeDsFormHtml: string | null
  /** Decoded URL to send the payer to, when `requiresRedirect`. */
  readonly redirectUrl: string | null
  readonly dccOffer: DccOffer | null
  readonly raw: Record<string, unknown>
}

/**
 * Builds a frozen `CardPaymentResult` from the raw JSON body of a card operation.
 *
 * Decodes `message.redirectType` into the `isSuccess` / `requiresThreeDsForm` /
 * `requiresRedirect` / `hasDccOffer` flags, and base64-decodes `message.redirectText` into
 * `threeDsFormHtml` only when the type is `FORM` and into `redirectUrl` only when it is
 * `URL`, returning `null` instead of throwing when the text is not valid base64.
 */
export function parseCardPaymentResult(data: Record<string, unknown>): CardPaymentResult {
  const message = record(data.message) ?? {}
  const redirectType = strictString(message, 'redirectType')
  const redirectTextRaw = strictString(message, 'redirectText')
  const redirectText = redirectTextRaw === null || redirectTextRaw === '' ? null : redirectTextRaw
  const offer = record(message.dccOffer)
  const requiresThreeDsForm = redirectType === RedirectType.FORM
  const requiresRedirect = redirectType === RedirectType.URL

  return Object.freeze({
    redirectType,
    redirectText,
    isSuccess: redirectType === RedirectType.SUCCESS,
    requiresThreeDsForm,
    requiresRedirect,
    hasDccOffer: redirectType === RedirectType.DCC_OFFER,
    threeDsFormHtml: requiresThreeDsForm && redirectText !== null ? decodeBase64(redirectText) : null,
    redirectUrl: requiresRedirect && redirectText !== null ? decodeBase64(redirectText) : null,
    dccOffer: offer === null ? null : parseDccOffer(offer),
    raw: data,
  })
}

function parseDccOffer(data: Record<string, unknown>): DccOffer {
  const markup = Array.isArray(data.markup) ? data.markup : []
  return Object.freeze({
    currencyConversionId: scalarString(data, 'currencyConversionId'),
    originalAmount: amount(data, 'originalAmount', 'originalCurrency'),
    convertedAmount: amount(data, 'convertedAmount', 'convertedCurrency'),
    exchangeRate: floatOrZero(data, 'exchangeRate'),
    validUntil: scalarString(data, 'validUntil'),
    declarationText: scalarString(data, 'declarationText'),
    isEuropeanEconomicArea: Boolean(data.europeanEconomicArea),
    markup: Object.freeze(
      markup
        .filter((item): item is Record<string, unknown> => record(item) !== null)
        .map((item) =>
          Object.freeze({
            rate: floatOrZero(item, 'rate'),
            additionalInfo: strictString(item, 'additionalInfo'),
          }),
        ),
    ),
    raw: data,
  })
}

function amount(data: Record<string, unknown>, amountKey: string, currencyKey: string): Money {
  const currency = data[currencyKey]
  return (
    Money.tryFromApiNumber(data[amountKey] ?? 0, typeof currency === 'string' ? currency : Currency.PLN) ??
    Money.pln(0)
  )
}

function floatOrZero(data: Record<string, unknown>, key: string): number {
  const value = data[key] ?? 0
  return isNumeric(value) ? Number(value) : 0
}

function decodeBase64(text: string): string | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) return null
  return Buffer.from(text, 'base64').toString('utf8')
}
