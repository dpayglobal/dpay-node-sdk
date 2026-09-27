import type { RequestOptions } from '../config.js'
import type { ApiRequestor } from '../internal/requestor.js'
import type { CardPaymentResult } from './models.js'
import {
  applePayOperation,
  cancelOperation,
  captureOperation,
  googlePayOperation,
  payOtpOperation,
  preAuthOperation,
  publicKeyOperation,
} from './ops.js'
import type {
  ApplePayParams,
  CardCancelParams,
  CardCaptureParams,
  CardPaymentParams,
  GooglePayParams,
} from './params.js'

/** Charges, authorizes, captures and cancels card payments, including Google Pay and Apple Pay wallets. */
export class CardService {
  private readonly api: ApiRequestor

  constructor(api: ApiRequestor) {
    this.api = api
  }

  /** Current RSA public key. dpay rotates it, so fetch it before every attempt. */
  async publicKey(options?: RequestOptions): Promise<string> {
    return this.api.execute(publicKeyOperation(), options)
  }

  /** Charges a card immediately. */
  async payOtp(
    transactionId: string,
    params: CardPaymentParams,
    options?: RequestOptions,
  ): Promise<CardPaymentResult> {
    return this.api.execute(payOtpOperation(transactionId, params), options)
  }

  /** Authorizes a card without capturing the funds. */
  async preAuth(
    transactionId: string,
    params: CardPaymentParams,
    options?: RequestOptions,
  ): Promise<CardPaymentResult> {
    return this.api.execute(preAuthOperation(transactionId, params), options)
  }

  /**
   * Captures a pre-authorized amount (partial captures allowed up to the authorization). Signed with
   * sha256(capture|service|transaction_id|amount|hash); the optional webhook receives `payment.captured`.
   */
  async capture(
    transactionId: string,
    params: CardCaptureParams,
    options?: RequestOptions,
  ): Promise<CardPaymentResult> {
    return this.api.execute(
      captureOperation(this.api.service, this.api.checksum, transactionId, params),
      options,
    )
  }

  /**
   * Cancels a pre-authorization; omit `amount` to cancel the whole uncaptured remainder. Signed with
   * sha256(cancellation|service|transaction_id|amount|hash).
   */
  async cancel(
    transactionId: string,
    params: CardCancelParams = {},
    options?: RequestOptions,
  ): Promise<CardPaymentResult> {
    return this.api.execute(
      cancelOperation(this.api.service, this.api.checksum, transactionId, params),
      options,
    )
  }

  /** Pays with a Google Pay token. */
  async googlePay(
    transactionId: string,
    params: GooglePayParams,
    options?: RequestOptions,
  ): Promise<CardPaymentResult> {
    return this.api.execute(googlePayOperation(transactionId, params), options)
  }

  /** Initialises an Apple Pay session, or pays when `token` is given. */
  async applePay(
    transactionId: string,
    params: ApplePayParams,
    options?: RequestOptions,
  ): Promise<CardPaymentResult> {
    return this.api.execute(applePayOperation(transactionId, params), options)
  }
}
