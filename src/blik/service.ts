import type { RequestOptions } from '../config.js'
import type { ApiRequestor } from '../internal/requestor.js'
import type { BlikAlias } from './models.js'
import {
  type BlikAliasParams,
  type BlikUnregisterAliasParams,
  aliasOperation,
  unregisterAliasOperation,
} from './ops.js'

/**
 * Reads and unregisters BLIK OneClick aliases (`UID`). Recurring payments (PAYID) are handled by
 * `dpay.recurring`.
 */
export class BlikService {
  private readonly api: ApiRequestor

  constructor(api: ApiRequestor) {
    this.api = api
  }

  /** Registers a BLIK alias so the payer can pay without a code next time. */
  async alias(params: BlikAliasParams, options?: RequestOptions): Promise<BlikAlias> {
    return this.api.execute(aliasOperation(this.api.service, this.api.checksum, params), options)
  }

  /** Removes a BLIK alias. */
  async unregisterAlias(params: BlikUnregisterAliasParams, options?: RequestOptions): Promise<void> {
    return this.api.execute(unregisterAliasOperation(this.api.service, this.api.checksum, params), options)
  }
}
