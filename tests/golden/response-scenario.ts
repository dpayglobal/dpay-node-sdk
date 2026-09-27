import { readFileSync } from 'node:fs'
import { parseBank } from '../../src/bank/models.js'
import { parseBlikAlias } from '../../src/blik/models.js'
import { parseCardPaymentResult } from '../../src/card/models.js'
import type { Money } from '../../src/money.js'
import { parseRegisteredPayment, parseTransaction } from '../../src/payment/models.js'
import { parsePayoutDetails } from '../../src/payout/models.js'
import { parseRecurringRetryResult, parseRecurringStatus } from '../../src/recurring/models.js'
import { parseRefund, parseRefundAvailability } from '../../src/refund/models.js'
import { parseWebhookEvent } from '../../src/webhook/event.js'

interface Fixtures {
  registered: Array<Record<string, unknown>>
  transaction: Array<Record<string, unknown>>
  bank: Array<Record<string, unknown>>
  refund: Array<Record<string, unknown>>
  availability: Array<Record<string, unknown>>
  payout: Array<Record<string, unknown>>
  blik_alias: Array<Record<string, unknown>>
  card_result: Array<Record<string, unknown>>
  recurring_status: Array<Record<string, unknown>>
  recurring_retry: Array<Record<string, unknown>>
  webhook_event: Array<Record<string, unknown>>
}

const FIXTURES = JSON.parse(
  readFileSync(new URL('./response_fixtures.json', import.meta.url), 'utf8'),
) as Fixtures

/**
 * Mirrors the PHP SDK golden's Money shape. The golden was captured with the Python
 * port's `_money()` helper (`{minor, currency, decimal}`), not a bare decimal string, so
 * every amount in this scenario is rendered through this helper rather than `.toDecimal()`
 * alone.
 */
interface MoneyLeaf {
  minor: number
  currency: string
  decimal: string
}

function money(amount: Money | null): MoneyLeaf | null {
  if (amount === null) return null
  return { minor: amount.minor, currency: amount.currency, decimal: amount.toDecimal() }
}

