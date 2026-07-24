import { describe, expect, it } from 'vitest'
import {
  isNumeric,
  isPhpBool,
  isPhpInt,
  isScalar,
  phpInt,
  phpJsonEncode,
  phpRound,
  phpStrval,
} from '../../src/internal/php.js'

describe('phpStrval', () => {
  it('matches the golden vector from the PHP SDK', () => {
    const inputs: unknown[] = [10, 10.5, 0.1, 1 / 3, 1e25, -0, 100, 828.5, true, false, 42, 'abc']
    const expected = [
      '10',
      '10.5',
      '0.1',
      '0.33333333333333',
      '1.0E+25',
      '-0',
      '100',
      '828.5',
      '1',
      '',
      '42',
      'abc',
    ]
    expect(inputs.map(phpStrval)).toEqual(expected)
  })

  it('renders nullish as an empty string', () => {
    expect(phpStrval(null)).toBe('')
    expect(phpStrval(undefined)).toBe('')
  })

  it('renders non-finite numbers the way PHP does', () => {
    expect(phpStrval(Number.NaN)).toBe('NAN')
    expect(phpStrval(Number.POSITIVE_INFINITY)).toBe('INF')
    expect(phpStrval(Number.NEGATIVE_INFINITY)).toBe('-INF')
  })

  it('uses exponential form on the same boundary as %.14G', () => {
    expect(phpStrval(1e-5)).toBe('1.0E-5')
    expect(phpStrval(1e-4)).toBe('0.0001')
    expect(phpStrval(1e14)).toBe('1.0E+14')
    expect(phpStrval(99999999999999)).toBe('99999999999999')
  })
})

describe('phpRound', () => {
  it('rounds half away from zero, unlike Math.round', () => {
    expect(phpRound(828.5)).toBe(829)
    expect(phpRound(-828.5)).toBe(-829)
    expect(phpRound(-0.5)).toBe(-1)
    expect(Math.round(-0.5)).toBe(-0)
    expect(phpRound(2.4)).toBe(2)
  })
})

