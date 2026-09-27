import { describe, expect, it } from 'vitest'
import { Config } from '../../src/config.js'
import { ApiRequestor } from '../../src/internal/requestor.js'
import { Money } from '../../src/money.js'
import { RefundService } from '../../src/refund/service.js'
import { MockHttpClient } from '../../src/testing.js'
import { WebhookTarget } from '../../src/webhook/target.js'

const build = (): { transport: MockHttpClient; refunds: RefundService } => {
  const transport = new MockHttpClient()
  const config = Config.fromOptions({
    service: 'sdk-test-service',
    secretHash: 'sdk-test-hash-0001',
    httpClient: transport,
  })
  return { transport, refunds: new RefundService(new ApiRequestor(config, transport)) }
}

describe('refund webhook', () => {
  it('hashes the webhook values in the order sent', async () => {
    const { transport, refunds } = build()
    transport.queueJson(200, {
      status: 'success',
      refund: true,
      message: 'dpay.pl A75AEBB4-4B89-4834-AD43-EF442C133769',
    })

    await refunds.create({
      transactionId: 'A75AEBB4-4B89-4834-AD43-EF442C133769',
      amount: Money.pln(1500),
      reason: 'Zwrot',
      webhook: WebhookTarget.create('https://shop.example/webhooks/refunds', [
        'refund.succeeded',
        'refund.failed',
      ]),
    })

    const body = transport.lastRequestBody
    expect(Object.keys(body)).toEqual(['service', 'transaction_id', 'value', 'reason', 'webhook', 'checksum'])
    expect(body.value).toBe('15.00')
    // ...|15.00|Zwrot|https://shop.example/webhooks/refunds|refund.succeeded|refund.failed|hash
    expect(body.checksum).toBe('53620f0ea6b46723866a46f2f0059c79cbe080e59d4f134508546be3fa08dacf')
  })

  it('accepts only refund events', async () => {
    const { transport, refunds } = build()
    await expect(
      refunds.create({
        transactionId: 'TX',
        webhook: WebhookTarget.create('https://shop.example/webhooks', ['payment.succeeded']),
      }),
    ).rejects.toThrow('Event "payment.succeeded" is not allowed in the webhook object of a refund')
    expect(transport.requests).toHaveLength(0)
  })

  it('is not sent when checking the availability', async () => {
    const { transport, refunds } = build()
    transport.queueJson(200, { status: 'success', refund: true, message: 'Refund available' })
    await refunds.checkAvailability({
      transactionId: 'A75AEBB4-4B89-4834-AD43-EF442C133769',
      webhook: WebhookTarget.create('https://shop.example/webhooks'),
    } as never)
    expect(Object.keys(transport.lastRequestBody)).toEqual(['service', 'transaction_id', 'checksum'])
    // shared vector refund_full
    expect(transport.lastRequestBody.checksum).toBe(
      'dbae59367823ac7e27dcb76ab1e093eedb5b352dc1dd122036dba0f7a2642d5c',
    )
  })
})
