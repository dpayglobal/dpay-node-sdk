import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Config } from '../../src/config.js'
import { DPayValueError, NotFoundError } from '../../src/errors.js'
import { ApiRequestor } from '../../src/internal/requestor.js'
import { Money } from '../../src/money.js'
import { PayoutState, PayoutType } from '../../src/payout/enums.js'
import type { ListPayoutsParams } from '../../src/payout/ops.js'
import { PayoutService } from '../../src/payout/service.js'
import { MockHttpClient } from '../../src/testing.js'

const build = (): { transport: MockHttpClient; payouts: PayoutService } => {
  const transport = new MockHttpClient()
  const config = Config.fromOptions({
    service: 'test_service',
    secretHash: 'sekret-hash-123',
    httpClient: transport,
  })
  return { transport, payouts: new PayoutService(new ApiRequestor(config, transport)) }
}

describe('PayoutService.details', () => {
  it('omits the timestamp when it was not given', async () => {
    const { transport, payouts } = build()
    transport.queueJson(200, { id: 7, state: 1, net: 100.5, gross: 105, fee: 4.5 })
    const details = await payouts.details({ withdrawId: 4242 })

    expect(transport.lastRequest.url).toBe('https://panel.dpay.pl/api/v1/pbl/withdraws/details')
    expect(Object.keys(transport.lastRequestBody)).toEqual(['service', 'withdraw_id', 'checksum'])
    expect(details.id).toBe(7)
    expect(details.isProcessed).toBe(true)
    expect(details.net.toDecimal()).toBe('100.50')
  })

  it('places the timestamp between service and withdraw_id', async () => {
    const { transport, payouts } = build()
    transport.queueJson(200, { id: 7, state: 0 })
    const details = await payouts.details({ withdrawId: 4242, timestamp: 1784700000 })
    expect(Object.keys(transport.lastRequestBody)).toEqual([
      'service',
      'timestamp',
      'withdraw_id',
      'checksum',
    ])
    expect(details.isWaiting).toBe(true)
  })

  it('maps the state flags and the receiver', async () => {
    const { transport, payouts } = build()
    transport.queueJson(200, {
      id: 7,
      state: -1,
      declined: 1,
      decline_reason: 'wrong iban',
      direct_settlement: 0,
      receiver: { nrb: 'PL61', title: 'Wyplata', amount: 10.5, receiverName: 'Jan' },
    })
    const details = await payouts.details({ withdrawId: 1 })
    expect(details.isFailed).toBe(true)
    expect(details.isDeclined).toBe(true)
    expect(details.declineReason).toBe('wrong iban')
    expect(details.isDirectSettlement).toBe(false)
    expect(details.receiver?.nrb).toBe('PL61')
    expect(details.receiver?.amount?.toDecimal()).toBe('10.50')
  })

  it('leaves the receiver null when absent', async () => {
    const { transport, payouts } = build()
    transport.queueJson(200, { id: 7, state: 1 })
    expect((await payouts.details({ withdrawId: 1 })).receiver).toBeNull()
  })
})

const buildMyShop = (
  service = 'MyShop',
  secretHash = 'secret123',
): { transport: MockHttpClient; payouts: PayoutService } => {
  const transport = new MockHttpClient()
  const config = Config.fromOptions({ service, secretHash, httpClient: transport })
  return { transport, payouts: new PayoutService(new ApiRequestor(config, transport)) }
}

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')
const EMPTY_PAGE = { withdraws: [], meta: { page: 1, per_page: 50, total: 0, total_pages: 0 } }

describe('PayoutService.details (0.3.0 fields)', () => {
  it('reads the paysafecard flag, the currency and the export date', async () => {
    const { transport, payouts } = buildMyShop()
    transport.queueJson(200, {
      id: 12346,
      state: 0,
      net: 5.0,
      fee: 0.5,
      gross: 5.5,
      creation_date: '2026-07-01 10:00:00',
      direct_settlement: 0,
      paysafecard: 1,
      nrb: 'PL61109010140000071219812874',
      declined: 0,
    })
    const details = await payouts.details({ withdrawId: 12346 })
    expect(details.isPaysafecard).toBe(true)
    expect(details.isWaiting).toBe(true)
    expect(details.currency).toBe('PLN')
    expect(details.net.equals(Money.pln(500))).toBe(true)
    expect(details.exportDate).toBeNull()
  })
})

