import { constants, generateKeyPairSync, privateDecrypt } from 'node:crypto'
import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { CardData } from '../../src/card/card-data.js'
import { CardEncryptor } from '../../src/card/encryptor.js'
import { CardEncryptionError, DPayValueError } from '../../src/errors.js'

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
const card = new CardData({ pan: '4111111111111111', cvv: '123', expiry: '12/28' })

describe('CardData', () => {
  it('normalizes and validates the card number', () => {
    expect(new CardData({ pan: '4111 1111 1111 1111', cvv: '123', expiry: '12/28' }).pan).toBe(
      '4111111111111111',
    )
    expect(() => new CardData({ pan: '41111', cvv: '123', expiry: '12/28' })).toThrow(
      'Card number must be 12-19 digits',
    )
    expect(() => new CardData({ pan: '4111111111111111', cvv: '12', expiry: '12/28' })).toThrow(
      'CVV must be 3-4 digits',
    )
    expect(() => new CardData({ pan: '4111111111111111', cvv: '123', expiry: '13/28' })).toThrow(
      'Expiry must be in MM/YY format',
    )
    expect(() => new CardData({ pan: '4111111111111111', cvv: '123', expiry: '2028-12' })).toThrow(
      DPayValueError,
    )
  })

  it('never leaks the PAN or the CVV through logging or serialization', () => {
    expect(JSON.stringify(card)).not.toContain('4111111111111111')
    expect(JSON.stringify(card)).toContain('****1111')
    expect(inspect(card)).not.toContain('4111111111111111')
    expect(inspect(card)).not.toContain('123')
    expect(String(card)).not.toContain('4111111111111111')
  })

  it('never leaks the PAN or the CVV to console.dir, which bypasses the custom inspector', () => {
    // console.dir defaults `customInspect` to false, skipping [util.inspect.custom] entirely.
    // pan/cvv/expiry must therefore not be enumerable own data properties for anything to redact.
    const plain = inspect(card, { customInspect: false })
    expect(plain).not.toContain('4111111111111111')
    expect(plain).not.toContain('123')

    expect(Object.keys(card)).not.toContain('pan')
    expect(Object.keys(card)).not.toContain('cvv')
    expect(Object.keys(card)).not.toContain('expiry')

    expect(card.pan).toBe('4111111111111111')
    expect(card.cvv).toBe('123')
    expect(card.expiry).toBe('12/28')

    expect(JSON.stringify(card)).toContain('****1111')
    expect(JSON.stringify(card)).not.toContain('4111111111111111')
  })
})

describe('CardEncryptor', () => {
  it('produces a payload that decrypts back to the documented JSON shape', () => {
    const encrypted = new CardEncryptor().encrypt(card, 'tx-1', publicKeyPem)
    const cipher = Buffer.from(encrypted, 'base64')
    expect(cipher).toHaveLength(256)

    const decrypted = privateDecrypt({ key: privateKey, padding: constants.RSA_NO_PADDING }, cipher)
    const block = Buffer.concat([Buffer.alloc(256 - decrypted.length, 0), decrypted])

    expect(block[0]).toBe(0x00)
    expect(block[1]).toBe(0x02)
    const separator = block.indexOf(0x00, 2)
    expect(separator).toBeGreaterThanOrEqual(10)
    expect(block.subarray(2, separator).includes(0x00)).toBe(false)

    const payload = JSON.parse(block.subarray(separator + 1).toString('utf8')) as Record<string, unknown>
    expect(Object.keys(payload)).toEqual(['PN', 'SC', 'DT', 'ID', 'TX'])
    expect(payload.PN).toBe('4111111111111111')
    expect(payload.SC).toBe('123')
    expect(payload.DT).toBe('12/28')
    expect(payload.ID).toBe('tx-1')
    expect(typeof payload.TX).toBe('number')
    expect(payload.TX).toBeGreaterThan(1_700_000_000)
  })

  it('escapes slashes in the payload, matching the card_payload golden vector', () => {
    const encrypted = new CardEncryptor().encrypt(card, 'tx-1', publicKeyPem)
    const decrypted = privateDecrypt(
      { key: privateKey, padding: constants.RSA_NO_PADDING },
      Buffer.from(encrypted, 'base64'),
    )
    const block = Buffer.concat([Buffer.alloc(256 - decrypted.length, 0), decrypted])
    const raw = block.subarray(block.indexOf(0x00, 2) + 1).toString('utf8')
    expect(raw).toContain('"DT":"12\\/28"')
  })

  it('produces a different ciphertext every time, because padding is random', () => {
    const encryptor = new CardEncryptor()
    expect(encryptor.encrypt(card, 'tx-1', publicKeyPem)).not.toBe(
      encryptor.encrypt(card, 'tx-1', publicKeyPem),
    )
  })

  it('rejects an unusable public key with a typed error', () => {
    expect(() => new CardEncryptor().encrypt(card, 'tx-1', 'not a key')).toThrow(CardEncryptionError)
    expect(() => new CardEncryptor().encrypt(card, 'tx-1', 'not a key')).toThrow('Invalid RSA public key')
  })
})
