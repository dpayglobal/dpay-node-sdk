import { describe, expect, it } from 'vitest'
import { DPayValueError } from '../../src/errors.js'
import {
  SERVER_TRIM_CODE_POINTS,
  requiredTrimmed,
  serverTrim,
  trimStrings,
} from '../../src/internal/server-trim.js'

const TRIMMED = new Set(SERVER_TRIM_CODE_POINTS)

describe('serverTrim', () => {
  it('uses the 65 code points of Laravel 13 Str::trim()', () => {
    expect(SERVER_TRIM_CODE_POINTS).toHaveLength(65)
    expect(TRIMMED.size).toBe(65)
    expect([...SERVER_TRIM_CODE_POINTS].sort((a, b) => a - b)).toEqual(SERVER_TRIM_CODE_POINTS)
  })

  it('removes exactly the set from either end, by code point, over every Unicode scalar value', () => {
    const wrong: number[] = []
    for (let codePoint = 0; codePoint <= 0x10ffff; codePoint++) {
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue
      const char = String.fromCodePoint(codePoint)
      const expected = TRIMMED.has(codePoint) ? '' : char
      if (serverTrim(char) !== expected || serverTrim(`${char}x${char}`) !== `${expected}x${expected}`) {
        wrong.push(codePoint)
      }
      // Never touched inside the string
      if (serverTrim(`x${char}x`) !== `x${char}x`) wrong.push(codePoint)
    }
    expect(wrong).toEqual([])
  })

  it('differs from String.prototype.trim()', () => {
    for (const text of ['\u0000x', '\u0085x', '​x', '­x', 'x⁠', '\u{1d159}x']) {
      expect(text.trim()).toBe(text)
      expect(serverTrim(text)).toBe('x')
    }
    // trim() strips U+FEFF and the Zs spaces too; those are in the set as well
    expect(serverTrim('﻿　x ')).toBe('x')
  })

  it('keeps lone surrogates and repeats until a character outside the set', () => {
    expect(serverTrim('\ud834 x')).toBe('\ud834 x')
    expect(serverTrim(' x\udd59')).toBe('x\udd59')
    expect(serverTrim('\u{e0020}\u{1d17a} \n')).toBe('')
    expect(serverTrim('')).toBe('')
  })
})

describe('trimStrings', () => {
  it('trims nested strings, keeps other values, keys and order, and leaves the input as it was', () => {
    const input = {
      service: ' s ',
      value: 15,
      flag: true,
      none: null,
      webhook: { url: '​https://x.test/\n', events: [' refund.succeeded'] },
    }
    const trimmed = trimStrings(input)
    expect(JSON.stringify(trimmed)).toBe(
      '{"service":"s","value":15,"flag":true,"none":null,"webhook":{"url":"https://x.test/","events":["refund.succeeded"]}}',
    )
    expect(input.service).toBe(' s ')
    expect(input.webhook.url).toBe('​https://x.test/\n')
  })
})

describe('requiredTrimmed', () => {
  it('returns the trimmed value', () => {
    expect(requiredTrimmed('\tA75AEBB4 ', 'transaction_id')).toBe('A75AEBB4')
  })

  it.each([
    ['', 'transaction_id must not be empty'],
    [' 　﻿\n', 'transaction_id must not be empty'],
    [42, 'transaction_id must be a string'],
    [undefined, 'transaction_id must be a string'],
  ] as Array<[unknown, string]>)('rejects %j', (value, message) => {
    expect(() => requiredTrimmed(value, 'transaction_id')).toThrow(new DPayValueError(message))
  })
})
