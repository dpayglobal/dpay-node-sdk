import { createHash } from 'node:crypto'
import { isScalar, phpStrval } from './php.js'

export class ChecksumCalculator {
  private readonly secretHash: string

  constructor(secretHash: string) {
    this.secretHash = secretHash
  }

  /**
   * sha256(service|secretHash|field1|field2|...) - payment registration, BLIK aliases, recurring payments
   * and the Events API.
   */
  secretSecond(service: string, fields: readonly unknown[]): string {
    const parts = [service, this.secretHash, ...fields.map(phpStrval)]
    return sha256(parts.join('|'))
  }

  /**
   * sha256(value1|value2|...|secretHash) over the request body in the order it is sent (PBL API: refunds,
   * transaction details, banks, payouts). Takes the whole body: the `checksum` key is skipped, nested objects
   * (e.g. `webhook`) contribute their leaf values in order, `null` and `false` give an empty segment and `true`
   * gives `1` - the way the API casts the decoded JSON values to strings.
   *
   * Hash exactly the object you send: its key order is the wire order (JavaScript keeps the insertion order of
   * non-numeric keys). Properties holding `undefined` are skipped, the way `JSON.stringify` drops them.
   */
  orderedBody(body: Readonly<Record<string, unknown>> | readonly unknown[]): string {
    const parts: string[] = []
    for (const [key, value] of Object.entries(body)) {
      if (key === 'checksum' || value === undefined) continue
      collectLeaves(value, parts)
    }
    return sha256(`${parts.join('|')}|${this.secretHash}`)
  }

  /**
   * sha256(operation|service|transactionId|amount|secretHash) - Cards API capture and cancellation. The operation
   * name keeps a capture checksum from authorising a cancellation; without an amount the segment stays empty.
   */
  operation(operation: string, service: string, transactionId: string, amount: string | null): string {
    return sha256([operation, service, transactionId, amount ?? '', this.secretHash].join('|'))
  }
}

/** PHP `array_walk_recursive` over a decoded JSON value: the leaves in order, containers flattened. */
function collectLeaves(value: unknown, parts: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectLeaves(item, parts)
    return
  }
  if (typeof value === 'object' && value !== null) {
    for (const nested of Object.values(value)) {
      if (nested !== undefined) collectLeaves(nested, parts)
    }
    return
  }
  parts.push(isScalar(value) ? phpStrval(value) : '')
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}
