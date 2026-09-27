import { createHash } from 'node:crypto'
import { DPayClient, Money, RecurringMethod, RecurringModel, WebhookTarget } from '../../src/index.js'
import { ChecksumCalculator } from '../../src/internal/checksum.js'
import { phpJsonEncode, phpStrval } from '../../src/internal/php.js'
import { constructIpnEvent } from '../../src/ipn/verifier.js'
import type { DeviceInfoParams } from '../../src/payment/params.js'
import { MockHttpClient } from '../../src/testing.js'

const SERVICE = 'test_service'
const SECRET = 'sekret-hash-123'
const TIMESTAMP = 1784700000

const urls = {
  success: 'https://shop.test/ok',
  fail: 'https://shop.test/fail',
  ipn: 'https://shop.test/ipn',
}

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
  browserJavaEnabled: true,
}

const IPN_CASES: Array<Record<string, unknown>> = [
  { id: 'tx-1', amount: '29.99', email: 'jan@example.com', type: 'transfer', attempt: 1, version: 2, custom: 'order-1' },
  { id: 'tx-2', amount: '10.50', type: 'dcb', attempt: 3, version: 1 },
  { id: 'tx-3', amount: 10.5, email: '', type: 'capture', attempt: '1', version: '1', custom: '', capture_payment_id: 'cap-9' },
  { id: 4, amount: 10, type: 'transfer', attempt: 1, version: 1 },
]

function ipnSignature(payload: Record<string, unknown>): string {
  const parts = [phpStrval(payload.id), SECRET, phpStrval(payload.amount)]
  if (payload.type !== 'dcb') parts.push(phpStrval(payload.email ?? ''))
  parts.push(phpStrval(payload.type), phpStrval(payload.attempt), phpStrval(payload.version))
  parts.push(phpStrval(payload.custom ?? ''))
  return createHash('sha256').update(parts.join(''), 'utf8').digest('hex')
}

