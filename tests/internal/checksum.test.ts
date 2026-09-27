import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ChecksumCalculator } from '../../src/internal/checksum.js'

const SERVICE = 'test_service'
const SECRET = 'sekret-hash-123'
const checksum = new ChecksumCalculator(SECRET)
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

describe('ChecksumCalculator', () => {
  it('matches the checksums golden vector from the PHP SDK', () => {
    expect(checksum.secretSecond(SERVICE, [])).toBe(
      '6586f5a4157c687c309cf16d078887853906113c2bb78ac6fbfda75c518d2757',
    )
    expect(checksum.secretSecond(SERVICE, ['10.00', 42, 3.5, 'https://a/b'])).toBe(
      '018d8fab05798da9d03267c9696afebfe184c2d59f9975e764969dfda7256832',
    )
    expect(checksum.orderedBody([SERVICE, 'tx-1'])).toBe(
      '9508d77a17bdd44829ecc450214a3e356ca0cbe2f93c28012e3a5f6b39b4aa30',
    )
    expect(checksum.orderedBody([SERVICE, 1784700000, 4242, 10, true, false, ''])).toBe(
      '4359d364e91b56ed48ba73ebf9df951b4d5381aec76895d52a3d2803ab301421',
    )
  })

  it('is sensitive to field order, because the body key order is part of the protocol', () => {
    expect(checksum.orderedBody([SERVICE, 'tx-1'])).not.toBe(checksum.orderedBody(['tx-1', SERVICE]))
  })

  it('renders booleans the PHP way inside the digest', () => {
    expect(checksum.orderedBody([true])).toBe(checksum.orderedBody(['1']))
    expect(checksum.orderedBody([false])).toBe(checksum.orderedBody(['']))
  })

  it('produces a lowercase hex sha256 digest', () => {
    expect(checksum.orderedBody(['x'])).toMatch(/^[0-9a-f]{64}$/)
  })

  it('takes the whole body: skips checksum, flattens nested values in order, casts like PHP', () => {
    const body = {
      service: SERVICE,
      checksum: 'stale',
      value: '15.00',
      amount: 15.0,
      flag: true,
      off: false,
      none: null,
      skipped: undefined,
      webhook: { url: 'https://a.test/w', events: ['refund.succeeded', 'refund.failed'] },
      empty: [],
    }
    expect(checksum.orderedBody(body)).toBe(
      sha256(`${SERVICE}|15.00|15|1|||https://a.test/w|refund.succeeded|refund.failed|${SECRET}`),
    )
    expect(checksum.orderedBody({ service: SERVICE, transaction_id: 'tx-1' })).toBe(
      checksum.orderedBody([SERVICE, 'tx-1']),
    )
  })

  it('signs card operations with the hash at the end and an empty segment without an amount', () => {
    expect(checksum.operation('capture', SERVICE, 'tx-1', '29.99')).toBe(
      sha256(`capture|${SERVICE}|tx-1|29.99|${SECRET}`),
    )
    expect(checksum.operation('cancellation', SERVICE, 'tx-1', null)).toBe(
      sha256(`cancellation|${SERVICE}|tx-1||${SECRET}`),
    )
  })
})
