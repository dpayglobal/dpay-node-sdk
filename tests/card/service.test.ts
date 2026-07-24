import { describe, expect, it } from 'vitest'
import { CardService } from '../../src/card/service.js'
import { Config } from '../../src/config.js'
import { CardPaymentError } from '../../src/errors.js'
import { ApiRequestor } from '../../src/internal/requestor.js'
import { Money } from '../../src/money.js'
import type { DeviceInfoParams } from '../../src/payment/params.js'
import { MockHttpClient } from '../../src/testing.js'

const deviceInfo: DeviceInfoParams = {
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
}

const build = (): { transport: MockHttpClient; cards: CardService } => {
  const transport = new MockHttpClient()
  const config = Config.fromOptions({
    service: 'test_service',
    secretHash: 'sekret-hash-123',
    httpClient: transport,
  })
  return { transport, cards: new CardService(new ApiRequestor(config, transport)) }
}

describe('CardService.publicKey', () => {
  it('returns the trimmed PEM body', async () => {
    const { transport, cards } = build()
    transport.queueText(200, '  -----BEGIN PUBLIC KEY-----\nAAA\n-----END PUBLIC KEY-----\n  ')
    expect(await cards.publicKey()).toBe('-----BEGIN PUBLIC KEY-----\nAAA\n-----END PUBLIC KEY-----')
    expect(transport.lastRequest.url).toBe('https://api-payments.dpay.pl/api/v1_0/cards/public-key')
    expect(transport.lastRequest.method).toBe('GET')
  })
})

describe('CardService.payOtp', () => {
  it('percent-encodes the transaction id in the path', async () => {
    const { transport, cards } = build()
    transport.queueJson(200, { success: true, message: { redirectType: 'SUCCESS' } })
    await cards.payOtp('tx 1/2', { deviceInfo })
    expect(transport.lastRequest.url).toBe(
      'https://api-payments.dpay.pl/api/v1_0/cards/payment/tx%201%2F2/pay/card-otp',
    )
  })

  it('emits the wire key order with deviceInfo after the card fields', async () => {
    const { transport, cards } = build()
    transport.queueJson(200, { success: true, message: { redirectType: 'SUCCESS' } })
    await cards.payOtp('tx-1', {
      deviceInfo,
      email: 'jan@example.com',
      channelId: 86,
      cardHolderFirstName: 'Jan',
      cardHolderLastName: 'Kowalski',
      encryptedCardData: 'BASE64DATA==',
      threeDsConfirmed: true,
      dccDecision: 'accept',
    })
    expect(Object.keys(transport.lastRequestBody)).toEqual([
      'email',
      'channelId',
      'cardHolderFirstName',
      'cardHolderLastName',
      'encryptedCardData',
      'deviceInfo',
      'threeDsConfirmed',
      'dccDecision',
    ])
  })

  it('raises CardPaymentError when success is not true', async () => {
    const { transport, cards } = build()
    transport.queueJson(200, { success: false, message: 'DCC_OFFER_EXPIRED' })
    await expect(cards.payOtp('tx-1', { deviceInfo })).rejects.toBeInstanceOf(CardPaymentError)
  })

  it('validates the DCC decision', async () => {
    const { cards } = build()
    await expect(cards.payOtp('tx-1', { deviceInfo, dccDecision: 'maybe' })).rejects.toThrow(
      'Invalid DCC decision "maybe"',
    )
  })
})

describe('CardService.preAuth', () => {
  it('sends a success response and returns isSuccess true', async () => {
    const { transport, cards } = build()
    transport.queueJson(200, { success: true, message: { redirectType: 'SUCCESS' } })
    const result = await cards.preAuth('tx-1', { deviceInfo })
    expect(transport.lastRequest.url).toBe(
      'https://api-payments.dpay.pl/api/v1_0/cards/payment/tx-1/pay/card-pre-auth',
    )
    expect(transport.lastRequest.method).toBe('POST')
    expect(result.isSuccess).toBe(true)
  })
})

describe('CardService.capture and cancel', () => {
  it('sends an empty body when no amount is given', async () => {
    const { transport, cards } = build()
    transport.queueJson(200, { success: true, message: { redirectType: 'SUCCESS' } })
    await cards.capture('tx-1')
    expect(transport.lastRequest.body).toBe('{}')
    expect(transport.lastRequest.url).toBe('https://api-payments.dpay.pl/api/v1_0/cards/payment/tx-1/capture')
  })

  it('sends the amount as a number, not a decimal string', async () => {
    const { transport, cards } = build()
    transport.queueJson(200, { success: true, message: { redirectType: 'SUCCESS' } })
    await cards.capture('tx-1', { amount: Money.pln(2999) })
    expect(transport.lastRequest.body).toBe('{"amount":29.99}')
  })

  it('drops the fraction when the amount is whole, exactly like PHP', async () => {
    const { transport, cards } = build()
    transport.queueJson(200, { success: true, message: { redirectType: 'SUCCESS' } })
    await cards.cancel('tx-1', { amount: Money.pln(100) })
    expect(transport.lastRequest.body).toBe('{"amount":1}')
    expect(transport.lastRequest.url).toBe(
      'https://api-payments.dpay.pl/api/v1_0/cards/payment/tx-1/cancellation',
    )
  })
})

describe('CardService wallets', () => {
  it('sends the Google Pay envelope', async () => {
    const { transport, cards } = build()
    transport.queueJson(200, { success: true, message: { redirectType: 'SUCCESS' } })
    await cards.googlePay('tx-1', { token: 'gp-token', deviceInfo, email: 'a@b.pl', channelId: 90 })
    expect(Object.keys(transport.lastRequestBody)).toEqual([
      'email',
      'channelId',
      'xPayType',
      'xPayToken',
      'deviceInfo',
    ])
    expect(transport.lastRequestBody.xPayType).toBe('GOOGLE_PAY')
  })

  it('distinguishes an Apple Pay session init from a payment', async () => {
    const { transport, cards } = build()
    transport.queueJson(200, { success: true, message: { redirectType: 'SUCCESS' } })
    await cards.applePay('tx-1', { deviceInfo })
    expect(transport.lastRequestBody.xPayType).toBe('APPLE_PAY_INIT')
    expect(transport.lastRequestBody).not.toHaveProperty('xPayToken')

    transport.queueJson(200, { success: true, message: { redirectType: 'SUCCESS' } })
    await cards.applePay('tx-1', { token: 'ap-token', deviceInfo, channelId: 91 })
    expect(Object.keys(transport.lastRequestBody)).toEqual([
      'channelId',
      'xPayType',
      'xPayToken',
      'deviceInfo',
    ])
    expect(transport.lastRequestBody.xPayType).toBe('APPLE_PAY')
  })
})
