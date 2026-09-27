import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { CardService } from '../../src/card/service.js'
import { Config } from '../../src/config.js'
import {
  AuthenticationError,
  CardPaymentError,
  DPayValueError,
  InvalidRequestError,
} from '../../src/errors.js'
import { ApiRequestor } from '../../src/internal/requestor.js'
import { Money } from '../../src/money.js'
import type { DeviceInfoParams } from '../../src/payment/params.js'
import { MockHttpClient } from '../../src/testing.js'
import { WebhookTarget } from '../../src/webhook/target.js'

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

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

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
  const buildMyShop = (): { transport: MockHttpClient; cards: CardService } => {
    const transport = new MockHttpClient()
    const config = Config.fromOptions({ service: 'MyShop', secretHash: 'secret123', httpClient: transport })
    return { transport, cards: new CardService(new ApiRequestor(config, transport)) }
  }

  it('signs the capture with the operation, the service and the amount (same bytes as PHP)', async () => {
    const { transport, cards } = buildMyShop()
    transport.queueJson(200, { success: true, status: 'success', message: { redirectType: 'SUCCESS' } })
    const result = await cards.capture('TX-1', { amount: Money.pln(5999) })

    expect(result.isSuccess).toBe(true)
    expect(transport.lastRequest.url).toBe('https://api-payments.dpay.pl/api/v1_0/cards/payment/TX-1/capture')
    // sha256(capture|service|transaction_id|amount|hash), the amount a number on the wire
    expect(transport.lastRequest.body).toBe(
      '{"service":"MyShop","amount":59.99,"checksum":"f9f3713764216075a7e1e56a10baa695f802929e70453a0b68146d56d5d3c925"}',
    )
  })

  it('signs a full cancellation with an empty amount segment (same bytes as PHP)', async () => {
    const { transport, cards } = buildMyShop()
    transport.queueJson(200, { success: true, status: 'success', message: { redirectType: 'SUCCESS' } })
    await cards.cancel('TX-1')

    expect(transport.lastRequest.url).toBe(
      'https://api-payments.dpay.pl/api/v1_0/cards/payment/TX-1/cancellation',
    )
    // sha256(cancellation|service|transaction_id||hash)
    expect(transport.lastRequest.body).toBe(
      '{"service":"MyShop","checksum":"adde47e5fce49c92912d41cb34f44b363c6fe426f0c14aa3b5f58a061c7f4c4c"}',
    )
  })

  it('drops the fraction of a whole amount on the wire, but signs it with two decimal places', async () => {
    const { transport, cards } = build()
    transport.queueJson(200, { success: true, message: { redirectType: 'SUCCESS' } })
    await cards.cancel('tx-1', { amount: Money.pln(100) })

    const checksum = sha256('cancellation|test_service|tx-1|1.00|sekret-hash-123')
    expect(transport.lastRequest.body).toBe(`{"service":"test_service","amount":1,"checksum":"${checksum}"}`)
  })

  it('signs the raw transaction id while the path is percent-encoded', async () => {
    const { transport, cards } = build()
    transport.queueJson(200, { success: true, message: { redirectType: 'SUCCESS' } })
    await cards.capture('tx 1/2', { amount: Money.pln(100) })
    expect(transport.lastRequest.url).toBe(
      'https://api-payments.dpay.pl/api/v1_0/cards/payment/tx%201%2F2/capture',
    )
    expect(transport.lastRequestBody.checksum).toBe(
      sha256('capture|test_service|tx 1/2|1.00|sekret-hash-123'),
    )
  })

  it('sends the webhook of a capture after the amount and outside the checksum', async () => {
    const { transport, cards } = buildMyShop()
    transport.queueJson(200, { success: true, message: { redirectType: 'SUCCESS' } })
    await cards.capture('TX-1', {
      amount: Money.pln(5999),
      webhook: WebhookTarget.create('https://shop.example/webhooks/captures', ['payment.captured']),
    })

    expect(Object.keys(transport.lastRequestBody)).toEqual(['service', 'amount', 'webhook', 'checksum'])
    expect(transport.lastRequestBody.webhook).toEqual({
      url: 'https://shop.example/webhooks/captures',
      events: ['payment.captured'],
    })
    expect(transport.lastRequestBody.checksum).toBe(
      'f9f3713764216075a7e1e56a10baa695f802929e70453a0b68146d56d5d3c925',
    )
  })

  it('allows only payment.captured in the webhook of a capture', async () => {
    const { transport, cards } = build()
    await expect(
      cards.capture('tx-1', {
        amount: Money.pln(100),
        webhook: WebhookTarget.create('https://shop.example/webhooks', ['payment.succeeded']),
      }),
    ).rejects.toThrow('Event "payment.succeeded" is not allowed in the webhook object of a card capture')
    expect(transport.requests).toHaveLength(0)
  })

  it('requires an amount to capture', async () => {
    const { cards } = build()
    await expect(cards.capture('tx-1', {} as never)).rejects.toBeInstanceOf(DPayValueError)
  })

  it('maps a missing checksum and a rejected webhook address to their error codes', async () => {
    const { transport, cards } = build()
    transport.queueJson(401, {
      success: false,
      status: 'error',
      code: 'CHECKSUM_REQUIRED',
      message: 'Missing service or checksum',
    })
    const missing = await cards.capture('tx-1', { amount: Money.pln(100) }).catch((error) => error)
    expect(missing).toBeInstanceOf(AuthenticationError)
    expect(missing.errorCode).toBe('CHECKSUM_REQUIRED')

    transport.queueJson(400, {
      success: false,
      status: 'error',
      code: 'WEBHOOK_URL_INVALID',
      reason: 'private_address',
      message: 'Invalid webhook URL: private_address',
    })
    const invalid = await cards
      .capture('tx-1', { amount: Money.pln(100), webhook: WebhookTarget.create('https://10.0.0.1/hook') })
      .catch((error) => error)
    expect(invalid).toBeInstanceOf(InvalidRequestError)
    expect(invalid.errorCode).toBe('WEBHOOK_URL_INVALID')
    expect(invalid.reason).toBe('private_address')
  })

  it('throws CardPaymentError when the capture is declined with HTTP 200', async () => {
    const { transport, cards } = build()
    transport.queueJson(200, {
      success: false,
      status: 'error',
      message: 'Capture amount exceeds authorized amount',
    })
    await expect(cards.capture('tx-1', { amount: Money.pln(999999) })).rejects.toBeInstanceOf(
      CardPaymentError,
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