describe('PayoutService.list', () => {
  it('sends the filters in checksum order whatever their order', async () => {
    const { transport, payouts } = buildMyShop()
    transport.queueJson(200, {
      withdraws: [
        {
          id: 12345,
          type: 'standard',
          state: 1,
          net: '27.15',
          fee: '3.06',
          gross: '30.21',
          currency_code: 'EUR',
          creation_date: '2026-08-01 10:00:00',
          export_date: '2026-08-01 14:20:00',
          declined: 0,
        },
      ],
      meta: { page: 2, per_page: 10, total: 11, total_pages: 2 },
    })
    const page = await payouts.list({
      perPage: 10,
      type: PayoutType.STANDARD,
      state: PayoutState.PROCESSED,
      page: 2,
      dateTo: '2026-08-31 23:59:59',
      dateFrom: '2026-08-01',
    })

    const body = transport.lastRequestBody
    expect(transport.lastRequest.url).toBe('https://panel.dpay.pl/api/v1/pbl/withdraws')
    expect(Object.keys(body)).toEqual([
      'service',
      'date_from',
      'date_to',
      'state',
      'type',
      'page',
      'per_page',
      'checksum',
    ])
    expect(body.state).toBe(1)
    expect(body.checksum).toBe(sha256('MyShop|2026-08-01|2026-08-31 23:59:59|1|standard|2|10|secret123'))
    expect(body.checksum).toBe('5be864bc1b81a002fe134dbaed5db1d6517db76fdc952842b756da253ceb504b')

    const [item] = page.items
    expect(page.items).toHaveLength(1)
    expect(item?.id).toBe(12345)
    expect(item?.type).toBe(PayoutType.STANDARD)
    expect(item?.isProcessed).toBe(true)
    expect(item?.isDeclined).toBe(false)
    expect(item?.currency).toBe('EUR')
    expect(item?.net.equals(Money.of(2715, 'EUR'))).toBe(true)
    expect(item?.fee.equals(Money.of(306, 'EUR'))).toBe(true)
    expect(item?.gross.equals(Money.of(3021, 'EUR'))).toBe(true)
    expect(item?.creationDate).toBe('2026-08-01 10:00:00')
    expect(item?.exportDate).toBe('2026-08-01 14:20:00')
    expect(page.meta).toEqual({ page: 2, perPage: 10, total: 11, totalPages: 2, hasMore: false })
    expect(page.hasMore).toBe(false)
  })

  it('signs only the service without filters', async () => {
    const { transport, payouts } = buildMyShop()
    transport.queueJson(200, EMPTY_PAGE)
    const page = await payouts.list()
    expect(Object.keys(transport.lastRequestBody)).toEqual(['service', 'checksum'])
    expect(transport.lastRequestBody.checksum).toBe(sha256('MyShop|secret123'))
    expect(page.items).toEqual([])
    expect(page.hasMore).toBe(false)
  })

  it('signs the failed and the waiting state as -1 and 0', async () => {
    const { transport, payouts } = buildMyShop()
    transport.queueJson(200, EMPTY_PAGE)
    await payouts.list({ state: PayoutState.FAILED })
    expect(transport.lastRequestBody.checksum).toBe(sha256('MyShop|-1|secret123'))
    transport.queueJson(200, EMPTY_PAGE)
    await payouts.list({ state: PayoutState.WAITING })
    expect(transport.lastRequestBody.checksum).toBe(sha256('MyShop|0|secret123'))
  })

  it('sends the dates trimmed, because the API trims them before the checksum', async () => {
    const { transport, payouts } = buildMyShop()
    transport.queueJson(200, EMPTY_PAGE)
    await payouts.list({ dateFrom: ' 2026-08-01\n', dateTo: '2026-08-31 23:59:59 ' })
    const body = transport.lastRequestBody
    expect(body.date_from).toBe('2026-08-01')
    expect(body.date_to).toBe('2026-08-31 23:59:59')
    expect(body.checksum).toBe(sha256('MyShop|2026-08-01|2026-08-31 23:59:59|secret123'))
  })

  it('maps a list item with missing fields', async () => {
    const { transport, payouts } = buildMyShop()
    transport.queueJson(200, { withdraws: [{ id: '7', state: '-1', declined: '1', net: 'x' }, 'nope'] })
    const page = await payouts.list()
    const [item] = page.items
    expect(page.items).toHaveLength(1)
    expect(item?.id).toBe(7)
    expect(item?.isFailed).toBe(true)
    // Only the JSON integer 1 is a set flag
    expect(item?.isDeclined).toBe(false)
    expect(item?.type).toBeNull()
    expect(item?.net.equals(Money.pln(0))).toBe(true)
    expect(item?.exportDate).toBeNull()
    expect(page.meta).toEqual({ page: 1, perPage: 0, total: 0, totalPages: 0, hasMore: false })
  })

  it.each([
    [{ state: 2 }, 'Invalid payout state "2"'],
    [{ type: 'instant' }, 'Invalid payout type "instant"'],
    [{ dateFrom: ' ' }, 'date_from must not be empty'],
    [{ dateTo: '' }, 'date_to must not be empty'],
    [{ page: 0 }, 'page must be at least 1'],
    [{ page: 1.5 }, 'page must be at least 1'],
    [{ perPage: 201 }, 'per_page must be between 1 and 200'],
    [{ perPage: 0 }, 'per_page must be between 1 and 200'],
    [{ status: 1 }, 'Unknown payout filter "status"'],
    [{ dateFrom: 20260801 }, 'date_from must be a string'],
    [{ dateTo: new Date('2026-08-31') }, 'date_to must be a string'],
    [{ dateFrom: ' \n' }, 'date_from must not be empty'],
    [{ dateTo: '\u3000\u200b' }, 'date_to must not be empty'],
    [{ state: '1' }, 'state must be an integer'],
    [{ state: true }, 'state must be an integer'],
    [{ state: 0.5 }, 'state must be an integer'],
    [{ type: 1 }, 'type must be a string'],
    [{ status: 1, dateFrom: 5 }, 'Unknown payout filter "status"'],
    [{ dateFrom: 5, dateTo: 5 }, 'date_from must be a string'],
    [{ dateTo: ' ', state: '1' }, 'date_to must not be empty'],
    [{ state: '1', type: 1 }, 'state must be an integer'],
    [{ type: 1, page: 0 }, 'type must be a string'],
  ] as Array<[Record<string, unknown>, string]>)('validates %o', async (params, message) => {
    const { transport, payouts } = buildMyShop()
    await expect(payouts.list(params as ListPayoutsParams)).rejects.toThrow(new DPayValueError(message))
    await expect(payouts.list(params as ListPayoutsParams)).rejects.toBeInstanceOf(DPayValueError)
    expect(transport.requests).toHaveLength(0)
  })

  it('sends and signs the dates trimmed like the API, Unicode spaces and invisible characters included', async () => {
    const { transport, payouts } = buildMyShop()
    transport.queueJson(200, EMPTY_PAGE)
    await payouts.list({ dateFrom: '\ufeff2026-08-01 ', dateTo: '\u30002026-08-31 23:59:59\u200b' })
    expect(transport.lastRequestBody).toEqual({
      service: 'MyShop',
      date_from: '2026-08-01',
      date_to: '2026-08-31 23:59:59',
      checksum: '59828763de9628f5794f01750e9876aba13876caac856f62daf7840552f28d6f',
    })
  })

  it('trims the service of every payout request', async () => {
    const { transport, payouts } = buildMyShop(' MyShop\u00a0')
    transport.queueJson(200, EMPTY_PAGE)
    await payouts.list()
    expect(transport.lastRequestBody).toEqual({ service: 'MyShop', checksum: sha256('MyShop|secret123') })
    transport.queueJson(200, {})
    await payouts.details({ withdrawId: 4242 })
    expect(transport.lastRequestBody).toEqual({
      service: 'MyShop',
      withdraw_id: 4242,
      checksum: sha256('MyShop|4242|secret123'),
    })
    transport.queueJson(200, {})
    await payouts.detailsFull({ withdrawId: 4242 })
    expect(transport.lastRequestBody.service).toBe('MyShop')
    expect(transport.lastRequestBody.checksum).toBe(sha256('MyShop|4242|secret123'))
  })

  it('checks the service before the filters', async () => {
    const { transport, payouts } = buildMyShop('\u200b')
    await expect(payouts.list({ status: 1 } as unknown as ListPayoutsParams)).rejects.toThrow(
      new DPayValueError('service must not be empty'),
    )
    await expect(payouts.details({ withdrawId: 1 })).rejects.toThrow(
      new DPayValueError('service must not be empty'),
    )
    await expect(payouts.detailsFull({ withdrawId: 1 })).rejects.toThrow(
      new DPayValueError('service must not be empty'),
    )
    expect(transport.requests).toHaveLength(0)
  })

  it('does not send null filters', async () => {
    const { transport, payouts } = buildMyShop()
    transport.queueJson(200, EMPTY_PAGE)
    await payouts.list({ dateFrom: null, state: null, type: null } as unknown as ListPayoutsParams)
    expect(Object.keys(transport.lastRequestBody)).toEqual(['service', 'checksum'])
  })
})

