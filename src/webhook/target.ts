import { DPayValueError } from '../errors.js'
import { phpStrlen } from '../internal/php.js'
import { isValidUrl } from '../internal/validation.js'
import { WebhookEventType, assertEventsAllowed } from './event-type.js'

/**
 * Per-request webhook address: the `webhook` object of a payment registration, a refund or a card capture.
 * Events of that payment go to this URL, signed with the service's webhook secret, on top of the endpoints
 * set in the panel.
 */
export class WebhookTarget {
  /** https:// URL, at most 500 characters. */
  readonly url: string
  /** Event types to send; empty means every event the request allows. */
  readonly events: readonly WebhookEventType[]

  private constructor(url: string, events: readonly unknown[]) {
    if (typeof url === 'string' && phpStrlen(url) > 500) {
      throw new DPayValueError('Webhook URL must be at most 500 characters')
    }
    if (typeof url !== 'string' || !isValidUrl(url) || url.slice(0, 8).toLowerCase() !== 'https://') {
      throw new DPayValueError(`Webhook URL "${String(url)}" must be a valid https:// URL`)
    }
    if (new Set(events).size !== events.length) {
      throw new DPayValueError('Webhook events must be distinct')
    }
    assertEventsAllowed(events, WebhookEventType.MERCHANT, 'a request')

    this.url = url
    this.events = Object.freeze([...events] as WebhookEventType[])
    Object.freeze(this)
  }

  /**
   * @param url https:// address of your endpoint, at most 500 characters
   * @param events event types to send (distinct); empty means every event the request allows
   */
  static create(url: string, events: readonly (WebhookEventType | (string & {}))[] = []): WebhookTarget {
    if (!Array.isArray(events)) throw new DPayValueError('Webhook events must be a list of event types')
    return new WebhookTarget(url, events)
  }

  /** Wire shape: `url` first, then `events` when not empty - the refund checksum hashes them in this order. */
  toJSON(): { url: string; events?: WebhookEventType[] } {
    return this.events.length === 0 ? { url: this.url } : { url: this.url, events: [...this.events] }
  }
}

/**
 * The `webhook` object of a request, limited to the events `allowed` there. The target is re-validated through
 * `WebhookTarget.create()`, so a plain `{ url, events }` object gets the same checks as a created one.
 */
export function serializeWebhookTarget(
  target: WebhookTarget,
  allowed: readonly string[],
  context: string,
): Record<string, unknown> {
  const candidate: unknown = target
  if (typeof candidate !== 'object' || candidate === null) {
    throw new DPayValueError('Webhook target must be created with WebhookTarget.create()')
  }
  const { url, events } = candidate as { url?: unknown; events?: unknown }
  const checked = WebhookTarget.create(url as string, (events ?? []) as readonly string[])
  assertEventsAllowed(checked.events, allowed, context)
  return checked.toJSON()
}
