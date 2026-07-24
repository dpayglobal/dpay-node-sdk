import { describe, expect, it } from 'vitest'
import { DPayValueError } from '../../src/errors.js'
import { Money } from '../../src/money.js'
import type { DeviceInfoParams } from '../../src/payment/params.js'
import { buildRegisterBody } from '../../src/payment/register-body.js'
import type { RegisterPaymentParams } from '../../src/payment/register-body.js'

const urls = {
  success: 'https://shop.test/ok',
  fail: 'https://shop.test/fail',
  ipn: 'https://shop.test/ipn',
}
const minimal: RegisterPaymentParams = { amount: Money.pln(2999), transactionType: 'transfers', urls }
const device: DeviceInfoParams = {
  browserAcceptHeader: 'text/html',
  browserLanguage: 'pl-PL',
  browserColorDepth: 24,
  browserScreenHeight: 1080,
  browserScreenWidth: 1920,
  browserTz: -60,
  browserUserAgent: 'Mozilla/5.0',
  systemFamily: 'Windows',
  geoLocalization: '52.2297,21.0122',
  deviceId: 'device-abc',
  applicationName: 'Sklep Testowy',
  browserJavaEnabled: true,
}

describe('buildRegisterBody', () => {
  it('emits the six mandatory fields in wire order', () => {
    const body = buildRegisterBody('test_service', minimal)
    expect(Object.keys(body)).toEqual([
      'service',
      'value',
      'transactionType',
      'url_success',
      'url_fail',
      'url_ipn',
    ])
    expect(body.value).toBe('29.99')
  })

  it('flattens the payer into three separate fields', () => {
    const body = buildRegisterBody('s', {
      ...minimal,
      payer: { email: 'jan@example.com', firstName: 'Jan', lastName: 'Kowalski' },
    })
    expect(body.email).toBe('jan@example.com')
    expect(body.client_name).toBe('Jan')
    expect(body.client_surname).toBe('Kowalski')
    expect(body).not.toHaveProperty('payer')
  })

  it('sends channel toggles as 0 and 1, but the other flags as booleans', () => {
    const body = buildRegisterBody('s', {
      ...minimal,
      creditCard: true,
      paysafecard: false,
      blik: true,
      installment: false,
      paypal: true,
      noBanks: false,
      acceptTos: true,
      noDelay: true,
      authorizeOnly: false,
    })
    expect(body.creditcard).toBe(1)
    expect(body.paysafecard).toBe(0)
    expect(body.nobanks).toBe(0)
    expect(body.accept_tos).toBe(true)
    expect(body.no_delay).toBe(true)
    expect(body.authorize_only).toBe(false)
  })

  it('keeps the full wire key order across the whole option matrix', () => {
    const body = buildRegisterBody('s', {
      ...minimal,
      description: 'd',
      custom: 'c',
      payer: { email: 'a@b.pl', firstName: 'A', lastName: 'B' },
      acceptTos: true,
      channel: '86',
      creditCard: true,
      paysafecard: false,
      blik: true,
      installment: false,
      paypal: true,
      noBanks: false,
      phoneNumber: '+48123456789',
      currencyCode: 'EUR',
      partnerPlatform: 'SHOPIFY01',
      aliasIpnUrl: 'https://shop.test/alias-ipn',
      noDelay: true,
      authorizeOnly: false,
      cardRecurringOperation: 'charge',
      payout: { positions: [{ iban: 'PL61', title: 't', amount: Money.pln(1050) }], feeMode: 'gross' },
      billingAddress: { street: 'Testowa 1' },
      shippingAddress: { street: 'Inna 2' },
      products: [{ name: 'Produkt', price: 29.99 }],
      efaktura: true,
      invoice: { payerNip: '1234563218' },
    })
    expect(Object.keys(body)).toEqual([
      'service',
      'value',
      'transactionType',
      'url_success',
      'url_fail',
      'url_ipn',
      'description',
      'custom',
      'email',
      'client_name',
      'client_surname',
      'accept_tos',
      'channel',
      'creditcard',
      'paysafecard',
      'blik',
      'installment',
      'paypal',
      'nobanks',
      'phone_number',
      'currency_code',
      'partner_platform',
      'alias_ipn_url',
      'no_delay',
      'authorize_only',
      'card_recurring_operation',
      'payout',
      'billing_address',
      'shipping_address',
      'products',
      'efaktura',
      'invoice',
    ])
  })

  it('places the BLIK and card recurring fields at their wire positions', () => {
    const body = buildRegisterBody('s', {
      ...minimal,
      transactionType: 'blik_recurring',
      partnerPlatform: 'SHOP01',
      blikCode: '123456',
      userAgent: 'UA/1.0',
      userIp: '10.0.0.1',
      registerBlikRecurringAlias: { label: 'Sub', model: 'M', frequency: '12M' },
      aliasIpnUrl: 'https://shop.test/alias-ipn',
      registerCardRecurring: { label: 'Mandat' },
      authorizeOnly: true,
    })
    expect(Object.keys(body).slice(6)).toEqual([
      'partner_platform',
      'user_agent',
      'user_ip',
      'blik_code',
      'register_blik_recurring_alias',
      'alias_ipn_url',
      'register_card_recurring',
      'authorize_only',
    ])
  })

  it('validates the mandatory fields', () => {
    expect(() => buildRegisterBody('s', { ...minimal, transactionType: 'nope' })).toThrow(
      'Invalid transaction type "nope"',
    )
    expect(() => buildRegisterBody('s', { ...minimal, urls: { ...urls, ipn: 'not-a-url' } })).toThrow(
      'Invalid ipn URL "not-a-url"',
    )
    expect(() => buildRegisterBody('s', { ...minimal, payer: { email: 'nope' } })).toThrow(
      'Invalid email "nope"',
    )
  })

  it('enforces the mutual exclusions the builders enforced in PHP', () => {
    expect(() =>
      buildRegisterBody('s', {
        ...minimal,
        blikCode: '123456',
        blikAlias: 'a-1',
        userAgent: 'u',
        userIp: 'i',
      } as RegisterPaymentParams),
    ).toThrow('blik_code cannot be combined with blik_alias')

    expect(() =>
      buildRegisterBody('s', {
        ...minimal,
        blikAlias: 'a-1',
        userAgent: 'u',
        userIp: 'i',
        registerBlikAlias: { label: 'l' },
      } as RegisterPaymentParams),
    ).toThrow('blik_alias cannot be combined with blik_code or alias registration')

    expect(() =>
      buildRegisterBody('s', { ...minimal, registerCardRecurring: { label: 'a' }, cardRecurringAlias: 'x' }),
    ).toThrow('register_card_recurring cannot be combined with card_recurring_alias')

    expect(() =>
      buildRegisterBody('s', { ...minimal, transactionType: 'card_auth', efaktura: true }),
    ).toThrow('efaktura is allowed only for transactionType "transfers"')
  })

  it('requires the companion fields that the PHP builders forced', () => {
    expect(() => buildRegisterBody('s', { ...minimal, blikCode: '123456' } as RegisterPaymentParams)).toThrow(
      'blik_code and blik_alias require user_agent and user_ip',
    )
    expect(() => buildRegisterBody('s', { ...minimal, phoneNumber: '+48123456789' })).toThrow(
      'phone_number requires currency_code',
    )
  })

  it('validates the formats PHP validated', () => {
    expect(() =>
      buildRegisterBody('s', {
        ...minimal,
        blikCode: '12345',
        userAgent: 'u',
        userIp: 'i',
      } as RegisterPaymentParams),
    ).toThrow('BLIK code must be exactly 6 digits')
    expect(() => buildRegisterBody('s', { ...minimal, partnerPlatform: 'shopify' })).toThrow(
      'Partner platform must match ^[A-Z0-9]{1,64}$',
    )
    expect(() => buildRegisterBody('s', { ...minimal, aliasIpnUrl: 'nope' })).toThrow(
      'Invalid alias IPN URL "nope"',
    )
    expect(() => buildRegisterBody('s', { ...minimal, currencyCode: 'pln' })).toThrow(DPayValueError)
  })

  it('copies nested plain objects instead of aliasing the caller input', () => {
    const billing = { street: 'Testowa 1' }
    const body = buildRegisterBody('s', { ...minimal, billingAddress: billing })
    billing.street = 'mutated'
    expect(body.billing_address).toEqual({ street: 'Testowa 1' })
  })

  it('places device_info at its wire position between shipping_address and products', () => {
    const body = buildRegisterBody('s', {
      ...minimal,
      shippingAddress: { street: 'Inna 2' },
      deviceInfo: device,
      products: [{ name: 'Produkt', price: 29.99 }],
    })
    const keys = Object.keys(body)
    const deviceInfoIndex = keys.indexOf('device_info')
    const shippingAddressIndex = keys.indexOf('shipping_address')
    const productsIndex = keys.indexOf('products')
    expect(deviceInfoIndex).toBeGreaterThan(shippingAddressIndex)
    expect(deviceInfoIndex).toBeLessThan(productsIndex)
    expect(keys.slice(shippingAddressIndex, productsIndex + 1)).toEqual([
      'shipping_address',
      'device_info',
      'products',
    ])
  })

  it('places blik_alias at its wire position between user_ip and no_delay', () => {
    const body = buildRegisterBody('s', {
      ...minimal,
      userAgent: 'Mozilla/5.0',
      userIp: '192.168.1.1',
      blikAlias: 'alias-1',
      noDelay: true,
    })
    const keys = Object.keys(body)
    const userIpIndex = keys.indexOf('user_ip')
    const blikAliasIndex = keys.indexOf('blik_alias')
    const noDelayIndex = keys.indexOf('no_delay')
    expect(blikAliasIndex).toBeGreaterThan(userIpIndex)
    expect(blikAliasIndex).toBeLessThan(noDelayIndex)
    expect(keys.slice(userIpIndex, noDelayIndex + 1)).toEqual(['user_ip', 'blik_alias', 'no_delay'])
  })

  it('places register_blik_alias at its wire position between blik_code and register_blik_recurring_alias', () => {
    const body = buildRegisterBody('s', {
      ...minimal,
      userAgent: 'Mozilla/5.0',
      userIp: '192.168.1.1',
      blikCode: '123456',
      registerBlikAlias: { label: 'Alias One' },
      registerBlikRecurringAlias: { label: 'Recurring', model: 'M', frequency: '12M' },
    })
    const keys = Object.keys(body)
    const blikCodeIndex = keys.indexOf('blik_code')
    const registerBlikAliasIndex = keys.indexOf('register_blik_alias')
    const registerBlikRecurringIndex = keys.indexOf('register_blik_recurring_alias')
    expect(registerBlikAliasIndex).toBeGreaterThan(blikCodeIndex)
    expect(registerBlikAliasIndex).toBeLessThan(registerBlikRecurringIndex)
    expect(keys.slice(blikCodeIndex, registerBlikRecurringIndex + 1)).toEqual([
      'blik_code',
      'register_blik_alias',
      'register_blik_recurring_alias',
    ])
  })

  it('places card_recurring_alias at its wire position before authorize_only', () => {
    const body = buildRegisterBody('s', {
      ...minimal,
      noDelay: true,
      cardRecurringAlias: 'card-alias-1',
      authorizeOnly: true,
    })
    const keys = Object.keys(body)
    const noDelayIndex = keys.indexOf('no_delay')
    const cardRecurringAliasIndex = keys.indexOf('card_recurring_alias')
    const authorizeOnlyIndex = keys.indexOf('authorize_only')
    expect(cardRecurringAliasIndex).toBeGreaterThan(noDelayIndex)
    expect(cardRecurringAliasIndex).toBeLessThan(authorizeOnlyIndex)
    expect(keys.slice(noDelayIndex, authorizeOnlyIndex + 1)).toEqual([
      'no_delay',
      'card_recurring_alias',
      'authorize_only',
    ])
  })
})