describe('PayoutService.iterate', () => {
  it('walks all pages, always sending the page', async () => {
    const { transport, payouts } = buildMyShop()
    const row = (id: number): Record<string, unknown> => ({
      id,
      type: 'direct',
      state: 0,
      net: '1.00',
      fee: '0.00',
      gross: '1.00',
      currency_code: 'PLN',
      declined: 0,
    })
    transport.queueJson(200, {
      withdraws: [row(3), row(2)],
      meta: { page: 1, per_page: 2, total: 3, total_pages: 2 },
    })
    transport.queueJson(200, {
      withdraws: [row(1)],
      meta: { page: 2, per_page: 2, total: 3, total_pages: 2 },
    })

    const ids: number[] = []
    for await (const item of payouts.iterate({ type: PayoutType.DIRECT, perPage: 2 })) ids.push(item.id)

    expect(ids).toEqual([3, 2, 1])
    expect(transport.requests).toHaveLength(2)
    expect(transport.lastRequestBody.page).toBe(2)
    expect(Object.keys(transport.lastRequestBody)).toEqual([
      'service',
      'type',
      'page',
      'per_page',
      'checksum',
    ])
  })

  it('stops on an empty page even when the meta says there is more', async () => {
    const { transport, payouts } = buildMyShop()
    transport.queueJson(200, { withdraws: [], meta: { page: 1, per_page: 2, total: 3, total_pages: 2 } })
    const items = []
    for await (const item of payouts.iterate()) items.push(item)
    expect(items).toEqual([])
    expect(transport.requests).toHaveLength(1)
    expect(transport.lastRequestBody.page).toBe(1)
  })
})