describe('phpInt', () => {
  it('parses the leading integer out of a string', () => {
    expect(phpInt('42abc')).toBe(42)
    expect(phpInt('  -7 ')).toBe(-7)
    expect(phpInt('abc')).toBe(0)
    expect(phpInt('')).toBe(0)
  })

  it('truncates towards zero and maps booleans', () => {
    expect(phpInt(9.9)).toBe(9)
    expect(phpInt(-9.9)).toBe(-9)
    expect(phpInt(true)).toBe(1)
    expect(phpInt(false)).toBe(0)
    expect(phpInt(null)).toBe(0)
  })

  it('takes the full leading numeric prefix, including fractional and exponential forms, since PHP 7', () => {
    expect(phpInt('1e3')).toBe(1000)
    expect(phpInt('1e3abc')).toBe(1000)
    expect(phpInt('9.9')).toBe(9)
    expect(phpInt('.5')).toBe(0)
    expect(phpInt('42abc')).toBe(42)
    expect(phpInt('abc')).toBe(0)
    expect(phpInt('1.9e2')).toBe(190)
    expect(phpInt('5e-1')).toBe(0)
  })

  it('clamps an overflowing numeric string into a safe integer instead of returning an inexact float', () => {
    expect(phpInt('99999999999999999999')).toBe(Number.MAX_SAFE_INTEGER)
    expect(phpInt('-99999999999999999999')).toBe(Number.MIN_SAFE_INTEGER)
    expect(Number.isSafeInteger(phpInt('99999999999999999999'))).toBe(true)
  })

  it('normalizes negative zero to positive zero, matching PHP integer cast behavior', () => {
    expect(Object.is(phpInt(-0), 0)).toBe(true)
    expect(Object.is(phpInt(-0.5), 0)).toBe(true)
    expect(Object.is(phpInt('-0'), 0)).toBe(true)
    expect(Object.is(phpInt('-0.9'), 0)).toBe(true)
  })

  it('clamps to safe integer boundaries for direct number inputs', () => {
    expect(phpInt(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER)
    expect(phpInt(Number.MAX_SAFE_INTEGER + 1)).toBe(Number.MAX_SAFE_INTEGER)
    expect(phpInt(Number.MIN_SAFE_INTEGER)).toBe(Number.MIN_SAFE_INTEGER)
    expect(phpInt(Number.MIN_SAFE_INTEGER - 1)).toBe(Number.MIN_SAFE_INTEGER)
  })
})

describe('phpJsonEncode', () => {
  it('matches the float_cast golden vector', () => {
    const cases: Record<string, string> = {
      '29.99': '{"amount":29.99}',
      '10.00': '{"amount":10}',
      '0.05': '{"amount":0.05}',
      '-20.00': '{"amount":-20}',
      '1234567.89': '{"amount":1234567.89}',
    }
    for (const [decimal, expected] of Object.entries(cases)) {
      expect(phpJsonEncode({ amount: Number(decimal) })).toBe(expected)
    }
  })

  it('leaves unicode and slashes unescaped by default', () => {
    expect(phpJsonEncode({ a: 'Zamówienie / ĄĘŚŻ' })).toBe('{"a":"Zamówienie / ĄĘŚŻ"}')
  })

  it('escapes slashes on demand and matches the card payload golden vector', () => {
    const payload = { PN: '4111111111111111', SC: '123', DT: '12/25', ID: 'tx-1', TX: 1784700000 }
    expect(phpJsonEncode(payload, { escapeSlashes: true })).toBe(
      '{"PN":"4111111111111111","SC":"123","DT":"12\\/25","ID":"tx-1","TX":1784700000}',
    )
  })

  it('preserves insertion order and never sorts keys', () => {
    expect(phpJsonEncode({ b: 1, a: 2, c: 3 })).toBe('{"b":1,"a":2,"c":3}')
  })

  it('encodes an empty object as {} and not []', () => {
    expect(phpJsonEncode({})).toBe('{}')
  })

  it('rejects non-finite numbers instead of silently writing null', () => {
    expect(() => phpJsonEncode({ a: Number.NaN })).toThrow('not JSON encodable')
    expect(() => phpJsonEncode({ a: Number.POSITIVE_INFINITY })).toThrow('not JSON encodable')
    expect(JSON.stringify({ a: Number.NaN })).toBe('{"a":null}')
  })
})

describe('isPhpInt', () => {
  it('is true for any integral number, including -0 and integral floats', () => {
    expect(isPhpInt(42)).toBe(true)
    expect(isPhpInt(-0)).toBe(true)
    expect(isPhpInt(10.0)).toBe(true)
  })

  it('is false for booleans, strings and non-integral numbers', () => {
    expect(isPhpInt(true)).toBe(false)
    expect(isPhpInt(false)).toBe(false)
    expect(isPhpInt('42')).toBe(false)
    expect(isPhpInt(10.5)).toBe(false)
  })
})

describe('isPhpBool', () => {
  it('is true only for true and false', () => {
    expect(isPhpBool(true)).toBe(true)
    expect(isPhpBool(false)).toBe(true)
  })

  it('is false for numbers, strings, null and undefined', () => {
    expect(isPhpBool(1)).toBe(false)
    expect(isPhpBool('true')).toBe(false)
    expect(isPhpBool(null)).toBe(false)
    expect(isPhpBool(undefined)).toBe(false)
  })
})

describe('predicates', () => {
  it('follows PHP is_scalar and is_numeric', () => {
    expect(isScalar(1)).toBe(true)
    expect(isScalar(true)).toBe(true)
    expect(isScalar('a')).toBe(true)
    expect(isScalar(null)).toBe(false)
    expect(isScalar({})).toBe(false)
    expect(isNumeric(' 1.5 ')).toBe(true)
    expect(isNumeric('')).toBe(false)
    expect(isNumeric('abc')).toBe(false)
    expect(isNumeric(true)).toBe(false)
  })

  it('rejects hex, binary and octal literal strings, unlike Number()', () => {
    expect(isNumeric('0x1A')).toBe(false)
    expect(isNumeric('0b101')).toBe(false)
    expect(isNumeric('0o17')).toBe(false)
  })

  it('accepts an exponent that overflows to INF, matching PHP is_numeric', () => {
    expect(isNumeric('1e400')).toBe(true)
  })

  it('follows the full PHP numeric-string grammar for fractional and exponential forms', () => {
    expect(isNumeric('.5')).toBe(true)
    expect(isNumeric('5.')).toBe(true)
    expect(isNumeric('  +5.5e-3  ')).toBe(true)
    expect(isNumeric('1e3abc')).toBe(false)
    expect(isNumeric('.')).toBe(false)
    expect(isNumeric('1.2.3')).toBe(false)
  })

  it('treats every JS number as numeric, matching PHP is_numeric for int|float, including NAN and INF', () => {
    expect(isNumeric(Number.NaN)).toBe(true)
    expect(isNumeric(Number.POSITIVE_INFINITY)).toBe(true)
    expect(isNumeric(Number.NEGATIVE_INFINITY)).toBe(true)
  })
})
