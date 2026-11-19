import { describe, expect, it } from 'vitest'
import { Currency } from '../../src/currency.js'
import { DPayValueError } from '../../src/errors.js'
import { Money } from '../../src/money.js'
import { type DeviceInfoParams, isValidPolishIban } from '../../src/payment/params.js'
import { buildRegisterBody } from '../../src/payment/register-body.js'
import type { RegisterPaymentParams } from '../../src/payment/register-body.js'
import { WebhookTarget } from '../../src/webhook/target.js'

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

  it('leaves url_ipn out when there is no IPN URL', () => {
    for (const ipn of [undefined, null]) {
      const body = buildRegisterBody('s', {
        ...minimal,
        urls: { success: urls.success, fail: urls.fail, ipn },
      })
      expect(Object.keys(body)).toEqual(['service', 'value', 'transactionType', 'url_success', 'url_fail'])
    }
    const withoutKey = buildRegisterBody('s', {
      ...minimal,
      urls: { success: urls.success, fail: urls.fail },
    })
    expect(withoutKey).not.toHaveProperty('url_ipn')
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
      currencyCode: 'PLN',
      partnerPlatform: 'SHOPIFY01',
      aliasIpnUrl: 'https://shop.test/alias-ipn',
      noDelay: true,
      authorizeOnly: false,
      cardRecurringOperation: 'charge',
      payout: {
        positions: [{ iban: 'PL61109010140000071219812874', title: 't', amount: Money.pln(1050) }],
        feeMode: 'gross',
      },
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

  it('places the recurring registration, webhook and reference at their wire positions', () => {
    const body = buildRegisterBody('s', {
      ...minimal,
      partnerPlatform: 'SHOP01',
      blikCode: '123456',
      userAgent: 'UA/1.0',
      userIp: '10.0.0.1',
      recurringRegistration: { label: 'Sub', model: 'O', termsUrl: 'https://shop.test/terms' },
      aliasIpnUrl: 'https://shop.test/alias-ipn',
      authorizeOnly: true,
      // 0.3.0: efaktura (true) cannot be combined with a BLIK code - false only keeps its position covered
      efaktura: false,
      webhook: WebhookTarget.create('https://shop.test/webhooks'),
      reference: 'order-1',
    })
    expect(Object.keys(body).slice(6)).toEqual([
      'partner_platform',
      'user_agent',
      'user_ip',
      'blik_code',
      'recurring_registration',
      'alias_ipn_url',
      'authorize_only',
      'efaktura',
      'webhook',
      'reference',
    ])
  })

  it('places recurring_alias right after the client context and before alias_ipn_url', () => {
    const body = buildRegisterBody('s', {
      ...minimal,
      userAgent: 'UA/1.0',
      userIp: '10.0.0.1',
      recurringAlias: 'SUB-1',
      aliasIpnUrl: 'https://shop.test/alias-ipn',
      noDelay: true,
    })
    expect(Object.keys(body).slice(6)).toEqual([
      'user_agent',
      'user_ip',
      'recurring_alias',
      'alias_ipn_url',
      'no_delay',
    ])
  })

  it('places the card recurring fields at their wire positions', () => {
    const body = buildRegisterBody('s', {
      ...minimal,
      transactionType: 'card_recurring',
      aliasIpnUrl: 'https://shop.test/alias-ipn',
      registerCardRecurring: { label: 'Mandat' },
      authorizeOnly: true,
    })
    expect(Object.keys(body).slice(6)).toEqual(['alias_ipn_url', 'register_card_recurring', 'authorize_only'])
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
    ).toThrow('blik_alias cannot be combined with blik_code, alias registration or recurring payments')

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

  it('places register_blik_alias at its wire position between blik_code and alias_ipn_url', () => {
    const body = buildRegisterBody('s', {
      ...minimal,
      userAgent: 'Mozilla/5.0',
      userIp: '192.168.1.1',
      blikCode: '123456',
      registerBlikAlias: { label: 'Alias One' },
      aliasIpnUrl: 'https://shop.test/alias-ipn',
    })
    const keys = Object.keys(body)
    const blikCodeIndex = keys.indexOf('blik_code')
    const aliasIpnIndex = keys.indexOf('alias_ipn_url')
    expect(keys.slice(blikCodeIndex, aliasIpnIndex + 1)).toEqual([
      'blik_code',
      'register_blik_alias',
      'alias_ipn_url',
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

describe('buildRegisterBody currency (0.3.0)', () => {
  it('sends the currency of a non-PLN amount', () => {
    const body = buildRegisterBody('MyShop', {
      amount: Money.of(49900, Currency.CZK),
      transactionType: 'transfers',
      urls,
    })
    expect(body.value).toBe('499.00')
    expect(body.currency_code).toBe('CZK')
    expect(Object.keys(body)).toEqual([
      'service',
      'value',
      'transactionType',
      'url_success',
      'url_fail',
      'url_ipn',
      'currency_code',
    ])
  })

  it('sends no currency for PLN unless asked to', () => {
    expect(buildRegisterBody('MyShop', { ...minimal, amount: Money.pln(1000) })).not.toHaveProperty(
      'currency_code',
    )
    expect(
      buildRegisterBody('MyShop', { ...minimal, amount: Money.pln(1000), currencyCode: Currency.PLN })
        .currency_code,
    ).toBe('PLN')
    expect(Currency.USD).toBe('USD')
    expect(Currency.RON).toBe('RON')
    expect(buildRegisterBody('S', { ...minimal, amount: Money.of(100, Currency.RON) }).currency_code).toBe(
      'RON',
    )
  })

  it('requires the currency code to match the amount', () => {
    expect(() =>
      buildRegisterBody('MyShop', { ...minimal, amount: Money.pln(500), currencyCode: 'EUR' }),
    ).toThrow('Currency code "EUR" does not match the amount currency "PLN"')
    expect(() =>
      buildRegisterBody('MyShop', {
        ...minimal,
        amount: Money.pln(500),
        phoneNumber: '+351912345678',
        currencyCode: 'EUR',
      }),
    ).toThrow(DPayValueError)
    expect(() => buildRegisterBody('MyShop', { ...minimal, currencyCode: 'eur' })).toThrow(
      'Invalid currency code "eur"',
    )
  })

  it('checks the phone number length in characters', () => {
    const base = { ...minimal, amount: Money.of(500, 'EUR'), currencyCode: 'EUR' }
    for (const phoneNumber of ['+3519123', '+351912345678901']) {
      expect(() => buildRegisterBody('MyShop', { ...base, phoneNumber })).toThrow(
        'Phone number must be 9-15 characters',
      )
    }
    expect(buildRegisterBody('MyShop', { ...base, phoneNumber: '+35191234' }).phone_number).toBe('+35191234')
  })
})

describe('buildRegisterBody direct channels and MB WAY (0.3.0)', () => {
  const mbWay: RegisterPaymentParams = {
    amount: Money.of(500, Currency.EUR),
    transactionType: 'mb_way_direct',
    urls,
    phoneNumber: '+351912345678',
    currencyCode: Currency.EUR,
    channel: '373',
    payer: { email: 'client@example.com', firstName: 'Joao', lastName: 'Silva' },
    acceptTos: true,
    deviceInfo: { ...device, browserJavaEnabled: false },
  }

  it('builds a valid MB WAY registration', () => {
    const body = buildRegisterBody('MyShop', mbWay)
    expect(body.phone_number).toBe('+351912345678')
    expect(body.currency_code).toBe('EUR')
    expect(body.channel).toBe('373')
    expect((body.device_info as Record<string, unknown>).browserJavaEnabled).toBe('false')
  })

  it('requires a channel and browserJavaEnabled for MB WAY', () => {
    const { channel: _channel, ...withoutChannel } = mbWay
    expect(() => buildRegisterBody('MyShop', withoutChannel)).toThrow('requires a channel')
    expect(() => buildRegisterBody('MyShop', { ...mbWay, channel: '' })).toThrow('requires a channel')
    const { browserJavaEnabled: _java, ...withoutJava } = device
    expect(() => buildRegisterBody('MyShop', { ...mbWay, deviceInfo: withoutJava })).toThrow(
      'browserJavaEnabled',
    )
    const { deviceInfo: _device, ...withoutDevice } = mbWay
    expect(() => buildRegisterBody('MyShop', withoutDevice)).toThrow('browserJavaEnabled')
  })

  it('requires the payer and the terms acceptance with a direct channel', () => {
    const base: RegisterPaymentParams = { ...minimal, amount: Money.pln(1000), channel: '24900005' }
    expect(() => buildRegisterBody('MyShop', { ...base, acceptTos: true })).toThrow(
      'email, first name and last name',
    )
    expect(() =>
      buildRegisterBody('MyShop', { ...base, acceptTos: true, payer: { email: 'client@example.com' } }),
    ).toThrow('first name')
    expect(() =>
      buildRegisterBody('MyShop', {
        ...base,
        acceptTos: true,
        payer: { email: 'client@example.com', firstName: 'Jan', lastName: '' },
      }),
    ).toThrow('last name')
    expect(() =>
      buildRegisterBody('MyShop', {
        ...base,
        acceptTos: true,
        payer: { firstName: 'Jan', lastName: 'Kowalski' },
      }),
    ).toThrow('email')
    expect(() =>
      buildRegisterBody('MyShop', {
        ...base,
        payer: { email: 'client@example.com', firstName: 'Jan', lastName: 'Kowalski' },
      }),
    ).toThrow('acceptTos')
  })

  it('sends declined terms as false', () => {
    const body = buildRegisterBody('MyShop', {
      ...minimal,
      channel: '24900005',
      payer: { email: 'client@example.com', firstName: 'Jan', lastName: 'Kowalski' },
      acceptTos: false,
    })
    expect(body.accept_tos).toBe(false)
  })

  it.each(['tester', 'paypal', 'installment', 'paysafecard'])('refuses the direct channel %s', (channel) => {
    expect(() => buildRegisterBody('MyShop', { ...minimal, channel })).toThrow(
      `Channel "${channel}" cannot be used as a direct payment channel`,
    )
  })

  it('treats an empty channel as no channel, sent as in 0.2.0', () => {
    // The API turns "" into null (ConvertEmptyStringsToNull), so it needs no payer or terms
    const body = buildRegisterBody('MyShop', { ...minimal, channel: '' })
    expect(body.channel).toBe('')
    const recurring = buildRegisterBody('MyShop', {
      ...minimal,
      channel: '',
      blikCode: '123456',
      userAgent: 'UA/1.0',
      userIp: '10.0.0.1',
      recurringRegistration: { label: 'Sub', model: 'O', termsUrl: 'https://shop.test/terms' },
    })
    expect(recurring.channel).toBe('')
    expect(() =>
      buildRegisterBody('MyShop', {
        ...minimal,
        channel: '86',
        payer: { email: 'client@example.com', firstName: 'Jan', lastName: 'Kowalski' },
        acceptTos: true,
        blikCode: '123456',
        userAgent: 'UA/1.0',
        userIp: '10.0.0.1',
        recurringRegistration: { label: 'Sub', model: 'O', termsUrl: 'https://shop.test/terms' },
      }),
    ).toThrow('channel cannot be combined with a recurring payment')
  })

  it('accepts an alias IPN URL of at most 500 characters', () => {
    const url = `https://shop.example/${'a'.repeat(479)}`
    expect(url).toHaveLength(500)
    expect(buildRegisterBody('S', { ...minimal, aliasIpnUrl: url }).alias_ipn_url).toBe(url)
    expect(() => buildRegisterBody('S', { ...minimal, aliasIpnUrl: `${url}a` })).toThrow(
      'Invalid alias IPN URL',
    )
  })
})

describe('buildRegisterBody efaktura combinations (0.3.0)', () => {
  const blik = { userAgent: 'UA', userIp: '1.2.3.4' }
  it.each([
    ['blik_code', { blikCode: '777123', ...blik }],
    ['blik_alias', { blikAlias: 'DPAY.UID.1.a', ...blik }],
    ['register_blik_alias', { registerBlikAlias: { label: 'Sklep' } }],
    // A recurring registration needs a BLIK code, which is the first conflict
    [
      'blik_code',
      {
        blikCode: '777123',
        ...blik,
        recurringRegistration: { label: 'S', model: 'O', termsUrl: 'https://shop.test/t' },
      },
    ],
    ['recurring_alias', { recurringAlias: 'SUB-0001' }],
    ['register_card_recurring', { registerCardRecurring: { label: 'Mandat' } }],
    ['card_recurring_alias', { cardRecurringAlias: 'CARD-1' }],
  ] as Array<[string, Partial<RegisterPaymentParams>]>)('refuses efaktura with %s', (field, extra) => {
    expect(() => buildRegisterBody('MyShop', { ...minimal, efaktura: true, ...extra })).toThrow(
      `efaktura cannot be combined with ${field}`,
    )
  })

  it('allows efaktura without them', () => {
    expect(buildRegisterBody('MyShop', { ...minimal, efaktura: true }).efaktura).toBe(true)
    expect(
      buildRegisterBody('MyShop', { ...minimal, efaktura: false, recurringAlias: 'SUB-1' }).efaktura,
    ).toBe(false)
  })
})

describe('payout positions and BLIK labels (0.3.0)', () => {
  it('requires a valid Polish IBAN, sent as given', () => {
    const body = buildRegisterBody('S', {
      ...minimal,
      payout: {
        positions: [{ iban: 'pl61 1090 1014 0000 0712 1981 2874', title: 'FV 1', amount: Money.pln(100) }],
      },
    })
    expect((body.payout as { positions: Array<{ iban: string }> }).positions[0]?.iban).toBe(
      'pl61 1090 1014 0000 0712 1981 2874',
    )
    expect(isValidPolishIban('PL61109010140000071219812874')).toBe(true)
    expect(isValidPolishIban('PL61\t1090 1014 0000 0712 1981 2874\n')).toBe(true)
    for (const iban of [
      'PL61109010140000071219812875',
      'DE89370400440532013000',
      '61109010140000071219812874',
      '',
    ]) {
      expect(isValidPolishIban(iban)).toBe(false)
      expect(() =>
        buildRegisterBody('S', {
          ...minimal,
          payout: { positions: [{ iban, title: 'FV 1', amount: Money.pln(100) }] },
        }),
      ).toThrow('valid Polish IBAN')
    }
  })

  it('requires a payout amount above 0', () => {
    for (const amount of [Money.pln(0), Money.pln(-100)]) {
      expect(() =>
        buildRegisterBody('S', {
          ...minimal,
          payout: { positions: [{ iban: 'PL61109010140000071219812874', title: 'FV 1', amount }] },
        }),
      ).toThrow('Payout amount must be above 0')
    }
  })

  it('limits the BLIK alias label to 35 characters', () => {
    expect(
      buildRegisterBody('S', { ...minimal, registerBlikAlias: { label: 'a'.repeat(35) } })
        .register_blik_alias,
    ).toEqual({
      label: 'a'.repeat(35),
      type: 'UID',
    })
    expect(buildRegisterBody('S', { ...minimal, registerBlikAlias: { label: 'ż'.repeat(35) } })).toBeTruthy()
    expect(() =>
      buildRegisterBody('S', { ...minimal, registerBlikAlias: { label: 'a'.repeat(36) } }),
    ).toThrow('Alias label must be 1-35 characters')
  })
})
