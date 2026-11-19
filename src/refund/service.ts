import type { RequestOptions } from '../config.js'
import type { ApiRequestor } from '../internal/requestor.js'
import type { Refund, RefundAvailability } from './models.js'
import {
  type CreateRefundParams,
  REFUND_MESSAGE_ID_HEADER,
  type RefundParams,
  checkAvailabilityOperation,
  createRefundOperation,
} from './ops.js'

/** Refunds transactions and checks whether a refund would be accepted before performing it. */
export class RefundService {
  /** Request header with your own refund identifier (`messageId`); it sets the refund transfer title. */
  static readonly MESSAGE_ID_HEADER = REFUND_MESSAGE_ID_HEADER

  private readonly api: ApiRequestor

  constructor(api: ApiRequestor) {
    this.api = api
  }

  /**
   * Orders a refund of a transaction in full, or partially when `amount` is given. A successful response means
   * the refund was accepted - its outcome comes as a `refund.succeeded` / `refund.failed` event. `messageId` goes
   * to the `DigitalPayments-PSP-Message-ID` header and sets the transfer title `dpay.pl zwrot {messageId}`.
   */
  async create(params: CreateRefundParams, options?: RequestOptions): Promise<Refund> {
    return this.api.execute(createRefundOperation(this.api.service, this.api.checksum, params), options)
  }

  /**
   * Checks whether a refund would be accepted, without performing it. Every answer that carries the `refund` key -
   * HTTP 200 and the business refusals 400, 402, 404 (transaction does not exist), 406, 409, 410, 411, 423 and a
   * business 401 - is returned as `RefundAvailability` (`httpStatus` tells the reason apart). An invalid checksum
   * (401 "Unauthorized request"), validation errors (422), rate limits and server errors throw.
   */
  async checkAvailability(params: RefundParams, options?: RequestOptions): Promise<RefundAvailability> {
    return this.api.execute(checkAvailabilityOperation(this.api.service, this.api.checksum, params), options)
  }
}
