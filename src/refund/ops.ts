import { DPayValueError } from '../errors.js'
import type { ApiResponse } from '../http/types.js'
import { PANEL } from '../internal/base-urls.js'
import type { ChecksumCalculator } from '../internal/checksum.js'
import { mapError } from '../internal/error-mapper.js'
import { type Operation, decodeRecordOrFail } from '../internal/operation.js'
import { phpTrim } from '../internal/php.js'
import type { Money } from '../money.js'
import { WebhookEventType } from '../webhook/event-type.js'
import { type WebhookTarget, serializeWebhookTarget } from '../webhook/target.js'
import { type Refund, type RefundAvailability, parseRefund, parseRefundAvailability } from './models.js'

/** Request header with your own refund identifier; it sets the refund transfer title. */
export const REFUND_MESSAGE_ID_HEADER = 'DigitalPayments-PSP-Message-ID'

const PRINTABLE_ASCII = /^[\x20-\x7E]+$/

export interface RefundParams {
  transactionId: string
  /** Partial refund; without it the rest of the payment is refunded. */
  amount?: Money
  reason?: string
}

/** `refunds.create()` parameters. */
export interface CreateRefundParams extends RefundParams {
  /**
   * Sends the `refund.succeeded` / `refund.failed` events of this refund to this URL (refund events only).
   * Part of the checksum.
   */
  webhook?: WebhookTarget
  /**
   * Your own refund identifier, sent in the `DigitalPayments-PSP-Message-ID` header (not part of the checksum):
   * the refund transfer title becomes `dpay.pl zwrot {messageId}` and `Refund.message` returns it. Printable
   * ASCII; the API keeps the first 24 characters.
   */
  messageId?: string
}

function signedBody(
  service: string,
  checksum: ChecksumCalculator,
  params: RefundParams,
  webhook?: WebhookTarget,
): Record<string, unknown> {
  const body: Record<string, unknown> = { service, transaction_id: params.transactionId }
  if (params.amount !== undefined) body.value = params.amount.toDecimal()
  if (params.reason !== undefined) body.reason = params.reason
  if (webhook !== undefined)
    body.webhook = serializeWebhookTarget(webhook, WebhookEventType.REFUND, 'a refund')
  // The whole body in wire order, the webhook object flattened: ...|url|event1|event2|hash
  body.checksum = checksum.orderedBody(body)
  return body
}

export function createRefundOperation(
  service: string,
  checksum: ChecksumCalculator,
  params: CreateRefundParams,
): Operation<Refund> {
  const headers: Record<string, string> = {}
  if (params.messageId !== undefined) {
    const messageId: unknown = params.messageId
    if (typeof messageId !== 'string' || !PRINTABLE_ASCII.test(messageId) || phpTrim(messageId) === '') {
      throw new DPayValueError('Refund message ID must be non-empty printable ASCII')
    }
    headers[REFUND_MESSAGE_ID_HEADER] = messageId
  }
  return {
    method: 'POST',
    host: PANEL,
    path: '/api/v1/pbl/refund',
    body: signedBody(service, checksum, params, params.webhook),
    headers,
    parse: (response) => parseRefund(decodeRecordOrFail(response)),
  }
}

export function checkAvailabilityOperation(
  service: string,
  checksum: ChecksumCalculator,
  params: RefundParams,
): Operation<RefundAvailability> {
  return {
    method: 'POST',
    host: PANEL,
    path: '/api/v1/pbl/check-refund-availability',
    body: signedBody(service, checksum, params),
    raiseForStatus: false,
    parse: parseAvailability,
  }
}

function parseAvailability(response: ApiResponse): RefundAvailability {
  const json = response.decodeJson()
  if (typeof json === 'object' && json !== null && !Array.isArray(json)) {
    const data = json as Record<string, unknown>
    if (Object.hasOwn(data, 'refund') && isOutcome(response.status, data)) {
      return parseRefundAvailability(data, response.status)
    }
  }
  throw mapError(response)
}

/**
 * Every answer with the `refund` key is an availability answer: HTTP 200 and any 4xx business refusal (400, 402,
 * 404, 406, 409, 410, 411, 423...), a 401 only when it is not the checksum error "Unauthorized request".
 */
function isOutcome(status: number, data: Record<string, unknown>): boolean {
  if (status === 401) return data.message !== 'Unauthorized request'
  return status === 200 || (status >= 400 && status < 500)
}
