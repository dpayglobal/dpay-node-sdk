import { DPayValueError } from '../errors.js'
import { API_PAYMENTS } from '../internal/base-urls.js'
import type { ChecksumCalculator } from '../internal/checksum.js'
import { type Operation, decodeRecordOrFail } from '../internal/operation.js'
import { WebhookEventType, assertEventsAllowed } from './event-type.js'
import { type EventPage, parseEventPage } from './event.js'

const EVENT_ID = /^evt_[0-9a-z]{26}$/

/** Filters of the Events API. */
export interface EventFilters {
  /** Distinct merchant event types (`WebhookEventType.MERCHANT`). */
  types?: readonly (WebhookEventType | (string & {}))[]
  /** ISO 8601 date or time; compared with the event time. */
  createdFrom?: string
  /** ISO 8601 date or time; compared with the event time. */
  createdTo?: string
  /** `nextStartingAfter` of the previous page. */
  startingAfter?: string
  /** Page size, 1-100 (the API defaults to 20). */
  limit?: number
}

/** `events.list()` parameters: the filters and the Unix time the checksum is computed for. */
export interface ListEventsParams extends EventFilters {
  /** Unix time in seconds for the checksum. Defaults to now; the API accepts +/- 300 seconds. */
  timestamp?: number
}

export function listEventsOperation(
  service: string,
  checksum: ChecksumCalculator,
  params: ListEventsParams,
): Operation<EventPage> {
  const timestamp = params.timestamp ?? Math.floor(Date.now() / 1000)
  if (!Number.isSafeInteger(timestamp)) {
    throw new DPayValueError('timestamp must be a Unix time in whole seconds')
  }

  const body: Record<string, unknown> = { service, timestamp }
  if (params.types !== undefined) {
    const types = params.types
    if (!Array.isArray(types) || types.length === 0 || new Set(types).size !== types.length) {
      throw new DPayValueError('Event types must be a non-empty list of distinct types')
    }
    assertEventsAllowed(types, WebhookEventType.MERCHANT, 'the Events API')
    body.types = [...types]
  }
  if (params.createdFrom !== undefined) body.created_from = params.createdFrom
  if (params.createdTo !== undefined) body.created_to = params.createdTo
  if (params.startingAfter !== undefined) {
    if (!EVENT_ID.test(params.startingAfter)) {
      throw new DPayValueError('starting_after must be an event id (evt_...)')
    }
    body.starting_after = params.startingAfter
  }
  if (params.limit !== undefined) {
    if (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 100) {
      throw new DPayValueError('limit must be between 1 and 100')
    }
    body.limit = params.limit
  }
  body.checksum = checksum.secretSecond(service, [String(timestamp)])

  return {
    method: 'POST',
    host: API_PAYMENTS,
    path: '/api/v1_0/events',
    body,
    parse: (response) => parseEventPage(decodeRecordOrFail(response)),
  }
}
