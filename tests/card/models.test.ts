import { describe, expect, it } from 'vitest'
import { parseCardPaymentResult } from '../../src/card/models.js'

const base64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64')

describe('parseCardPaymentResult', () => {
  it('maps the four redirect types to boolean flags', () => {
    expect(parseCardPaymentResult({ message: { redirectType: 'SUCCESS' } }).isSuccess).toBe(true)
    expect(parseCardPaymentResult({ message: { redirectType: 'FORM' } }).requiresThreeDsForm).toBe(true)
    expect(parseCardPaymentResult({ message: { redirectType: 'URL' } }).requiresRedirect).toBe(true)
    expect(parseCardPaymentResult({ message: { redirectType: 'DCC_OFFER' } }).hasDccOffer).toBe(true)
  })

  it('base64-decodes the 3-D Secure form only for redirect type FORM', () => {
    const html = '<form method="post"></form>'
    expect(
      parseCardPaymentResult({ message: { redirectType: 'FORM', redirectText: base64(html) } })
        .threeDsFormHtml,
    ).toBe(html)
    expect(
      parseCardPaymentResult({ message: { redirectType: 'URL', redirectText: base64(html) } })
        .threeDsFormHtml,
    ).toBeNull()
  })

  it('base64-decodes the redirect URL only for redirect type URL', () => {
    const url = 'https://3ds.bank.test/challenge'
    expect(
      parseCardPaymentResult({ message: { redirectType: 'URL', redirectText: base64(url) } }).redirectUrl,
    ).toBe(url)
    expect(
      parseCardPaymentResult({ message: { redirectType: 'SUCCESS', redirectText: base64(url) } }).redirectUrl,
    ).toBeNull()
  })

  it('returns null instead of throwing on invalid base64', () => {
    expect(
      parseCardPaymentResult({ message: { redirectType: 'URL', redirectText: 'not!base64' } }).redirectUrl,
    ).toBeNull()
  })

  it('accepts non-canonically padded base64 like PHP and Python', () => {
    expect(
      parseCardPaymentResult({ message: { redirectType: 'URL', redirectText: 'AB==' } }).redirectUrl,
    ).toBe('\x00')
  })

  it('parses the DCC offer with per-currency amounts', () => {
    const result = parseCardPaymentResult({
      message: {
        redirectType: 'DCC_OFFER',
        dccOffer: {
          currencyConversionId: 'cc-1',
          originalCurrency: 'PLN',
          originalAmount: 100,
          convertedCurrency: 'EUR',
          convertedAmount: 23.5,
          exchangeRate: 0.235,
          validUntil: '2026-07-22T12:00:00Z',
          declarationText: 'Wybierasz przewalutowanie',
          europeanEconomicArea: true,
          markup: [{ rate: 0.03, additionalInfo: 'issuer' }, 'skipped'],
        },
      },
    })
    expect(result.dccOffer?.originalAmount.toDecimal()).toBe('100.00')
    expect(result.dccOffer?.originalAmount.currency).toBe('PLN')
    expect(result.dccOffer?.convertedAmount.toDecimal()).toBe('23.50')
    expect(result.dccOffer?.convertedAmount.currency).toBe('EUR')
    expect(result.dccOffer?.exchangeRate).toBe(0.235)
    expect(result.dccOffer?.isEuropeanEconomicArea).toBe(true)
    expect(result.dccOffer?.markup).toHaveLength(1)
    expect(result.dccOffer?.markup[0]?.rate).toBe(0.03)
  })

  it('leaves the offer null when absent and keeps the raw payload', () => {
    const result = parseCardPaymentResult({ message: { redirectType: 'SUCCESS' }, extra: 1 })
    expect(result.dccOffer).toBeNull()
    expect(result.raw.extra).toBe(1)
  })
})
