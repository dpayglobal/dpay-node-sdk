import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SignatureVerificationError } from '../../src/errors.js'
import { IPN_ACK, IpnType } from '../../src/ipn/event.js'
import { constructIpnEvent } from '../../src/ipn/verifier.js'

const SECRET = 'sekret-hash-123'

const sign = (payload: Record<string, unknown>): string => {
  const parts = [String(payload.id), SECRET, String(payload.amount)]
  if (payload.type !== 'dcb') parts.push(String(payload.email ?? ''))
  parts.push(
    String(payload.type),
    String(payload.attempt),
    String(payload.version),
    String(payload.custom ?? ''),
  )
  return createHash('sha256').update(parts.join(''), 'utf8').digest('hex')
}

const body = (payload: Record<string, unknown>): string =>
  JSON.stringify({ ...payload, signature: sign(payload) })

describe('constructIpnEvent', () => {
  it('accepts a valid transfer notification', () => {
    const event = constructIpnEvent(
      body({
        id: 'tx-1',
        amount: '29.99',
        email: 'jan@example.com',
        type: 'transfer',
        attempt: 1,
        version: 2,
        custom: 'order-1',
      }),
      SECRET,
    )
    expect(event.id).toBe('tx-1')
    expect(event.amount).toBe('29.99')
    expect(event.email).toBe('jan@example.com')
    expect(event.isTransfer).toBe(true)
    expect(event.attempt).toBe(1)
    expect(event.version).toBe(2)
    expect(event.custom).toBe('order-1')
    expect(event.capturePaymentId).toBeNull()
  })

  it('omits email from the digest for the dcb variant', () => {
    const event = constructIpnEvent(
      body({ id: 'tx-2', amount: '10.50', type: 'dcb', attempt: 3, version: 1 }),
      SECRET,
    )
    expect(event.isDcb).toBe(true)
    expect(event.email).toBeNull()
  })

  it('reads capture_payment_id and coerces string counters', () => {
    const event = constructIpnEvent(
      body({
        id: 'tx-3',
        amount: 10.5,
        email: '',
        type: 'capture',
        attempt: '1',
        version: '1',
        custom: '',
        capture_payment_id: 'cap-9',
      }),
      SECRET,
    )
    expect(event.isCapture).toBe(true)
    expect(event.amount).toBe('10.5')
    expect(event.attempt).toBe(1)
    expect(event.capturePaymentId).toBe('cap-9')
  })

  it('stringifies a numeric id and amount without normalizing them', () => {
    const event = constructIpnEvent(
      body({ id: 4, amount: 10, type: 'transfer', attempt: 1, version: 1 }),
      SECRET,
    )
    expect(event.id).toBe('4')
    expect(event.amount).toBe('10')
  })

  it('accepts a Buffer body', () => {
    const raw = body({ id: 'tx-1', amount: '1.00', email: '', type: 'transfer', attempt: 1, version: 1 })
    expect(constructIpnEvent(Buffer.from(raw, 'utf8'), SECRET).id).toBe('tx-1')
  })

  it('rejects a tampered signature', () => {
    const raw = body({ id: 'tx-1', amount: '29.99', email: '', type: 'transfer', attempt: 1, version: 1 })
    const tampered = raw.replace('"29.99"', '"1.00"')
    expect(() => constructIpnEvent(tampered, SECRET)).toThrow(SignatureVerificationError)
    expect(() => constructIpnEvent(tampered, SECRET)).toThrow('Invalid IPN signature')
  })

  it('rejects a wrong secret', () => {
    const raw = body({ id: 'tx-1', amount: '1.00', email: '', type: 'transfer', attempt: 1, version: 1 })
    expect(() => constructIpnEvent(raw, 'other-secret')).toThrow('Invalid IPN signature')
  })

  it('rejects malformed payloads', () => {
    expect(() => constructIpnEvent('not json', SECRET)).toThrow('Invalid IPN payload')
    expect(() => constructIpnEvent('[]', SECRET)).toThrow('Invalid IPN payload')
    expect(() => constructIpnEvent('{"id":"a"}', SECRET)).toThrow('Invalid IPN payload')
    expect(() =>
      constructIpnEvent(
        JSON.stringify({ id: 'a', amount: '1', type: 't', attempt: 1, version: 1, signature: 5 }),
        SECRET,
      ),
    ).toThrow('Invalid IPN payload')
  })

  it('rejects a signature of the wrong length without leaking timing', () => {
    const raw = JSON.stringify({
      id: 'a',
      amount: '1',
      type: 'transfer',
      attempt: 1,
      version: 1,
      signature: 'short',
    })
    expect(() => constructIpnEvent(raw, SECRET)).toThrow(SignatureVerificationError)
  })

  it('exposes the exact ACK body dpay requires', () => {
    expect(IPN_ACK).toBe('OK')
    expect(IpnType.TRANSFER).toBe('transfer')
  })
})
