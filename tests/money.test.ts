import { describe, expect, it } from 'vitest'
import { Currency, assertCurrency } from '../src/currency.js'
import { DPayValueError } from '../src/errors.js'
import { Money } from '../src/money.js'

describe('Money.toDecimal', () => {
  it('matches the money_to_decimal golden vector', () => {
    const cases: Array<[number, string]> = [
      [1050, '10.50'],
      [1000, '10.00'],
      [5, '0.05'],
      [0, '0.00'],
      [-2000, '-20.00'],
      [-5, '-0.05'],
      [123456789, '1234567.89'],
    ]
    for (const [minor, expected] of cases) {
      expect(Money.pln(minor).toDecimal()).toBe(expected)
    }
  })
})

describe('Money.tryFromApiNumber', () => {
  it('matches the money_try_from_api golden vector', () => {
    const inputs: unknown[] = [
      30,
      0,
      -7,
      10.5,
      8.285,
      0.1,
      29.999,
      '10',
      '10.5',
      '10.50',
      '0.05',
      '-0.05',
      'abc',
      true,
      null,
    ]
    const expected = [3000, 0, -700, 1050, 829, 10, 3000, 1000, 1050, 1050, 5, -5, null, null, null]
    const actual = inputs.map((value) => Money.tryFromApiNumber(value, Currency.PLN)?.minor ?? null)
    expect(actual).toEqual(expected)
  })

  it('rounds half away from zero, which is where 8.285 becomes 829', () => {
    expect(Money.tryFromApiNumber(8.285, Currency.PLN)?.minor).toBe(829)
  })

  it('returns null for an unknown currency instead of throwing', () => {
    expect(Money.tryFromApiNumber(10, 'nope')).toBeNull()
  })

  it('never throws on an out-of-range decimal string, returning null instead', () => {
    expect(Money.tryFromApiNumber('999999999999999999.99', Currency.PLN)).toBeNull()
    expect(Money.tryFromApiNumber('99999999999999999', Currency.PLN)).toBeNull()
  })
})

describe('Money construction', () => {
  it('rejects non-integer and unsafe minor units', () => {
    expect(() => Money.pln(10.5)).toThrow(DPayValueError)
    expect(() => Money.pln(Number.MAX_SAFE_INTEGER + 2)).toThrow(DPayValueError)
  })

  it('validates the currency code', () => {
    expect(() => Money.of(100, 'pln')).toThrow(DPayValueError)
    expect(() => assertCurrency('PLNX')).toThrow('Invalid currency code "PLNX"')
    expect(() => Money.of(100, 'GBP')).not.toThrow()
  })

  it('parses decimal strings', () => {
    expect(Money.fromDecimal('10.50', Currency.PLN).minor).toBe(1050)
    expect(Money.fromDecimal('10', Currency.PLN).minor).toBe(1000)
    expect(Money.fromDecimal('10.5', Currency.PLN).minor).toBe(1050)
    expect(Money.fromDecimal('-0.05', Currency.PLN).minor).toBe(-5)
    expect(() => Money.fromDecimal('10.555', Currency.PLN)).toThrow('Invalid money amount "10.555"')
    expect(() => Money.fromDecimal('abc', Currency.PLN)).toThrow(DPayValueError)
  })

  it('throws from the strict parser where the lenient one returns null', () => {
    expect(() => Money.fromApiNumber('abc', Currency.PLN)).toThrow(DPayValueError)
    expect(Money.tryFromApiNumber('abc', Currency.PLN)).toBeNull()
  })
})

describe('Money behaviour', () => {
  it('compares by amount and currency', () => {
    expect(Money.pln(100).equals(Money.pln(100))).toBe(true)
    expect(Money.pln(100).equals(Money.of(100, Currency.EUR))).toBe(false)
  })

  it('reports negativity and renders itself', () => {
    expect(Money.pln(-1).isNegative).toBe(true)
    expect(String(Money.pln(1050))).toBe('10.50 PLN')
  })

  it('serializes to JSON without leaking a class shape', () => {
    expect(JSON.parse(JSON.stringify({ a: Money.pln(1050) }))).toEqual({
      a: { minor: 1050, currency: 'PLN' },
    })
  })

  it('is frozen and immutable', () => {
    const money = Money.pln(1050)
    expect(Object.isFrozen(money)).toBe(true)
    expect(() => {
      Object.defineProperty(money, 'minor', { value: 5000 })
    }).toThrow(TypeError)
    expect(money.minor).toBe(1050)
  })
})
