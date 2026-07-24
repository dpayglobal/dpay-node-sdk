import type { RequestOptions } from '../config.js'
import type { ApiRequestor } from '../internal/requestor.js'
import type { PayoutDetails } from './models.js'
import { type PayoutDetailsParams, payoutDetailsOperation } from './ops.js'

/** Reads the state of payouts (withdrawals) from a dpay merchant balance. */
export class PayoutService {
  private readonly api: ApiRequestor

  constructor(api: ApiRequestor) {
    this.api = api
  }

  /** Reads the state of a single payout. */
  async details(params: PayoutDetailsParams, options?: RequestOptions): Promise<PayoutDetails> {
    return this.api.execute(payoutDetailsOperation(this.api.service, this.api.checksum, params), options)
  }
}
