import { describe, expect, it } from 'vitest'
import { DPayValueError } from '../../src/errors.js'
import { Money } from '../../src/money.js'
import { PayoutFeeMode, TransactionType, assertTransactionType } from '../../src/payment/enums.js'
import {
  serializeDeviceInfo,
  serializeInvoice,
  serializePayoutInstruction,
} from '../../src/payment/params.js'
import type { DeviceInfoParams } from '../../src/payment/params.js'

const device: DeviceInfoParams = {
  browserAcceptHeader: 'text/html',
  browserLanguage: 'pl-PL',
  browserColorDepth: 24,
  browserScreenHeight: 1080,
  browserScreenWidth: 1920,
  browserTz: -60,
  browserUserAgent: 'Mozilla/5.0',
  systemFamily: 'Windows',
  geoLocalization: '52.2297,21.0122',
  deviceId: 'device-abc',
  applicationName: 'Sklep Testowy',
  browserJavaEnabled: true,
}

describe('enums', () => {
  it('exposes values as constants and accepts bare strings', () => {
    expect(TransactionType.TRANSFERS).toBe('transfers')
    expect(PayoutFeeMode.GROSS).toBe('gross')
    expect(() => assertTransactionType('transfers')).not.toThrow()
    expect(() => assertTransactionType('nope')).toThrow('Invalid transaction type "nope"')
    expect(() => assertTransactionType('nope')).toThrow(DPayValueError)
  })
})

describe('serializeDeviceInfo', () => {
  it('emits the wire key order with deviceID uppercased', () => {
    expect(Object.keys(serializeDeviceInfo(device))).toEqual([
      'browserAcceptHeader',
      'browserLanguage',
      'browserColorDepth',
      'browserScreenHeight',
      'browserScreenWidth',
      'browserTZ',
      'browserUserAgent',
      'systemFamily',
      'geoLocalization',
      'deviceID',
      'applicationName',
      'browserJavaEnabled',
    ])
  })

  it('sends browserJavaEnabled as a string, not a boolean', () => {
    expect(serializeDeviceInfo(device).browserJavaEnabled).toBe('true')
    expect(serializeDeviceInfo({ ...device, browserJavaEnabled: false }).browserJavaEnabled).toBe('false')
    expect(serializeDeviceInfo({ ...device, browserJavaEnabled: undefined })).not.toHaveProperty(
      'browserJavaEnabled',
    )
  })

  it('validates the length limits', () => {
    expect(() => serializeDeviceInfo({ ...device, deviceId: '' })).toThrow(
      'Device ID must be 1-64 characters',
    )
    expect(() => serializeDeviceInfo({ ...device, deviceId: 'x'.repeat(65) })).toThrow(DPayValueError)
    expect(() => serializeDeviceInfo({ ...device, applicationName: '' })).toThrow(
      'Application name must be 1-64 characters',
    )
  })
})

describe('serializeInvoice', () => {
  it('emits vat_amount in minor units and keeps the wire key order', () => {
    const invoice = serializeInvoice({
      payerNip: '1234563218',
      payerName: 'Firma sp. z o.o.',
      invoiceNumber: 'FV/2026/07/1',
      paymentDueDate: '2026-08-15',
      vatAmount: Money.pln(560),
    })
    expect(Object.keys(invoice)).toEqual([
      'payer_nip',
      'payer_name',
      'invoice_number',
      'payment_due_date',
      'vat_amount',
    ])
    expect(invoice.vat_amount).toBe(560)
  })

  it('omits absent fields and validates the due date', () => {
    expect(serializeInvoice({})).toEqual({})
    expect(() => serializeInvoice({ paymentDueDate: '15-08-2026' })).toThrow(
      'Payment due date must be in YYYY-MM-DD format',
    )
  })
})

describe('serializePayoutInstruction', () => {
  it('emits fee_mode then positions, with amounts as numbers', () => {
    const payout = serializePayoutInstruction({
      positions: [{ iban: 'PL61109010140000071219812874', title: 'Wypłata 1', amount: Money.pln(1050) }],
      feeMode: PayoutFeeMode.GROSS,
    })
    expect(payout).toEqual({
      fee_mode: 'gross',
      positions: [{ iban: 'PL61109010140000071219812874', title: 'Wypłata 1', amount: 10.5 }],
    })
  })

  it('defaults the fee mode to net', () => {
    const payout = serializePayoutInstruction({
      positions: [{ iban: 'PL61', title: 't', amount: Money.pln(1) }],
    })
    expect(payout.fee_mode).toBe('net')
  })

  it('validates positions', () => {
    expect(() => serializePayoutInstruction({ positions: [] })).toThrow(
      'Payout instruction requires at least one position',
    )
    expect(() =>
      serializePayoutInstruction({ positions: [{ iban: '', title: 't', amount: Money.pln(1) }] }),
    ).toThrow('Payout IBAN must not be empty')
    expect(() =>
      serializePayoutInstruction({ positions: [{ iban: 'PL61', title: '', amount: Money.pln(1) }] }),
    ).toThrow('Payout title must be 1-255 characters')
    expect(() =>
      serializePayoutInstruction({
        positions: [{ iban: 'PL61', title: 't', amount: Money.pln(1) }],
        feeMode: 'nope',
      }),
    ).toThrow('Invalid payout fee mode "nope"')
  })
})