export async function runRequestScenario(): Promise<Record<string, unknown>> {
  const transport = new MockHttpClient()
  const dpay = new DPayClient({ service: SERVICE, secretHash: SECRET, httpClient: transport })
  const out: Record<string, unknown> = {}

  transport.queueJson(200, { transactionId: 'tx-1', msg: 'https://secure.dpay.pl/pay/1' })
  await dpay.payments.register({
    amount: Money.pln(2999),
    transactionType: 'transfers',
    urls,
    description: 'Zamówienie #1234 / ĄĘŚŻ',
    custom: 'order-1234',
    payer: { email: 'jan@example.com', firstName: 'Jan', lastName: 'Kowalski' },
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
    payout: {
      positions: [{ iban: 'PL61109010140000071219812874', title: 'Wypłata 1', amount: Money.pln(1050) }],
      feeMode: 'gross',
    },
    billingAddress: { street: 'Testowa 1', city: 'Warszawa' },
    shippingAddress: { street: 'Inna 2' },
    deviceInfo,
    products: [{ name: 'Produkt', price: 29.99 }],
    efaktura: true,
    invoice: {
      payerNip: '1234563218',
      payerName: 'Firma sp. z o.o.',
      invoiceNumber: 'FV/2026/07/1',
      paymentDueDate: '2026-08-15',
      vatAmount: Money.pln(560),
    },
  })

  // [1] rejestracja płatności cyklicznej: transfers + kod BLIK + recurring_registration
  transport.queueJson(200, { transactionId: 'tx-2', msg: 'Transaction paid' })
  await dpay.payments.register({
    amount: Money.pln(1000),
    transactionType: 'transfers',
    urls,
    userAgent: 'UA/1.0',
    userIp: '10.0.0.1',
    blikCode: '123456',
    recurringRegistration: {
      label: 'Subskrypcja',
      model: RecurringModel.M,
      termsUrl: 'https://shop.test/regulamin',
      alias: 'SUB-1',
      frequency: '12M',
      limitAmt: 100000,
      totLimitAmt: 500000,
      limitAmtFixed: true,
      expirationDate: '2027-01-01',
      initDate: '2026-08-01',
      methods: [RecurringMethod.BLIK],
      termsVersion: '2026-09',
    },
  })

  // [2] alias OneClick tylko UID
  transport.queueJson(200, { transactionId: 'tx-3', msg: 'ok' })
  await dpay.payments.register({
    amount: Money.of(500, 'CZK'),
    transactionType: 'card_recurring',
    urls,
    registerBlikAlias: { label: 'Moj alias', type: 'UID' },
    registerCardRecurring: {
      label: 'Mandat',
      frequency: 'MONTHLY',
      limitAmt: Money.pln(20000),
      totLimitAmt: Money.pln(100000),
      limitAmtFixed: false,
      expirationDate: '2028-12-31',
      initDate: '2026-09-01',
    },
  })

  transport.queueJson(200, { transaction: { id: 'tx-1', value: '29.99', status: 'paid' } })
  await dpay.payments.details('tx-1')

  transport.queueJson(200, { status: 'success', refund: true })
  await dpay.refunds.create({ transactionId: 'tx-1' })

  transport.queueJson(200, { status: 'success', refund: true })
  await dpay.refunds.create({ transactionId: 'tx-1', amount: Money.pln(1050), reason: 'reklamacja / zwrot' })

  transport.queueJson(200, { refund: true, message: 'ok' })
  await dpay.refunds.checkAvailability({ transactionId: 'tx-1', amount: Money.pln(500) })

  transport.queueJson(200, [{ id: '1', name: 'Bank', on_from: 0, on_to: 24 }])
  await dpay.banks.all()

  transport.queueJson(200, [{ id: '1', name: 'Bank' }])
  await dpay.banks.forService({ timestamp: TIMESTAMP })

  transport.queueJson(200, { id: 7, state: 1, net: 100.5 })
  await dpay.payouts.details({ withdrawId: 4242 })

  transport.queueJson(200, { id: 7, state: 1 })
  await dpay.payouts.details({ withdrawId: 4242, timestamp: TIMESTAMP })

  transport.queueJson(200, { data: { alias_value: 'a-1', alias_type: 'UID', status: 'ACTIVE' } })
  await dpay.blik.alias({ aliasValue: 'a-1' })

  // [12] wyrejestrowanie aliasu OneClick (UID)
  transport.queueJson(200, { data: {} })
  await dpay.blik.unregisterAlias({ aliasValue: 'a-1', aliasType: 'UID', reason: 'user request' })

  // [13] status płatności cyklicznej - wspólne API
  transport.queueJson(200, { data: { alias: 'a-1' } })
  await dpay.recurring.status('a-1')

  transport.queueText(200, '-----BEGIN PUBLIC KEY-----\nAAA\n-----END PUBLIC KEY-----\n')
  await dpay.cards.publicKey()

  const successBody = { success: true, message: { redirectType: 'SUCCESS' } }

  transport.queueJson(200, successBody)
  await dpay.cards.payOtp('tx 1/2', {
    deviceInfo,
    email: 'jan@example.com',
    channelId: 86,
    cardHolderFirstName: 'Jan',
    cardHolderLastName: 'Kowalski',
    encryptedCardData: 'BASE64DATA==',
    threeDsConfirmed: true,
    dccDecision: 'accept',
  })

  transport.queueJson(200, successBody)
  await dpay.cards.preAuth('tx-1', { deviceInfo })

  transport.queueJson(200, successBody)
  await dpay.cards.capture('tx-1', { amount: Money.pln(2999) })

  transport.queueJson(200, successBody)
  await dpay.cards.cancel('tx-1')

  transport.queueJson(200, successBody)
  await dpay.cards.cancel('tx-1', { amount: Money.pln(100) })

  transport.queueJson(200, successBody)
  await dpay.cards.googlePay('tx-1', { token: 'gp-token', deviceInfo, email: 'a@b.pl', channelId: 90 })

  transport.queueJson(200, successBody)
  await dpay.cards.applePay('tx-1', { deviceInfo })

  transport.queueJson(200, successBody)
  await dpay.cards.applePay('tx-1', { token: 'ap-token', deviceInfo, channelId: 91 })

  // [23] obciążenie płatności cyklicznej bez IPN, z kontekstem klienta, adresem zdarzeń i referencją
  transport.queueJson(200, { error: false, msg: 'Internal processing', status: true, transactionId: 'tx-4' })
  await dpay.payments.register({
    amount: Money.pln(4999),
    transactionType: 'transfers',
    urls: { success: urls.success, fail: urls.fail },
    recurringAlias: 'SUB-1',
    userAgent: 'UA/1.0',
    userIp: '10.0.0.1',
    description: 'Abonament 10/2026',
    webhook: WebhookTarget.create('https://shop.test/webhooks', ['payment.succeeded', 'payment.failed']),
    reference: 'order-77',
  })

  // [24] ponowienie obciążenia
  transport.queueJson(200, {
    status: 'success',
    data: { transactionId: 'tx-4', retry: { status: 'pending', count: 1 } },
  })
  await dpay.recurring.retry('tx-4')

  // [25] anulowanie płatności cyklicznej
  transport.queueJson(200, { status: 'success', data: { alias: 'SUB-1', status: 'UNREGISTERED' } })
  await dpay.recurring.cancel('SUB-1', { reason: 'Rezygnacja' })

  // [26] zwrot z adresem zdarzeń (webhook w sumie kontrolnej)
  transport.queueJson(200, { status: 'success', refund: true })
  await dpay.refunds.create({
    transactionId: 'tx-1',
    amount: Money.pln(500),
    reason: 'reklamacja',
    webhook: WebhookTarget.create('https://shop.test/webhooks/refunds', ['refund.succeeded', 'refund.failed']),
  })

  // [27] capture z adresem zdarzenia payment.captured
  transport.queueJson(200, successBody)
  await dpay.cards.capture('tx-1', {
    amount: Money.pln(1500),
    webhook: WebhookTarget.create('https://shop.test/webhooks/captures', ['payment.captured']),
  })

  // [28] Events API ze stałym znacznikiem czasu
  transport.queueJson(200, { status: 'success', data: [], has_more: false, next_starting_after: null })
  await dpay.events.list({
    types: ['payment.succeeded', 'refund.failed'],
    createdFrom: '2026-09-01T00:00:00Z',
    limit: 10,
    timestamp: TIMESTAMP,
  })

  out.calls = transport.requests.map((request) => ({
    method: request.method,
    url: request.url,
    headers: request.headers,
    body: request.body,
  }))

  const checksum = new ChecksumCalculator(SECRET)
  out.checksums = {
    secret_second_empty: checksum.secretSecond(SERVICE, []),
    secret_second_mixed: checksum.secretSecond(SERVICE, ['10.00', 42, 3.5, 'https://a/b']),
    ordered_simple: checksum.orderedBody([SERVICE, 'tx-1']),
    ordered_mixed: checksum.orderedBody([SERVICE, TIMESTAMP, 4242, 10, true, false, '']),
  }

  const toDecimal: Record<string, string> = {}
  for (const minor of [1050, 1000, 5, 0, -2000, -5, 123456789]) {
    toDecimal[String(minor)] = Money.pln(minor).toDecimal()
  }
  out.money_to_decimal = toDecimal

  const fromApi: unknown[] = [
    30, 0, -7, 10.5, 8.285, 0.1, 29.999,
    '10', '10.5', '10.50', '0.05', '-0.05',
    'abc', true, null,
  ]
  const tryFromApi: Record<string, number | null> = {}
  fromApi.forEach((value, index) => {
    tryFromApi[String(index)] = Money.tryFromApiNumber(value, 'PLN')?.minor ?? null
  })
  out.money_try_from_api = tryFromApi

  const floatCast: Record<string, string> = {}
  for (const decimal of ['29.99', '10.00', '0.05', '-20.00', '1234567.89']) {
    floatCast[decimal] = phpJsonEncode({ amount: Number(decimal) })
  }
  out.float_cast = floatCast

  const strval: Record<string, string> = {}
  const strvalInputs: unknown[] = [10, 10.5, 0.1, 1 / 3, 1e25, -0, 100, 828.5, true, false, 42, 'abc']
  strvalInputs.forEach((value, index) => {
    strval[String(index)] = phpStrval(value)
  })
  out.strval = strval

  const ipn: Record<string, unknown> = {}
  IPN_CASES.forEach((testCase, index) => {
    const signature = ipnSignature(testCase)
    const body = phpJsonEncode({ ...testCase, signature }, { escapeSlashes: true })
    const event = constructIpnEvent(body, SECRET)
    ipn[String(index)] = {
      body,
      signature,
      id: event.id,
      amount: event.amount,
      email: event.email,
      type: event.type,
      attempt: event.attempt,
      version: event.version,
      custom: event.custom,
      capture_payment_id: event.capturePaymentId,
    }
  })
  out.ipn = ipn

  out.card_payload = phpJsonEncode(
    { PN: '4111111111111111', SC: '123', DT: '12/25', ID: 'tx-1', TX: TIMESTAMP },
    { escapeSlashes: true },
  )

  return out
}
