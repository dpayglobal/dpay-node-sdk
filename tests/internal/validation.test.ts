import { describe, expect, it } from 'vitest'
import { DPayValueError } from '../../src/errors.js'
import { assertDate, isValidDate, isValidEmail, isValidUrl } from '../../src/internal/validation.js'

describe('isValidUrl', () => {
  it('requires a scheme and a host', () => {
    expect(isValidUrl('https://shop.test/ok')).toBe(true)
    expect(isValidUrl('http://localhost:3000/ipn')).toBe(true)
    expect(isValidUrl('')).toBe(false)
    expect(isValidUrl('/ok')).toBe(false)
    expect(isValidUrl('shop.test/ok')).toBe(false)
    expect(isValidUrl('https://shop.test/a b')).toBe(false)
    expect(isValidUrl('https://')).toBe(false)
  })

  it('rejects URLs with C0 control characters', () => {
    expect(isValidUrl('\x00https://shop.test/ok')).toBe(false)
    expect(isValidUrl('https://shop.test/ok\x01')).toBe(false)
    expect(isValidUrl('https://shop.test/\x1fok')).toBe(false)
  })
})

describe('isValidEmail', () => {
  it('accepts an address with a dotted domain', () => {
    expect(isValidEmail('jan@example.com')).toBe(true)
    expect(isValidEmail('jan@example')).toBe(false)
    expect(isValidEmail('jan example@x.pl')).toBe(false)
    expect(isValidEmail('@x.pl')).toBe(false)
  })
})

describe('isValidDate and assertDate', () => {
  it('requires the YYYY-MM-DD shape', () => {
    expect(isValidDate('2026-08-15')).toBe(true)
    expect(isValidDate('15-08-2026')).toBe(false)
    expect(assertDate('2026-08-15')).toBe('2026-08-15')
    expect(() => assertDate('nope')).toThrow(DPayValueError)
    expect(() => assertDate('nope')).toThrow('Date "nope" must be in YYYY-MM-DD format')
  })
})
