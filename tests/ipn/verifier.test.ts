import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SignatureVerificationError } from '../../src/errors.js'
import { AliasChangeType, IPN_ACK, IpnAliasType, IpnType } from '../../src/ipn/event.js'
import { constructIpnEvent } from '../../src/ipn/verifier.js'
import { RecurringAliasStatus } from '../../src/recurring/enums.js'

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

describe('constructIpnEvent with alias_update', () => {
  const ID = '30D9493D-1D73-3FBD-A5D4-633723CC7A68'
  const aliasSignature = createHash('sha256').update(`${ID}secret123alias_update1`, 'utf8').digest('hex')

  const aliasUpdate = (overrides: Record<string, unknown> = {}): string =>
    JSON.stringify({
      id: ID,
      type: 'alias_update',
      change_type: 'ALIAS_UNREGISTER',
      alias_type: 'UID',
      alias_status: 'UNREGISTERED',
      alias_label: 'Moj sklep',
      alias_key: 'KEY-1',
      alias_expire_at: null,
      change_reason_category: 'USER',
      change_reason_message: 'Unregistered in the banking app',
      version: 1,
      signature: aliasSignature,
      ...overrides,
    })

  const transfer = (overrides: Record<string, unknown> = {}): string => {
    const payload = {
      id: ID,
      amount: '10.00',
      email: 'client@example.com',
      type: 'transfer',
      attempt: 1,
      version: 1,
      custom: 'order-1234',
    }
    const signature = createHash('sha256')
      .update(`${ID}secret12310.00client@example.comtransfer11order-1234`, 'utf8')
      .digest('hex')
    return JSON.stringify({ ...payload, signature, ...overrides })
  }

  it('verifies sha256(id . hash . type . version) and exposes the alias change', () => {
    const event = constructIpnEvent(aliasUpdate(), 'secret123')
    expect(event.isAliasUpdate).toBe(true)
    expect(event.isTransfer).toBe(false)
    expect(event.type).toBe(IpnType.ALIAS_UPDATE)
    expect(event.amount).toBe('')
    expect(event.id).toBe(ID)
    expect(event.version).toBe(1)
    const alias = event.aliasUpdate
    expect(alias?.changeType).toBe(AliasChangeType.UNREGISTER)
    expect(alias?.aliasType).toBe(IpnAliasType.UID)
    expect(alias?.aliasStatus).toBe(RecurringAliasStatus.UNREGISTERED)
    expect(alias?.isActive).toBe(false)
    expect(alias?.aliasKey).toBe('KEY-1')
    expect(alias?.aliasLabel).toBe('Moj sklep')
    expect(alias?.aliasExpireAt).toBeNull()
    expect(alias?.changeReasonCategory).toBe('USER')
    expect(alias?.changeReasonMessage).toBe('Unregistered in the banking app')
    expect(Object.isFrozen(alias)).toBe(true)
  })

  it('does not sign the alias fields, but signs the id', () => {
    // The signature covers only id, type and version - a changed status still verifies, a changed id does not
    const event = constructIpnEvent(aliasUpdate({ alias_status: 'ACTIVE' }), 'secret123')
    expect(event.aliasUpdate?.isActive).toBe(true)
    expect(() => constructIpnEvent(aliasUpdate({ id: 'OTHER' }), 'secret123')).toThrow(
      'Invalid IPN signature',
    )
  })

  it('requires the version', () => {
    expect(() => constructIpnEvent(aliasUpdate({ version: null }), 'secret123')).toThrow(
      'Invalid IPN payload',
    )
  })

  it('ignores the unsigned transfer fields of an alias_update', () => {
    // amount, email, attempt and custom are not part of the alias_update signature - an injected value must not
    // reach handlers that read them without checking the type
    const event = constructIpnEvent(
      aliasUpdate({ amount: '999.00', email: 'attacker@example.com', attempt: 7, custom: 'order-1234' }),
      'secret123',
    )
    expect(event.isAliasUpdate).toBe(true)
    expect(event.amount).toBe('')
    expect(event.email).toBeNull()
    expect(event.attempt).toBe(0)
    expect(event.custom).toBeNull()
    expect(event.id).toBe(ID)
    expect(event.version).toBe(1)
  })

  it('does not let the type downgrade a signature', () => {
    expect(() => constructIpnEvent(transfer(), 'secret123')).not.toThrow()
    expect(() => constructIpnEvent(transfer({ type: 'alias_update' }), 'secret123')).toThrow(
      'Invalid IPN signature',
    )
    expect(() =>
      constructIpnEvent(aliasUpdate({ type: 'transfer', amount: '', attempt: 1 }), 'secret123'),
    ).toThrow('Invalid IPN signature')
  })

  it('has no alias change for other types', () => {
    const event = constructIpnEvent(transfer(), 'secret123')
    expect(event.isAliasUpdate).toBe(false)
    expect(event.aliasUpdate).toBeNull()
    expect(event.amount).toBe('10.00')
    expect(event.custom).toBe('order-1234')
  })
})
