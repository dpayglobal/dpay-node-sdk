import { createHmac } from 'node:crypto'
import type { IncomingHttpHeaders } from 'node:http'
import { describe, expect, it } from 'vitest'
import { DPayValueError, SignatureVerificationError } from '../../src/errors.js'
import { WebhookVerifier } from '../../src/webhook/verifier.js'

// Synthetic vector of the shared SDK fixtures (tests/fixtures/api_vectors.json)
const SECRET = 'whsec_ZHBheS1zZGstc3ludGhldGljLXRlc3Qtc2VjcmV0ISE='
const ID = 'evt_01k6a8q2m4pz7h8c3v5n9t2x6y'
const TIMESTAMP = 1790503500
const BODY =
  '{"id":"evt_01k6a8q2m4pz7h8c3v5n9t2x6y","type":"payment.succeeded","data":{"object":{"object":"payment","id":"A75AEBB4-4B89-4834-AD43-EF442C133769","amount":1000}}}'
const SIGNATURE = 'v1,c+mTZVkrtVb4PwbraXxqRxriIZK/jhSz7mRwwA8pX+U='

const nodeHeaders = (signature = SIGNATURE): IncomingHttpHeaders => ({
  'content-type': 'application/json',
  'webhook-id': ID,
  'webhook-timestamp': String(TIMESTAMP),
  'webhook-signature': signature,
})

const sign = (secret: string, id: string, timestamp: number, body: Buffer | string): string => {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.`).update(body).digest('base64')}`
}

