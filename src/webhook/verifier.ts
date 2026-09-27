import { createHmac, timingSafeEqual } from 'node:crypto'
import { DPayValueError, SignatureVerificationError } from '../errors.js'
import { record } from '../payment/models.js'
import { type WebhookEvent, parseWebhookEvent } from './event.js'

const DEFAULT_TOLERANCE = 300
const SECRET_PREFIX = 'whsec_'
const DIGITS = /^\d+$/
const WHITESPACE = /[ \t\n\v\f\r]+/
/** Characters PHP's strict base64_decode skips. */
const BASE64_SKIPPED = /[\t\n\r ]/g
const BASE64 = /^([A-Za-z0-9+/]*)(=*)$/

/**
 * Request headers: a Node `IncomingHttpHeaders` object (values may be arrays - the first one is used) or
 * any plain object, looked up regardless of letter case, or a WHATWG `Headers` instance.
 */
export type WebhookHeaders =
  | Readonly<Record<string, string | readonly string[] | undefined>>
  | { get(name: string): string | null }

/** The endpoint's `whsec_...` secret, or several during a secret rotation. */
export type WebhookSecrets = string | readonly string[]

export interface WebhookVerifyOptions {
  /** Maximum distance between `webhook-timestamp` and now, in seconds. Defaults to 300. */
  toleranceSeconds?: number
  /** Current Unix time in seconds. Defaults to the system clock; set it in tests. */
  now?: number
}

/**
 * Verifies the signature of a dpay webhook (Standard Webhooks) and returns the event. Pass the raw request
 * body exactly as received - a re-serialized JSON object will not verify.
 */
function constructEvent(
  rawBody: string | Uint8Array,
  headers: WebhookHeaders,
  secrets: WebhookSecrets,
  options: WebhookVerifyOptions = {},
): WebhookEvent {
  verify(rawBody, headers, secrets, options)

  const text = typeof rawBody === 'string' ? rawBody : bytes(rawBody).toString('utf8')
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch (error) {
    throw new SignatureVerificationError('Invalid webhook payload', { cause: error })
  }
  const data = record(payload)
  if (data === null) throw new SignatureVerificationError('Invalid webhook payload')
  return parseWebhookEvent(data)
}

/**
 * Checks `webhook-signature` = `v1,` + base64(HMAC-SHA256(key, id.timestamp.body)) against every secret, where
 * the key is the base64-decoded secret without the `whsec_` prefix. During a rotation dpay sends two
 * signatures separated by a space - one match is enough; entries of other versions are skipped.
 * Throws `SignatureVerificationError`, or `DPayValueError` when a secret is not a valid `whsec_` value.
 */
function verify(
  rawBody: string | Uint8Array,
  headers: WebhookHeaders,
  secrets: WebhookSecrets,
  options: WebhookVerifyOptions = {},
): void {
  if (typeof rawBody !== 'string' && !(rawBody instanceof Uint8Array)) {
    throw new DPayValueError(
      'Pass the raw webhook body (string or Buffer), not parsed JSON - for example mount the route with ' +
        "express.raw({ type: 'application/json' }) before express.json().",
    )
  }
  const id = readHeader(headers, 'webhook-id')
  const timestamp = readHeader(headers, 'webhook-timestamp')
  const signatureHeader = readHeader(headers, 'webhook-signature')
  if (id === null || timestamp === null || signatureHeader === null) {
    throw new SignatureVerificationError('Missing webhook-id, webhook-timestamp or webhook-signature header')
  }
  if (!DIGITS.test(timestamp)) throw new SignatureVerificationError('Invalid webhook-timestamp header')

  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new DPayValueError('Option "toleranceSeconds" must be a non-negative number of seconds')
  }
  const now = options.now ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - Number(timestamp)) > tolerance) {
    throw new SignatureVerificationError('Webhook timestamp is outside the tolerance zone')
  }

  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : bytes(rawBody)
  const secretList: readonly unknown[] = Array.isArray(secrets) ? secrets : [secrets]
  const expected = secretList.map((secret) =>
    Buffer.from(
      createHmac('sha256', secretKey(secret))
        .update(`${id}.${timestamp}.`, 'utf8')
        .update(body)
        .digest('base64'),
      'utf8',
    ),
  )

  for (const entry of signatureHeader.split(WHITESPACE)) {
    const comma = entry.indexOf(',')
    if (comma === -1 || entry.slice(0, comma) !== 'v1') continue
    const provided = Buffer.from(entry.slice(comma + 1), 'utf8')
    for (const candidate of expected) {
      if (candidate.length === provided.length && timingSafeEqual(candidate, provided)) return
    }
  }

  throw new SignatureVerificationError('No valid webhook signature found')
}

/** HMAC key: the base64-decoded secret, with or without the `whsec_` prefix. */
function secretKey(secret: unknown): Buffer {
  if (typeof secret === 'string') {
    const encoded = secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret
    const key = decodeStrictBase64(encoded)
    if (key !== null && key.length > 0) return key
  }
  throw new DPayValueError('Webhook secret must be the whsec_ value from the dpay panel')
}

/** PHP `base64_decode($text, true)`: standard alphabet only, whitespace skipped, padding checked. */
function decodeStrictBase64(text: string): Buffer | null {
  const match = BASE64.exec(text.replace(BASE64_SKIPPED, ''))
  if (match === null) return null
  const data = match[1] as string
  const padding = (match[2] as string).length
  if (data.length % 4 === 1) return null
  if (padding > 0 && (padding > 2 || (data.length + padding) % 4 !== 0)) return null
  return Buffer.from(data, 'base64')
}

function readHeader(headers: WebhookHeaders, name: string): string | null {
  if (typeof headers !== 'object' || headers === null) return null
  if (typeof headers.get === 'function') {
    const value = (headers as { get(name: string): string | null }).get(name)
    return typeof value === 'string' && value !== '' ? value : null
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== name) continue
    const first: unknown = Array.isArray(value) ? value[0] : value
    return typeof first === 'string' && first !== '' ? first : null
  }
  return null
}

function bytes(data: Uint8Array): Buffer {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
}

/**
 * Verifies dpay webhooks (Standard Webhooks): `constructEvent()` checks the signature and returns the event,
 * `verify()` only checks. Both read the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers.
 */
export const WebhookVerifier = Object.freeze({
  /** Default `toleranceSeconds`: 5 minutes. */
  DEFAULT_TOLERANCE,
  constructEvent,
  verify,
})
