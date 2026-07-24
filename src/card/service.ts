import type { RequestOptions } from '../config.js'
import type { ApiRequestor } from '../internal/requestor.js'
import type { Money } from '../money.js'
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
import type { ApplePayParams, CardPaymentParams, GooglePayParams } from './params.js'

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

  /** Captures a pre-authorization. Omit `amount` to capture in full. */
  async capture(
    transactionId: string,
    params?: { amount?: Money },
    options?: RequestOptions,
  ): Promise<CardPaymentResult> {
    return this.api.execute(captureOperation(transactionId, params?.amount), options)
  }

  /** Cancels a pre-authorization. Omit `amount` to cancel in full. */
  async cancel(
    transactionId: string,
    params?: { amount?: Money },
    options?: RequestOptions,
  ): Promise<CardPaymentResult> {
    return this.api.execute(cancelOperation(transactionId, params?.amount), options)
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
