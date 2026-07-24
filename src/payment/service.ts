import type { RequestOptions } from '../config.js'
import type { ApiRequestor } from '../internal/requestor.js'
import type { RegisteredPayment, Transaction } from './models.js'
import { detailsOperation, registerOperation } from './ops.js'
import type { RegisterPaymentParams } from './register-body.js'

/** Registers dpay payments and reads their current transaction status. */
export class PaymentService {
  private readonly api: ApiRequestor

  constructor(api: ApiRequestor) {
    this.api = api
  }

  /**
   * Registers a payment and returns the redirect target.
   * Throws `PaymentRejectedError` when dpay rejects it with HTTP 200.
   */
  async register(params: RegisterPaymentParams, options?: RequestOptions): Promise<RegisteredPayment> {
    return this.api.execute(registerOperation(this.api.service, this.api.checksum, params), options)
  }

  /** Reads the current state of a transaction, including its refunds. */
  async details(transactionId: string, options?: RequestOptions): Promise<Transaction> {
    return this.api.execute(detailsOperation(this.api.service, this.api.checksum, transactionId), options)
  }
}