export function runResponseScenario(): Record<string, unknown> {
  return {
    registered: FIXTURES.registered.map((fixture) => {
      const model = parseRegisteredPayment(fixture)
      return {
        transaction_id: model.transactionId,
        message: model.message,
        redirect_url: model.redirectUrl,
        is_paid: model.isPaid,
        is_internal_processing: model.isInternalProcessing,
        card_recurring_alias: model.cardRecurringAlias,
        ipksef: model.ipksef,
        recurring_alias: model.recurringAlias,
        recurring_methods: model.recurringMethods,
      }
    }),

    transaction: FIXTURES.transaction.map((fixture) => {
      const model = parseTransaction(fixture)
      return {
        id: model.id,
        value: money(model.value),
        status: model.status,
        is_paid: model.isPaid,
        is_settled: model.isSettled,
        is_refunded: model.isRefunded,
        refunded_amount: money(model.refundedAmount),
        available_refund_amount: money(model.availableRefundAmount),
        is_fully_refunded: model.isFullyRefunded,
        is_direct: model.isDirect,
        gateway_id: model.gatewayId,
        payment_method: model.paymentMethod,
        creation_date: model.creationDate,
        payment_date: model.paymentDate,
        payer: model.payer,
        refunds: model.refunds.map((refund) => ({
          payment_id: refund.paymentId,
          value: money(refund.value),
          status: refund.status,
          creation_date: refund.creationDate,
          payment_date: refund.paymentDate,
        })),
      }
    }),

    bank: FIXTURES.bank.map((fixture) => {
      const model = parseBank(fixture)
      return {
        id: model.id,
        name: model.name,
        image: model.image,
        on_from: model.onFrom,
        on_to: model.onTo,
        iterator: model.iterator,
        is_test: model.isTest,
        type: model.type,
      }
    }),

    refund: FIXTURES.refund.map((fixture) => {
      const model = parseRefund(fixture)
      return {
        is_accepted: model.isAccepted,
        message: model.message,
      }
    }),

    availability: FIXTURES.availability.map((fixture) => {
      const model = parseRefundAvailability(fixture, 200)
      return {
        is_available: model.isAvailable,
        message: model.message,
        http_status: model.httpStatus,
      }
    }),

    payout: FIXTURES.payout.map((fixture) => {
      const model = parsePayoutDetails(fixture)
      const receiver = model.receiver
      return {
        id: model.id,
        state: model.state,
        is_waiting: model.isWaiting,
        is_processed: model.isProcessed,
        is_failed: model.isFailed,
        net: money(model.net),
        fee: money(model.fee),
        gross: money(model.gross),
        creation_date: model.creationDate,
        is_direct_settlement: model.isDirectSettlement,
        nrb: model.nrb,
        is_declined: model.isDeclined,
        decline_reason: model.declineReason,
        decline_status: model.declineStatus,
        receiver:
          receiver === null
            ? null
            : {
                nrb: receiver.nrb,
                title: receiver.title,
                amount: money(receiver.amount),
                service: receiver.service,
                receiver_name: receiver.receiverName,
                receiver_address: receiver.receiverAddress,
              },
      }
    }),

    blik_alias: FIXTURES.blik_alias.map((fixture) => {
      const model = parseBlikAlias(fixture)
      return {
        alias_value: model.aliasValue,
        alias_type: model.aliasType,
        status: model.status,
        is_active: model.isActive,
        expiration_date: model.expirationDate,
        apps: model.apps.map((app) => ({ key: app.key, label: app.label })),
      }
    }),

    recurring_status: FIXTURES.recurring_status.map((fixture) => {
      const model = parseRecurringStatus(fixture)
      const registration = model.registration
      return {
        alias: model.alias,
        method: model.method,
        status: model.status,
        is_active: model.isActive,
        expiration_date: model.expirationDate,
        registration:
          registration === null
            ? null
            : {
                transaction_id: registration.transactionId,
                label: registration.label,
                model: registration.model,
                frequency: registration.frequency,
                limit_amt: registration.limitAmt,
                tot_limit_amt: registration.totLimitAmt,
                is_limit_amt_fixed: registration.isLimitAmtFixed,
                init_date: registration.initDate,
                terms_url: registration.termsUrl,
                terms_version: registration.termsVersion,
                registered_at: registration.registeredAt,
              },
      }
    }),

    recurring_retry: FIXTURES.recurring_retry.map((fixture) => {
      const model = parseRecurringRetryResult(fixture)
      return {
        transaction_id: model.transactionId,
        status: model.status,
        is_pending: model.isPending,
        is_failed: model.isFailed,
        count: model.count,
        error_code: model.errorCode,
        error_description: model.errorDescription,
      }
    }),

    webhook_event: FIXTURES.webhook_event.map((fixture) => {
      const model = parseWebhookEvent(fixture)
      return {
        id: model.id,
        type: model.type,
        api_version: model.apiVersion,
        created: model.created,
        livemode: model.livemode,
        service: model.service,
        merchant_ref: model.merchantRef,
        object_type: model.objectType,
        object: model.object,
      }
    }),

    card_result: FIXTURES.card_result.map((fixture) => {
      const model = parseCardPaymentResult(fixture)
      const offer = model.dccOffer
      return {
        redirect_type: model.redirectType,
        is_success: model.isSuccess,
        requires_three_ds_form: model.requiresThreeDsForm,
        requires_redirect: model.requiresRedirect,
        has_dcc_offer: model.hasDccOffer,
        three_ds_form_html: model.threeDsFormHtml,
        redirect_url: model.redirectUrl,
        dcc_offer:
          offer === null
            ? null
            : {
                currency_conversion_id: offer.currencyConversionId,
                original_amount: money(offer.originalAmount),
                converted_amount: money(offer.convertedAmount),
                exchange_rate: offer.exchangeRate,
                valid_until: offer.validUntil,
                declaration_text: offer.declarationText,
                is_european_economic_area: offer.isEuropeanEconomicArea,
                markup: offer.markup.map((item) => ({ rate: item.rate, additional_info: item.additionalInfo })),
              },
      }
    }),
  }
}
