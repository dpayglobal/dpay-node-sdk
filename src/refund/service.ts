import type { RequestOptions } from '../config.js'
import type { ApiRequestor } from '../internal/requestor.js'
import type { Refund, RefundAvailability } from './models.js'
import {
  type CreateRefundParams,
  type RefundParams,
  checkAvailabilityOperation,
  createRefundOperation,
} from './ops.js'

/** Refunds transactions and checks whether a refund would be accepted before performing it. */
export class RefundService {
  private readonly api: ApiRequestor

  constructor(api: ApiRequestor) {
    this.api = api
  }

  /**
   * Orders a refund of a transaction in full, or partially when `amount` is given. A successful response means
   * the refund was accepted - its outcome comes as a `refund.succeeded` / `refund.failed` event.
   */
  async create(params: CreateRefundParams, options?: RequestOptions): Promise<Refund> {
    return this.api.execute(createRefundOperation(this.api.service, this.api.checksum, params), options)
  }

  /**
   * Checks whether a refund would be accepted, without performing it.
   * Refusal arrives as a 4xx status carrying an outcome body, not as an error.
   */
  async checkAvailability(params: RefundParams, options?: RequestOptions): Promise<RefundAvailability> {
    return this.api.execute(checkAvailabilityOperation(this.api.service, this.api.checksum, params), options)
  }
}
