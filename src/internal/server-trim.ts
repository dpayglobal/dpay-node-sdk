import { DPayValueError } from '../errors.js'
import type { ChecksumCalculator } from './checksum.js'

/**
 * Code points the panel API (`/api/v1/pbl/*`) removes from both ends of every request string before it verifies
 * the checksum (Laravel 13 global `TrimStrings` middleware, `Str::trim()`): `\s` of PCRE2 in UTF/UCP mode (tab,
 * LF, VT, FF, CR, space, NEL, the Z category), NUL and Laravel's `Str::INVISIBLE_CHARACTERS`. 65 code points -
 * `String.prototype.trim()` differs (it keeps e.g. U+0000, U+0085, U+200B, U+00AD).
 */
export const SERVER_TRIM_CODE_POINTS: readonly number[] = Object.freeze([
  0x0000, 0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x0085, 0x00a0, 0x00ad, 0x034f, 0x061c, 0x115f,
  0x1160, 0x1680, 0x17b4, 0x17b5, 0x180e, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
  0x2008, 0x2009, 0x200a, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0x202f, 0x205f, 0x2060,
  0x2061, 0x2062, 0x2063, 0x2064, 0x2065, 0x206a, 0x206b, 0x206c, 0x206d, 0x206e, 0x206f, 0x2800, 0x3000,
  0x3164, 0xfeff, 0xffa0, 0x1d159, 0x1d173, 0x1d174, 0x1d175, 0x1d176, 0x1d177, 0x1d178, 0x1d179, 0x1d17a,
  0xe0020,
])

const TRIMMED = new Set(SERVER_TRIM_CODE_POINTS)

/**
 * The string as the panel API sees it: the code points of `SERVER_TRIM_CODE_POINTS` removed from the start and
 * the end (by code point - U+1D159 and U+E0020 are surrogate pairs), the inside kept. A signed string with such a
 * character at either end would be hashed by the API without it and answered 401 "Unauthorized request".
 */
export function serverTrim(text: string): string {
  let start = 0
  while (start < text.length) {
    const codePoint = text.codePointAt(start) as number
    if (!TRIMMED.has(codePoint)) break
    start += codePoint > 0xffff ? 2 : 1
  }
  let end = text.length
  while (end > start) {
    const codePoint = codePointBefore(text, end, start)
    if (!TRIMMED.has(codePoint)) break
    end -= codePoint > 0xffff ? 2 : 1
  }
  return text.slice(start, end)
}

/** Every string of a decoded JSON value trimmed with `serverTrim()`, nested objects and arrays included (keys and order kept). */
export function trimStrings<T>(value: T): T {
  if (typeof value === 'string') return serverTrim(value) as T
  if (Array.isArray(value)) return value.map(trimStrings) as T
  if (isPlainObject(value)) {
    const trimmed: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value)) trimmed[key] = trimStrings(nested)
    return trimmed as T
  }
  return value
}

/** The trimmed value of a required field; throws when nothing is left (the API would answer 422). */
export function requiredTrimmed(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new DPayValueError(`${field} must be a string`)
  const trimmed = serverTrim(value)
  if (trimmed === '') throw new DPayValueError(`${field} must not be empty`)
  return trimmed
}

/**
 * A panel (`/api/v1/pbl/*`) body ready to send: every string trimmed the way the API trims it before it verifies
 * the checksum, then signed with the ordered-body checksum over the values as sent (`checksum` added last).
 */
export function signPanelBody(
  checksum: ChecksumCalculator,
  body: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const trimmed = trimStrings({ ...body })
  trimmed.checksum = checksum.orderedBody(trimmed)
  return trimmed
}

function codePointBefore(text: string, end: number, start: number): number {
  const low = text.charCodeAt(end - 1)
  if (low >= 0xdc00 && low <= 0xdfff && end - 2 >= start) {
    const high = text.charCodeAt(end - 2)
    if (high >= 0xd800 && high <= 0xdbff) return (high - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000
  }
  return low
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
