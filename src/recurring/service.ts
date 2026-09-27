import type { RequestOptions } from '../config.js'
import type { ApiRequestor } from '../internal/requestor.js'
import type { RecurringAliasStatus } from './enums.js'
import type { RecurringRetryResult, RecurringStatus } from './models.js'
import {
  type RecurringCancelParams,
  recurringCancelOperation,
  recurringRetryOperation,
  recurringStatusOperation,
} from './ops.js'

/**
 * Recurring payments shared by payment methods (today BLIK). Registration and charges go through
 * `payments.register()` with `recurringRegistration` and `recurringAlias`.
 */
export class RecurringService {
  private readonly api: ApiRequestor

  constructor(api: ApiRequestor) {
    this.api = api
  }

  /** Current status and terms of the recurring payment registered for this service. */
  async status(alias: string, options?: RequestOptions): Promise<RecurringStatus> {
    return this.api.execute(recurringStatusOperation(this.api.service, this.api.checksum, alias), options)
  }

  /**
   * Retries a declined recurring charge (up to 3 times within 5 minutes, only after declines the customer can
   * fix, for example `INSUFFICIENT_FUNDS`). Not retryable: `InvalidRequestError` with the reason in
   * `fieldErrors.retry` (for example `DECLINE_NOT_RETRYABLE`, `RETRY_LIMIT_REACHED`).
   *
   * @param transactionId `transactionId` of the declined charge
   */
  async retry(transactionId: string, options?: RequestOptions): Promise<RecurringRetryResult> {
    return this.api.execute(
      recurringRetryOperation(this.api.service, this.api.checksum, transactionId),
      options,
    )
  }

  /**
   * Cancels the recurring payment (for BLIK: unregisters the alias at BLIK); later charges with the alias are
   * rejected. Resolves to the new status, `UNREGISTERED`.
   */
  async cancel(
    alias: string,
    params: RecurringCancelParams = {},
    options?: RequestOptions,
  ): Promise<RecurringAliasStatus | (string & {})> {
    return this.api.execute(
      recurringCancelOperation(this.api.service, this.api.checksum, alias, params),
      options,
    )
  }
}
