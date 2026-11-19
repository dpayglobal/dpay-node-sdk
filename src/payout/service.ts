import type { RequestOptions } from '../config.js'
import type { ApiRequestor } from '../internal/requestor.js'
import type { PayoutDetails, PayoutListItem, PayoutPage, PayoutSettlement } from './models.js'
import {
  type ListPayoutsParams,
  type PayoutDetailsFullParams,
  type PayoutDetailsParams,
  type PayoutFilters,
  listPayoutsOperation,
  payoutDetailsFullOperation,
  payoutDetailsOperation,
} from './ops.js'

/**
 * Payouts (withdrawals) of your account. Every endpoint signs the body in the order it is sent:
 * sha256(value1|value2|...|secretHash) - optional fields are sent only when set.
 */
export class PayoutService {
  private readonly api: ApiRequestor

  constructor(api: ApiRequestor) {
    this.api = api
  }

  /** Reads the state of a single payout. */
  async details(params: PayoutDetailsParams, options?: RequestOptions): Promise<PayoutDetails> {
    return this.api.execute(payoutDetailsOperation(this.api.service, this.api.checksum, params), options)
  }

  /**
   * Your payouts, newest first - the source of `withdrawId`. Filters: creation date range (`dateFrom`, `dateTo`,
   * strings sent trimmed like every string of a panel request), `state` (`PayoutState`, integer), `type`
   * (`PayoutType`, string); `perPage` 1-200. A value of another type, an unknown filter or a blank date throws
   * `DPayValueError`.
   */
  async list(params: ListPayoutsParams = {}, options?: RequestOptions): Promise<PayoutPage> {
    return this.api.execute(listPayoutsOperation(this.api.service, this.api.checksum, params), options)
  }

  /**
   * Iterates over all matching payouts page by page, newest first (the page number is always sent).
   *
   * ```js
   * for await (const payout of dpay.payouts.iterate({ state: PayoutState.PROCESSED })) { ... }
   * ```
   */
  async *iterate(params: PayoutFilters = {}, options?: RequestOptions): AsyncGenerator<PayoutListItem, void> {
    for (let page = 1; ; page++) {
      const result = await this.list({ ...params, page }, options)
      yield* result.items
      if (!result.hasMore) return
    }
  }

  /**
   * The payout with the payments it settles: header, totals of the whole settlement and one page of positions
   * (`perPage` 1-500).
   */
  async detailsFull(params: PayoutDetailsFullParams, options?: RequestOptions): Promise<PayoutSettlement> {
    return this.api.execute(payoutDetailsFullOperation(this.api.service, this.api.checksum, params), options)
  }
}
