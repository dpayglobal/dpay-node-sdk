import type { RequestOptions } from '../config.js'
import type { ApiRequestor } from '../internal/requestor.js'
import type { Bank } from './models.js'
import { allBanksOperation, forServiceOperation } from './ops.js'

/** Lists the banks dpay supports for transfer payments. */
export class BankService {
  private readonly api: ApiRequestor

  constructor(api: ApiRequestor) {
    this.api = api
  }

  /** Every bank dpay supports. */
  async all(options?: RequestOptions): Promise<Bank[]> {
    return this.api.execute(allBanksOperation(), options)
  }

  /** Banks enabled for this payment point. Defaults `timestamp` to the current clock. */
  async forService(params?: { timestamp?: number }, options?: RequestOptions): Promise<Bank[]> {
    return this.api.execute(
      forServiceOperation(this.api.service, this.api.checksum, params?.timestamp),
      options,
    )
  }
}
