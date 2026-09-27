import { describe, expect, it } from 'vitest'
import { DPayValueError } from '../../src/errors.js'
import { WebhookEventType } from '../../src/webhook/event-type.js'
import { WebhookTarget, serializeWebhookTarget } from '../../src/webhook/target.js'

describe('WebhookTarget', () => {
  it('serializes url first and events only when given', () => {
    const all = WebhookTarget.create('https://shop.example/webhooks')
    expect(all.toJSON()).toEqual({ url: 'https://shop.example/webhooks' })
    expect(JSON.stringify(all)).toBe('{"url":"https://shop.example/webhooks"}')

    const some = WebhookTarget.create('https://shop.example/webhooks', ['refund.failed', 'refund.succeeded'])
    expect(Object.keys(some.toJSON())).toEqual(['url', 'events'])
    expect(some.toJSON().events).toEqual(['refund.failed', 'refund.succeeded'])
    expect(Object.isFrozen(some)).toBe(true)
    expect(Object.isFrozen(some.events)).toBe(true)
  })

  it('requires an https:// URL of at most 500 characters', () => {
    expect(() => WebhookTarget.create('http://shop.example/webhooks')).toThrow(
      'Webhook URL "http://shop.example/webhooks" must be a valid https:// URL',
    )
    expect(() => WebhookTarget.create('not a url')).toThrow(DPayValueError)
    expect(() => WebhookTarget.create('HTTPS://shop.example/webhooks')).not.toThrow()
    const long = `https://shop.example/${'a'.repeat(480)}`
    expect(() => WebhookTarget.create(long)).toThrow('Webhook URL must be at most 500 characters')
    expect(() => WebhookTarget.create(long.slice(0, 500))).not.toThrow()
  })

  it('accepts only distinct merchant event types', () => {
    expect(() =>
      WebhookTarget.create('https://shop.example/w', ['payment.failed', 'payment.failed']),
    ).toThrow('Webhook events must be distinct')
    expect(() => WebhookTarget.create('https://shop.example/w', ['webhook.test'])).toThrow(
      'Event "webhook.test" is not allowed in the webhook object of a request',
    )
    expect(() => WebhookTarget.create('https://shop.example/w', [...WebhookEventType.MERCHANT])).not.toThrow()
  })

  it('limits the events to what the request allows, and re-validates plain objects', () => {
    const target = WebhookTarget.create('https://shop.example/w', ['payout.paid'])
    expect(() => serializeWebhookTarget(target, WebhookEventType.PAYMENT_REGISTRATION, 'a payment')).toThrow(
      'Event "payout.paid" is not allowed in the webhook object of a payment',
    )
    const plain = { url: 'https://shop.example/w', events: ['refund.failed'] } as unknown as WebhookTarget
    expect(serializeWebhookTarget(plain, WebhookEventType.REFUND, 'a refund')).toEqual({
      url: 'https://shop.example/w',
      events: ['refund.failed'],
    })
    const insecure = { url: 'http://shop.example/w' } as unknown as WebhookTarget
    expect(() => serializeWebhookTarget(insecure, WebhookEventType.REFUND, 'a refund')).toThrow(
      DPayValueError,
    )
  })

  it('lists the event groups of the API', () => {
    expect(WebhookEventType.MERCHANT).toHaveLength(11)
    expect(WebhookEventType.PAYMENT_REGISTRATION).toHaveLength(9)
    expect(WebhookEventType.REFUND).toEqual(['refund.succeeded', 'refund.failed'])
    expect(WebhookEventType.CAPTURE).toEqual(['payment.captured'])
    expect(WebhookEventType.MERCHANT).not.toContain(WebhookEventType.WEBHOOK_TEST)
    expect(Object.isFrozen(WebhookEventType.MERCHANT)).toBe(true)
  })
})