describe('WebhookVerifier', () => {
  it('passes the official Standard Webhooks test vector', () => {
    const headers = {
      'webhook-id': 'msg_p5jXN8AQM9LWM0D4loKWxJek',
      'webhook-timestamp': '1614265330',
      'webhook-signature': 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
    }
    const event = WebhookVerifier.constructEvent(
      '{"test": 2432232314}',
      headers,
      'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
      { now: 1614265330 },
    )
    expect(event.raw).toEqual({ test: 2432232314 })
  })

  it('verifies the raw bytes of a Buffer body, not a re-encoded string', () => {
    // Invalid UTF-8 would not survive a decode and re-encode round trip
    const body = Buffer.concat([
      Buffer.from('{"id":"evt_1","note":"'),
      Buffer.from([0xc3, 0x28]),
      Buffer.from('"}'),
    ])
    const headers = { ...nodeHeaders(sign(SECRET, ID, TIMESTAMP, body)) }
    expect(() => WebhookVerifier.verify(body, headers, SECRET, { now: TIMESTAMP })).not.toThrow()
    expect(() => WebhookVerifier.verify(body.toString('utf8'), headers, SECRET, { now: TIMESTAMP })).toThrow(
      SignatureVerificationError,
    )
  })

  it('accepts a Uint8Array body and the secret without the whsec_ prefix', () => {
    const body = new Uint8Array(Buffer.from(BODY, 'utf8'))
    expect(() =>
      WebhookVerifier.verify(body, nodeHeaders(), SECRET.slice('whsec_'.length), { now: TIMESTAMP }),
    ).not.toThrow()
  })

  it('reads IncomingHttpHeaders with array values, any letter case and a WHATWG Headers object', () => {
    const arrays = {
      'Webhook-Id': [ID],
      'WEBHOOK-TIMESTAMP': [String(TIMESTAMP)],
      'webhook-signature': [SIGNATURE, 'v1,ignored'],
    }
    expect(() => WebhookVerifier.verify(BODY, arrays, SECRET, { now: TIMESTAMP })).not.toThrow()

    const whatwg = new Headers({
      'Webhook-Id': ID,
      'Webhook-Timestamp': String(TIMESTAMP),
      'Webhook-Signature': SIGNATURE,
    })
    expect(WebhookVerifier.constructEvent(BODY, whatwg, SECRET, { now: TIMESTAMP }).id).toBe(ID)
  })

  it('finds the matching entry among several signatures separated by whitespace', () => {
    const header = `v1,bm90LXRoaXMtb25l  ${SIGNATURE}\tv2,abc`
    expect(() => WebhookVerifier.verify(BODY, nodeHeaders(header), SECRET, { now: TIMESTAMP })).not.toThrow()
  })

  it('rejects a wrong secret, a truncated signature and an empty secret list', () => {
    const other = `whsec_${Buffer.from('a different synthetic secret').toString('base64')}`
    expect(() => WebhookVerifier.verify(BODY, nodeHeaders(), other, { now: TIMESTAMP })).toThrow(
      'No valid webhook signature found',
    )
    expect(() =>
      WebhookVerifier.verify(BODY, nodeHeaders(SIGNATURE.slice(0, -4)), SECRET, { now: TIMESTAMP }),
    ).toThrow(SignatureVerificationError)
    expect(() => WebhookVerifier.verify(BODY, nodeHeaders(), [], { now: TIMESTAMP })).toThrow(
      'No valid webhook signature found',
    )
  })

  it('rejects an empty or non-numeric timestamp header', () => {
    for (const timestamp of ['', '17905O3500', '-1790503500', '1790503500.0']) {
      const headers = { ...nodeHeaders(), 'webhook-timestamp': timestamp }
      expect(() => WebhookVerifier.verify(BODY, headers, SECRET, { now: TIMESTAMP })).toThrow(
        SignatureVerificationError,
      )
    }
  })

  it('applies the tolerance in both directions and lets it be configured', () => {
    expect(() => WebhookVerifier.verify(BODY, nodeHeaders(), SECRET, { now: TIMESTAMP - 301 })).toThrow(
      'Webhook timestamp is outside the tolerance zone',
    )
    expect(() =>
      WebhookVerifier.verify(BODY, nodeHeaders(), SECRET, { now: TIMESTAMP + 600, toleranceSeconds: 600 }),
    ).not.toThrow()
    expect(() => WebhookVerifier.verify(BODY, nodeHeaders(), SECRET)).toThrow(
      'Webhook timestamp is outside the tolerance zone',
    )
    expect(WebhookVerifier.DEFAULT_TOLERANCE).toBe(300)
  })

  it('decodes secrets like PHP base64_decode in strict mode', () => {
    const key = SECRET.slice('whsec_'.length)
    // Whitespace is skipped, the url-safe alphabet and broken padding are not
    expect(() => WebhookVerifier.verify(BODY, nodeHeaders(), ` ${key}\n`, { now: TIMESTAMP })).not.toThrow()
    for (const secret of ['whsec_', 'whsec_a*b', 'whsec_ZHBh=', 'whsec_ab-_', 'Z']) {
      expect(() => WebhookVerifier.verify(BODY, nodeHeaders(), secret, { now: TIMESTAMP })).toThrow(
        DPayValueError,
      )
    }
  })

  it('asks for the raw body when it gets parsed JSON', () => {
    expect(() =>
      WebhookVerifier.verify(JSON.parse(BODY) as never, nodeHeaders(), SECRET, { now: TIMESTAMP }),
    ).toThrow(/raw webhook body/)
  })

  it('treats missing headers as a failed verification', () => {
    for (const headers of [undefined, null, {}]) {
      expect(() => WebhookVerifier.verify(BODY, headers as never, SECRET, { now: TIMESTAMP })).toThrow(
        'Missing webhook-id, webhook-timestamp or webhook-signature header',
      )
    }
  })

  it('rejects a signed payload that is not a JSON object', () => {
    for (const body of ['[]', 'not json']) {
      const headers = nodeHeaders(sign(SECRET, ID, TIMESTAMP, body))
      expect(() => WebhookVerifier.constructEvent(body, headers, SECRET, { now: TIMESTAMP })).toThrow(
        'Invalid webhook payload',
      )
    }
  })

  it('parses the envelope into a frozen event', () => {
    const body = JSON.stringify({
      id: 'evt_01k6a8q2m4pz7h8c3v5n9t2x6a',
      type: 'recurring_payment.canceled',
      api_version: '2026-10-01',
      created: '2026-09-27T10:06:00Z',
      livemode: false,
      service: null,
      merchant_ref: 'm-7',
      data: { object: { object: 'recurring_payment', alias: 'SUB-1', canceled_by: 'merchant' } },
    })
    const event = WebhookVerifier.constructEvent(
      body,
      nodeHeaders(sign(SECRET, ID, TIMESTAMP, body)),
      SECRET,
      {
        now: TIMESTAMP,
      },
    )
    expect(event).toMatchObject({
      id: 'evt_01k6a8q2m4pz7h8c3v5n9t2x6a',
      type: 'recurring_payment.canceled',
      apiVersion: '2026-10-01',
      created: '2026-09-27T10:06:00Z',
      livemode: false,
      service: null,
      merchantRef: 'm-7',
      objectType: 'recurring_payment',
    })
    expect(event.object.canceled_by).toBe('merchant')
    expect(Object.isFrozen(event)).toBe(true)
  })
})
