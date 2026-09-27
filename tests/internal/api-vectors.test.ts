import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DPayValueError, SignatureVerificationError } from '../../src/errors.js'
import { ChecksumCalculator } from '../../src/internal/checksum.js'
import { WebhookVerifier } from '../../src/webhook/verifier.js'

/**
 * Shared checksum and webhook vectors of all dpay SDKs (tests/fixtures/api_vectors.json - synthetic data
 * computed with the API code, identical to tests/Fixtures/api_vectors.json of the PHP SDK).
 */
interface ApiVectors {
  service: string
  secret_hash: string
  transaction_id: string
  secret_second: Array<{ name: string; fields: string[]; checksum: string }>
  operation: Array<{ name: string; operation: string; amount: string | null; checksum: string }>
  ordered_body: Array<{ name: string; body: Record<string, unknown>; checksum: string }>
  webhook: {
    secret: string
    old_secret: string
    id: string
    timestamp: number
    body: string
    signature: string
    rotation_signature: string
  }
}

const VECTORS = JSON.parse(
  readFileSync(new URL('../fixtures/api_vectors.json', import.meta.url), 'utf8'),
) as ApiVectors
const calculator = new ChecksumCalculator(VECTORS.secret_hash)
const webhook = VECTORS.webhook

const headers = (signature: string = webhook.signature): Record<string, string> => ({
  'Webhook-Id': webhook.id,
  'WEBHOOK-TIMESTAMP': String(webhook.timestamp),
  'webhook-signature': signature,
})

describe('shared API vectors', () => {
  it('has every section the PHP SDK checks', () => {
    expect(VECTORS.secret_second).toHaveLength(10)
    expect(VECTORS.operation).toHaveLength(4)
    expect(VECTORS.ordered_body).toHaveLength(3)
  })

  it.each(VECTORS.secret_second.map((vector) => [vector.name, vector] as const))(
    'secret_second %s',
    (_name, vector) => {
      expect(calculator.secretSecond(VECTORS.service, vector.fields)).toBe(vector.checksum)
    },
  )

  it.each(VECTORS.operation.map((vector) => [vector.name, vector] as const))(
    'operation %s',
    (_name, vector) => {
      expect(
        calculator.operation(vector.operation, VECTORS.service, VECTORS.transaction_id, vector.amount),
      ).toBe(vector.checksum)
    },
  )

  it.each(VECTORS.ordered_body.map((vector) => [vector.name, vector] as const))(
    'ordered_body %s',
    (_name, vector) => {
      expect(calculator.orderedBody(vector.body)).toBe(vector.checksum)
    },
  )

  it('ordered_body skips the checksum key and casts values like the API', () => {
    const expected = createHash('sha256').update('a|1||b|h', 'utf8').digest('hex')
    expect(
      new ChecksumCalculator('h').orderedBody({
        x: 'a',
        checksum: 'ignored',
        y: true,
        z: null,
        w: { v: 'b' },
      }),
    ).toBe(expected)
  })
})

describe('shared webhook vectors', () => {
  it('verifies the signature and returns the event', () => {
    const event = WebhookVerifier.constructEvent(webhook.body, headers(), webhook.secret, {
      now: webhook.timestamp + 10,
    })
    expect(event.id).toBe(webhook.id)
    expect(event.type).toBe('payment.succeeded')
    expect(event.objectType).toBe('payment')
    expect(event.object.amount).toBe(1000)
  })

  it('accepts either signature of a rotation, and a list of secrets', () => {
    const options = { now: webhook.timestamp }
    expect(() =>
      WebhookVerifier.verify(webhook.body, headers(webhook.rotation_signature), webhook.old_secret, options),
    ).not.toThrow()
    expect(() =>
      WebhookVerifier.verify(webhook.body, headers(), [webhook.old_secret, webhook.secret], options),
    ).not.toThrow()
  })

  it('rejects an old timestamp', () => {
    expect(() =>
      WebhookVerifier.verify(webhook.body, headers(), webhook.secret, { now: webhook.timestamp + 301 }),
    ).toThrow('Webhook timestamp is outside the tolerance zone')
    expect(() =>
      WebhookVerifier.verify(webhook.body, headers(), webhook.secret, { now: webhook.timestamp + 300 }),
    ).not.toThrow()
  })

  it('rejects a changed body', () => {
    expect(() =>
      WebhookVerifier.verify(webhook.body.replace('1000', '100000'), headers(), webhook.secret, {
        now: webhook.timestamp,
      }),
    ).toThrow(SignatureVerificationError)
  })

  it('rejects a missing header', () => {
    const { 'webhook-signature': _signature, ...withoutSignature } = headers()
    expect(() =>
      WebhookVerifier.verify(webhook.body, withoutSignature, webhook.secret, { now: webhook.timestamp }),
    ).toThrow('Missing webhook-id, webhook-timestamp or webhook-signature header')
  })

  it('ignores signatures of other versions', () => {
    const v2 = `v2,${webhook.signature.slice(3)}`
    expect(() =>
      WebhookVerifier.verify(webhook.body, headers(v2), webhook.secret, { now: webhook.timestamp }),
    ).toThrow('No valid webhook signature found')
  })

  it('rejects a secret that is not the whsec_ value as a configuration error', () => {
    const error = (() => {
      try {
        WebhookVerifier.verify(webhook.body, headers(), 'whsec_***', { now: webhook.timestamp })
      } catch (caught) {
        return caught
      }
      return null
    })()
    expect(error).toBeInstanceOf(DPayValueError)
    expect(error).not.toBeInstanceOf(SignatureVerificationError)
  })
})
