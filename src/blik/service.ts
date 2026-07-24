import type { RequestOptions } from '../config.js'
import type { ApiRequestor } from '../internal/requestor.js'
import type { BlikAlias, BlikRecurringStatus } from './models.js'
import {
  type BlikAliasParams,
  type BlikUnregisterAliasParams,
  aliasOperation,
  recurringStatusOperation,
  unregisterAliasOperation,
} from './ops.js'

/** Registers, reads and unregisters BLIK aliases, and reads recurring mandate status. */
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

  /** Reads the state of a recurring BLIK mandate. */
  async recurringStatus(
    params: { aliasValue: string },
    options?: RequestOptions,
  ): Promise<BlikRecurringStatus> {
    return this.api.execute(recurringStatusOperation(this.api.service, this.api.checksum, params), options)
  }
}
