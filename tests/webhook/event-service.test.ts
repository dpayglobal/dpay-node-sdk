import { describe, expect, it } from 'vitest'
import { Config } from '../../src/config.js'
import { DPayValueError, InvalidRequestError } from '../../src/errors.js'
import { ApiRequestor } from '../../src/internal/requestor.js'
import { MockHttpClient } from '../../src/testing.js'
import type { WebhookEvent } from '../../src/webhook/event.js'
import { EventService } from '../../src/webhook/service.js'

const build = (): { transport: MockHttpClient; events: EventService } => {
  const transport = new MockHttpClient()
  const config = Config.fromOptions({
    service: 'sdk-test-service',
    secretHash: 'sdk-test-hash-0001',
    httpClient: transport,
  })
  return { transport, events: new EventService(new ApiRequestor(config, transport)) }
}

const event = (id: string, type = 'payment.succeeded'): Record<string, unknown> => ({
  id,
  type,
  api_version: '2026-10-01',
  created: '2026-09-27T10:05:00Z',
  livemode: true,
  service: 'sdk-test-service',
  data: { object: { object: 'payment', id: 'TX-1' } },
})

describe('EventService.list', () => {
  it('signs the timestamp and sends the filters in wire order', async () => {
    const { transport, events } = build()
    transport.queueJson(200, {
      status: 'success',
      data: [event('evt_01k6a8q2m4pz7h8c3v5n9t2x6y')],
      has_more: false,
      next_starting_after: null,
    })

    const page = await events.list({
      types: ['payment.succeeded', 'refund.failed'],
      limit: 50,
      timestamp: 1790503500,
    })

    expect(transport.lastRequest.url).toBe('https://api-payments.dpay.pl/api/v1_0/events')
    expect(transport.lastRequestBody).toEqual({
      service: 'sdk-test-service',
      timestamp: 1790503500,
      types: ['payment.succeeded', 'refund.failed'],
      limit: 50,
      // sha256(service|hash|timestamp) - the filters stay outside the checksum
      checksum: '390cb30baacbc92bf2244d049f4b500937c6209446dd2fd79829d7975321abf0',
    })
    expect(page.data).toHaveLength(1)
    expect(page.data[0]?.type).toBe('payment.succeeded')
    expect(page.hasMore).toBe(false)
    expect(page.nextStartingAfter).toBeNull()
    expect(Object.isFrozen(page)).toBe(true)
  })

  it('keeps the body order of every filter and defaults the timestamp to now', async () => {
    const { transport, events } = build()
    transport.queueJson(200, { status: 'success', data: [], has_more: false })
    const before = Math.floor(Date.now() / 1000)
    await events.list({
      limit: 5,
      startingAfter: 'evt_01k6a8q2m4pz7h8c3v5n9t2x6y',
      createdTo: '2026-09-30',
      createdFrom: '2026-09-01T00:00:00Z',
      types: ['refund.succeeded'],
    })

    const body = transport.lastRequestBody
    expect(Object.keys(body)).toEqual([
      'service',
      'timestamp',
      'types',
      'created_from',
      'created_to',
      'starting_after',
      'limit',
      'checksum',
    ])
    expect(body.timestamp as number).toBeGreaterThanOrEqual(before)
    expect(body.timestamp as number).toBeLessThanOrEqual(Math.floor(Date.now() / 1000))
  })

  it('validates the filters before calling the API', async () => {
    const { transport, events } = build()
    await expect(events.list({ types: ['merchant.updated'] })).rejects.toThrow(
      'Event "merchant.updated" is not allowed in the webhook object of the Events API',
    )
    await expect(events.list({ types: ['webhook.test'] })).rejects.toBeInstanceOf(DPayValueError)
    await expect(events.list({ types: [] })).rejects.toThrow(
      'Event types must be a non-empty list of distinct types',
    )
    await expect(events.list({ types: ['payout.paid', 'payout.paid'] })).rejects.toBeInstanceOf(
      DPayValueError,
    )
    await expect(events.list({ startingAfter: 'evt_123' })).rejects.toThrow(
      'starting_after must be an event id (evt_...)',
    )
    for (const limit of [0, 101, 1.5]) {
      await expect(events.list({ limit })).rejects.toThrow('limit must be between 1 and 100')
    }
    await expect(events.list({ timestamp: 1790503500.5 })).rejects.toBeInstanceOf(DPayValueError)
    expect(transport.requests).toHaveLength(0)
  })

  it('surfaces an unknown starting_after as an InvalidRequestError', async () => {
    const { transport, events } = build()
    transport.queueJson(400, {
      status: 'failed',
      message: 'Unknown starting_after event',
      errors: { starting_after: 'EVENT_NOT_FOUND' },
    })
    const error = await events.list({ startingAfter: 'evt_01k6a8q2m4pz7h8c3v5n9t2x6y' }).catch((e) => e)
    expect(error).toBeInstanceOf(InvalidRequestError)
    expect(error.fieldErrors).toEqual({ starting_after: ['EVENT_NOT_FOUND'] })
  })
})

describe('EventService.iterate', () => {
  it('pages until the end, each page after the previous one', async () => {
    const { transport, events } = build()
    transport.queueJson(200, {
      status: 'success',
      data: [event('evt_01k6a8q2m4pz7h8c3v5n9t2x6y')],
      has_more: true,
      next_starting_after: 'evt_01k6a8q2m4pz7h8c3v5n9t2x6y',
    })
    transport.queueJson(200, {
      status: 'success',
      data: [event('evt_01k6a8q2m4pz7h8c3v5n9t2x6a')],
      has_more: false,
      next_starting_after: 'evt_01k6a8q2m4pz7h8c3v5n9t2x6a',
    })

    const ids: string[] = []
    for await (const item of events.iterate({ limit: 1 })) ids.push(item.id)

    expect(ids).toEqual(['evt_01k6a8q2m4pz7h8c3v5n9t2x6y', 'evt_01k6a8q2m4pz7h8c3v5n9t2x6a'])
    expect(transport.requests).toHaveLength(2)
    expect(transport.lastRequestBody.starting_after).toBe('evt_01k6a8q2m4pz7h8c3v5n9t2x6y')
    expect(transport.lastRequestBody.limit).toBe(1)
  })

  it('signs every page with the current time, even when given a timestamp', async () => {
    const { transport, events } = build()
    transport.queueJson(200, { status: 'success', data: [], has_more: false, next_starting_after: null })
    const collected: WebhookEvent[] = []
    for await (const item of events.iterate({ timestamp: 1 } as never)) collected.push(item)

    expect(collected).toEqual([])
    expect(transport.lastRequestBody.timestamp).not.toBe(1)
  })

  it('stops when the API reports more pages without a cursor', async () => {
    const { transport, events } = build()
    transport.queueJson(200, {
      status: 'success',
      data: [event('evt_01k6a8q2m4pz7h8c3v5n9t2x6y')],
      has_more: true,
    })
    const ids: string[] = []
    for await (const item of events.iterate()) ids.push(item.id)
    expect(ids).toEqual(['evt_01k6a8q2m4pz7h8c3v5n9t2x6y'])
    expect(transport.requests).toHaveLength(1)
  })
})
