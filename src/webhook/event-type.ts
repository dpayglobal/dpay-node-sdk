import { DPayValueError } from '../errors.js'

const EVENT_TYPES = {
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_CAPTURED: 'payment.captured',
  REFUND_SUCCEEDED: 'refund.succeeded',
  REFUND_FAILED: 'refund.failed',
  RECURRING_PAYMENT_ACTIVATED: 'recurring_payment.activated',
  RECURRING_PAYMENT_CANCELED: 'recurring_payment.canceled',
  RECURRING_PAYMENT_EXPIRED: 'recurring_payment.expired',
  RECURRING_PAYMENT_DECLINED: 'recurring_payment.declined',
  PAYOUT_PAID: 'payout.paid',
  PAYOUT_FAILED: 'payout.failed',
  WEBHOOK_TEST: 'webhook.test',
} as const

/** Type of a webhook event (`payment.succeeded`, `refund.failed`, ...). The API may add new types. */
export type WebhookEventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES]

/**
 * Webhook event types, plus the lists of types each place accepts: `MERCHANT` (endpoints and the Events API),
 * `PAYMENT_REGISTRATION`, `REFUND` and `CAPTURE` (the `webhook` object of those requests).
 */
export const WebhookEventType = Object.freeze({
  ...EVENT_TYPES,
  /** Events a merchant endpoint can subscribe to and the Events API can filter on. */
  MERCHANT: Object.freeze([
    EVENT_TYPES.PAYMENT_SUCCEEDED,
    EVENT_TYPES.PAYMENT_FAILED,
    EVENT_TYPES.PAYMENT_CAPTURED,
    EVENT_TYPES.REFUND_SUCCEEDED,
    EVENT_TYPES.REFUND_FAILED,
    EVENT_TYPES.RECURRING_PAYMENT_ACTIVATED,
    EVENT_TYPES.RECURRING_PAYMENT_CANCELED,
    EVENT_TYPES.RECURRING_PAYMENT_EXPIRED,
    EVENT_TYPES.RECURRING_PAYMENT_DECLINED,
    EVENT_TYPES.PAYOUT_PAID,
    EVENT_TYPES.PAYOUT_FAILED,
  ] as const),
  /** Events allowed in the `webhook` object of a payment registration. */
  PAYMENT_REGISTRATION: Object.freeze([
    EVENT_TYPES.PAYMENT_SUCCEEDED,
    EVENT_TYPES.PAYMENT_FAILED,
    EVENT_TYPES.PAYMENT_CAPTURED,
    EVENT_TYPES.REFUND_SUCCEEDED,
    EVENT_TYPES.REFUND_FAILED,
    EVENT_TYPES.RECURRING_PAYMENT_ACTIVATED,
    EVENT_TYPES.RECURRING_PAYMENT_CANCELED,
    EVENT_TYPES.RECURRING_PAYMENT_EXPIRED,
    EVENT_TYPES.RECURRING_PAYMENT_DECLINED,
  ] as const),
  /** Events allowed in the `webhook` object of a refund. */
  REFUND: Object.freeze([EVENT_TYPES.REFUND_SUCCEEDED, EVENT_TYPES.REFUND_FAILED] as const),
  /** Events allowed in the `webhook` object of a card capture. */
  CAPTURE: Object.freeze([EVENT_TYPES.PAYMENT_CAPTURED] as const),
})

/** Throws `DPayValueError` for the first event outside `allowed`. */
export function assertEventsAllowed(
  events: readonly unknown[],
  allowed: readonly string[],
  context: string,
): void {
  for (const event of events) {
    if (typeof event !== 'string' || !allowed.includes(event)) {
      throw new DPayValueError(`Event "${String(event)}" is not allowed in the webhook object of ${context}`)
    }
  }
}
