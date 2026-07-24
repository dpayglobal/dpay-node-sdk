import { BankService } from './bank/service.js'
import { BlikService } from './blik/service.js'
import { CardService } from './card/service.js'
import { Config } from './config.js'
import type { DPayClientOptions } from './config.js'
import { FetchHttpClient } from './http/fetch-client.js'
import { ApiRequestor } from './internal/requestor.js'
import { IpnService } from './ipn/service.js'
import { PaymentService } from './payment/service.js'
import { PayoutService } from './payout/service.js'
import { RefundService } from './refund/service.js'
import { SDK_VERSION } from './version.js'

/** Entry point of the SDK. One instance per payment point. */
export class DPayClient {
  /** Version of this SDK. */
  readonly VERSION = SDK_VERSION
  /** Register payments and read transaction state. */
  readonly payments: PaymentService
  /** Refund transactions and check refund availability. */
  readonly refunds: RefundService
  /** List banks available on the payment page. */
  readonly banks: BankService
  /** Register, unregister and inspect BLIK aliases. */
  readonly blik: BlikService
  /** Server-to-server card payments, wallets and pre-authorizations. */
  readonly cards: CardService
  /** Read the state of payouts. */
  readonly payouts: PayoutService
  /** Verify incoming IPN notifications. */
  readonly ipn: IpnService

  /**
   * Validates `options` eagerly - before any network call - and mounts every service on
   * top of a shared transport. Defaults to `FetchHttpClient` when `options.httpClient` is
   * not given.
   */
  constructor(options: DPayClientOptions) {
    const config = Config.fromOptions(options)
    const transport = config.httpClient ?? new FetchHttpClient()
    const api = new ApiRequestor(config, transport)

    this.payments = new PaymentService(api)
    this.refunds = new RefundService(api)
    this.banks = new BankService(api)
    this.blik = new BlikService(api)
    this.cards = new CardService(api)
    this.payouts = new PayoutService(api)
    this.ipn = new IpnService(config)
  }
}
