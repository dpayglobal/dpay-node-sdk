import type { RequestOptions } from '../config.js'
import type { ApiRequestor } from '../internal/requestor.js'
import type { EventPage, WebhookEvent } from './event.js'
import { type EventFilters, type ListEventsParams, listEventsOperation } from './ops.js'

/**
 * Events API: the event history of the service (the same envelopes as webhooks), newest first. Use it to
 * catch up after an outage of your webhook endpoint.
 */
export class EventService {
  private readonly api: ApiRequestor

  constructor(api: ApiRequestor) {
    this.api = api
  }

  /** One page of events. The checksum signs `timestamp` (defaults to now); the filters stay outside it. */
  async list(params: ListEventsParams = {}, options?: RequestOptions): Promise<EventPage> {
    return this.api.execute(listEventsOperation(this.api.service, this.api.checksum, params), options)
  }

  /**
   * Iterates over all matching events page by page, newest first. Every page is signed with the current time.
   *
   * ```js
   * for await (const event of dpay.events.iterate({ types: ['payment.succeeded'] })) { ... }
   * ```
   */
  async *iterate(params: EventFilters = {}, options?: RequestOptions): AsyncGenerator<WebhookEvent, void> {
    // No fixed timestamp: a long iteration would leave the API's 300 s window
    const { timestamp: _ignored, ...filters }: ListEventsParams = params
    for (;;) {
      const page = await this.list(filters, options)
      yield* page.data
      if (!page.hasMore || page.nextStartingAfter === null) return
      filters.startingAfter = page.nextStartingAfter
    }
  }
}
