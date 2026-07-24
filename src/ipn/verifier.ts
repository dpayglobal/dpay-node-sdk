import { createHash, timingSafeEqual } from 'node:crypto'
import { SignatureVerificationError } from '../errors.js'
import { isNumeric, isScalar, phpStrval } from '../internal/php.js'
import { type IpnEvent, IpnType, buildIpnEvent } from './event.js'

const REQUIRED = ['id', 'amount', 'type', 'attempt', 'version', 'signature']

/**
 * Parses and verifies an IPN body. Always pass the exact bytes dpay sent -
 * a re-serialized JSON object will not verify.
 */
export function constructIpnEvent(rawBody: string | Uint8Array, secretHash: string): IpnEvent {
  const text = typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody).toString('utf8')

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch (error) {
    throw new SignatureVerificationError('Invalid IPN payload', { cause: error })
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new SignatureVerificationError('Invalid IPN payload')
  }

  const raw = payload as Record<string, unknown>
  for (const field of REQUIRED) {
    if (raw[field] === undefined || raw[field] === null) {
      throw new SignatureVerificationError('Invalid IPN payload')
    }
  }
  if (typeof raw.signature !== 'string') throw new SignatureVerificationError('Invalid IPN payload')

  const expected = expectedSignature(raw, secretHash)
  const provided = Buffer.from(raw.signature, 'utf8')
  const wanted = Buffer.from(expected, 'utf8')
  if (provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) {
    throw new SignatureVerificationError('Invalid IPN signature')
  }

  return buildIpnEvent(raw)
}

function expectedSignature(raw: Record<string, unknown>, secretHash: string): string {
  const type = isScalar(raw.type) ? phpStrval(raw.type) : ''
  const parts = [
    isScalar(raw.id) ? phpStrval(raw.id) : '',
    secretHash,
    isScalar(raw.amount) ? phpStrval(raw.amount) : '',
  ]
  if (type !== IpnType.DCB) parts.push(isScalar(raw.email) ? phpStrval(raw.email) : '')
  parts.push(type)
  parts.push(isNumeric(raw.attempt) ? phpStrval(raw.attempt) : '0')
  parts.push(isNumeric(raw.version) ? phpStrval(raw.version) : '0')
  parts.push(isScalar(raw.custom) ? phpStrval(raw.custom) : '')
  return createHash('sha256').update(parts.join(''), 'utf8').digest('hex')
}
