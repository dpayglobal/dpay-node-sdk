import { record, strictString } from '../payment/models.js'
import type { WebhookEventType } from './event-type.js'

/**
 * Webhook event envelope: `{id, type, api_version, created, livemode, service, [merchant_ref], data: {object}}`.
 * `object` stays a plain object - payment, refund, recurring_payment or payout, amounts in minor units.
 */
export interface WebhookEvent {
  /** `evt_...`, the same on every delivery attempt - deduplicate on it. */
  readonly id: string
  readonly type: WebhookEventType | (string & {})
  readonly apiVersion: string | null
  /** Event time in UTC (`YYYY-MM-DDTHH:MM:SSZ`) - not the delivery time, do not use it against replays. */
  readonly created: string | null
  /** False only when the payload says exactly `false`. */
  readonly livemode: boolean
  /** Service name, `null` for account events (payouts) and test events. */
  readonly service: string | null
  /** Merchant reference, present only in events sent to a dpay Connect partner. */
  readonly merchantRef: string | null
  /** `data.object`, or an empty object when it is missing. */
  readonly object: Record<string, unknown>
  /** `payment`, `refund`, `recurring_payment`, `payout` or `webhook_endpoint`. */
  readonly objectType: string | null
  readonly raw: Record<string, unknown>
}

/** One page of the Events API, newest events first. */
export interface EventPage {
  /** Re-encoded by the API - do not verify webhook signatures on them. */
  readonly data: readonly WebhookEvent[]
  readonly hasMore: boolean
  /** Pass it as `startingAfter` to read the next page. */
  readonly nextStartingAfter: string | null
  readonly raw: Record<string, unknown>
}

/** Builds a frozen `WebhookEvent` from a decoded event envelope. */
export function parseWebhookEvent(data: Record<string, unknown>): WebhookEvent {
  const object = record(record(data.data)?.object) ?? {}
  return Object.freeze({
    id: strictString(data, 'id') ?? '',
    type: strictString(data, 'type') ?? '',
    apiVersion: strictString(data, 'api_version'),
    created: strictString(data, 'created'),
    livemode: data.livemode !== false,
    service: strictString(data, 'service'),
    merchantRef: strictString(data, 'merchant_ref'),
    object,
    objectType: strictString(object, 'object'),
    raw: data,
  })
}

/** Builds a frozen `EventPage` from the raw JSON body of `POST /api/v1_0/events`. */
export function parseEventPage(response: Record<string, unknown>): EventPage {
  const items = Array.isArray(response.data) ? response.data : []
  return Object.freeze({
    data: Object.freeze(
      items.filter((item): item is Record<string, unknown> => record(item) !== null).map(parseWebhookEvent),
    ),
    hasMore: response.has_more === true,
    nextStartingAfter: strictString(response, 'next_starting_after'),
    raw: response,
  })
}