describe('PayoutService.detailsFull', () => {
  it('reads the header, the totals and the positions', async () => {
    const { transport, payouts } = buildMyShop()
    transport.queueJson(200, {
      settlement: {
        id: 12345,
        state: 1,
        net: '27.15',
        fee: '3.06',
        gross: '30.21',
        currency_code: 'PLN',
        creation_date: '2026-08-01 10:00:00',
        export_date: '2026-08-01 14:20:00',
        direct_settlement: 0,
        declined: 0,
        paysafecard: 0,
        nrb: 'PL61109010140000071219812874',
      },
      summary: { net: '27.15', fee: '3.06', gross: '30.21', count: 3 },
      transactions: [
        {
          payment_id: '8F2C1A90-5B7E-4C31-9A02-7D6E4B1F3C88',
          date: '2026-07-31 12:04:11',
          net: '9.05',
          fee: '1.02',
          gross: '10.07',
          service_id: 42,
          service_name: 'Sklep testowy',
          custom: 'order-1234',
          ipksef: null,
        },
      ],
      meta: { page: 1, per_page: 1, total: 3, total_pages: 3 },
    })
    const settlement = await payouts.detailsFull({ withdrawId: 12345, page: 1, perPage: 1 })

    const body = transport.lastRequestBody
    expect(transport.lastRequest.url).toBe('https://panel.dpay.pl/api/v1/pbl/withdraws/details/full')
    expect(Object.keys(body)).toEqual(['service', 'withdraw_id', 'page', 'per_page', 'checksum'])
    expect(body.checksum).toBe(sha256('MyShop|12345|1|1|secret123'))

    const header = settlement.settlement
    expect(header.id).toBe(12345)
    expect(header.isProcessed).toBe(true)
    expect(header.isPaysafecard).toBe(false)
    expect(header.exportDate).toBe('2026-08-01 14:20:00')
    expect(header.nrb).toBe('PL61109010140000071219812874')
    expect(settlement.summaryNet.minor).toBe(2715)
    expect(settlement.summaryFee.minor).toBe(306)
    expect(settlement.summaryGross.minor).toBe(3021)
    expect(settlement.summaryCount).toBe(3)
    const [position] = settlement.positions
    expect(settlement.positions).toHaveLength(1)
    expect(position?.paymentId).toBe('8F2C1A90-5B7E-4C31-9A02-7D6E4B1F3C88')
    expect(position?.date).toBe('2026-07-31 12:04:11')
    expect(position?.net.minor).toBe(905)
    expect(position?.fee.minor).toBe(102)
    expect(position?.gross.minor).toBe(1007)
    expect(position?.serviceId).toBe(42)
    expect(position?.serviceName).toBe('Sklep testowy')
    expect(position?.custom).toBe('order-1234')
    expect(position?.ipksef).toBeNull()
    expect(settlement.meta.hasMore).toBe(true)
  })

  it('uses the settlement currency and sends a minimal body', async () => {
    const { transport, payouts } = buildMyShop()
    transport.queueJson(200, {
      settlement: {
        id: 7,
        state: 0,
        net: '10.00',
        fee: '0.00',
        gross: '10.00',
        currency_code: 'EUR',
        direct_settlement: 1,
        declined: 0,
        receiver: {
          nrb: 'PL61109010140000071219812874',
          title: 'FV 1',
          amount: '10.00',
          receiverName: 'Firma',
          receiverAddress: 'Lisboa',
        },
      },
      summary: { net: '10.00', fee: '0.00', gross: '10.00', count: 1 },
      transactions: [
        { payment_id: 'P-1', date: null, net: '10.00', fee: '0.00', gross: '10.00', service_id: '3' },
      ],
      meta: { page: 1, per_page: 100, total: 1, total_pages: 1 },
    })
    const settlement = await payouts.detailsFull({ withdrawId: 7 })

    expect(Object.keys(transport.lastRequestBody)).toEqual(['service', 'withdraw_id', 'checksum'])
    expect(transport.lastRequestBody.checksum).toBe(sha256('MyShop|7|secret123'))
    expect(settlement.settlement.currency).toBe('EUR')
    expect(settlement.summaryNet.currency).toBe('EUR')
    expect(settlement.positions[0]?.net.currency).toBe('EUR')
    expect(settlement.positions[0]?.serviceId).toBeNull()
    expect(settlement.positions[0]?.date).toBeNull()
    expect(settlement.settlement.receiver?.receiverName).toBe('Firma')
    expect(settlement.settlement.receiver?.amount?.equals(Money.of(1000, 'EUR'))).toBe(true)
    expect(settlement.meta.hasMore).toBe(false)
  })

  it('validates the page size and maps a missing payout to NotFoundError', async () => {
    const { transport, payouts } = buildMyShop()
    await expect(payouts.detailsFull({ withdrawId: 1, perPage: 501 })).rejects.toThrow(
      'per_page must be between 1 and 500',
    )
    transport.queueJson(404, { status: 'error', message: 'Withdraw does not exist!' })
    await expect(payouts.detailsFull({ withdrawId: 999 })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('falls back to zero amounts in PLN for an empty answer', async () => {
    const { transport, payouts } = buildMyShop()
    transport.queueJson(200, { settlement: [], summary: [], transactions: [], meta: [] })
    const settlement = await payouts.detailsFull({ withdrawId: 1 })
    expect(settlement.settlement.currency).toBe('PLN')
    expect(settlement.summaryNet.equals(Money.pln(0))).toBe(true)
    expect(settlement.summaryCount).toBe(0)
    expect(settlement.positions).toEqual([])
    expect(settlement.meta.page).toBe(1)
  })
})

describe('payout flags are true only for the JSON integer 1', () => {
  it.each([
    [1, true],
    [0, false],
    ['1', false],
    ['1abc', false],
    [true, false],
    [2, false],
    [null, false],
    [undefined, false],
  ] as Array<[unknown, boolean]>)('%j -> %s', async (value, expected) => {
    const { transport, payouts } = buildMyShop()
    transport.queueJson(200, { id: 1, paysafecard: value, direct_settlement: value, declined: value })
    const details = await payouts.details({ withdrawId: 1 })
    expect(details.isPaysafecard).toBe(expected)
    expect(details.isDirectSettlement).toBe(expected)
    expect(details.isDeclined).toBe(expected)
    transport.queueJson(200, { withdraws: [{ id: 1, declined: value }] })
    const [item] = (await payouts.list()).items
    expect(item?.isDeclined).toBe(expected)
  })

  it('reads a decoded 1.0 like 1, since JSON.parse does not tell them apart', async () => {
    const { transport, payouts } = buildMyShop()
    transport.queueText(200, '{"id":1,"declined":1.0}', { 'content-type': 'application/json' })
    expect((await payouts.details({ withdrawId: 1 })).isDeclined).toBe(true)
  })
})

describe('payout bodies match the shared vectors', () => {
  const VECTORS = JSON.parse(
    readFileSync(new URL('../fixtures/api_vectors.json', import.meta.url), 'utf8'),
  ) as {
    service: string
    secret_hash: string
    ordered_body: Array<{ name: string; body: Record<string, unknown>; checksum: string }>
  }
  const calls: Array<[string, (payouts: PayoutService) => Promise<unknown>]> = [
    ['payouts_list_minimal', (payouts) => payouts.list()],
    [
      'payouts_list_all_filters',
      (payouts) =>
        payouts.list({
          dateFrom: '2026-08-01',
          dateTo: '2026-08-31 23:59:59',
          state: 1,
          type: 'standard',
          page: 2,
          perPage: 10,
        }),
    ],
    ['payouts_list_state_failed', (payouts) => payouts.list({ state: PayoutState.FAILED })],
    ['payouts_list_state_waiting_page_1', (payouts) => payouts.list({ state: PayoutState.WAITING, page: 1 })],
    ['payouts_details_full_minimal', (payouts) => payouts.detailsFull({ withdrawId: 12345 })],
    [
      'payouts_details_full_page',
      (payouts) => payouts.detailsFull({ withdrawId: 12345, page: 2, perPage: 500 }),
    ],
  ]

  it.each(calls)('%s', async (name, call) => {
    const vector = VECTORS.ordered_body.find((item) => item.name === name)
    const { transport, payouts } = buildMyShop(VECTORS.service, VECTORS.secret_hash)
    transport.queueJson(200, name.startsWith('payouts_list') ? EMPTY_PAGE : {})
    await call(payouts)
    const { checksum, ...body } = transport.lastRequestBody
    expect(body).toEqual(vector?.body)
    expect(JSON.stringify(Object.keys(body))).toBe(JSON.stringify(Object.keys(vector?.body ?? {})))
    expect(checksum).toBe(vector?.checksum)
  })
})
