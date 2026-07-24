import { describe, expect, it } from 'vitest'
import { CardRecurringFrequency, CardRecurringOperation, DccDecision } from '../../src/card/enums.js'
import { serializeCardRecurringRegistration } from '../../src/card/recurring-params.js'
import { DPayValueError } from '../../src/errors.js'
import { Money } from '../../src/money.js'

describe('card enums', () => {
  it('exposes the catalogues', () => {
    expect(CardRecurringOperation.CHARGE).toBe('charge')
    expect(DccDecision.ACCEPT).toBe('accept')
    expect(CardRecurringFrequency.MONTHLY).toBe('MONTHLY')
  })
})

describe('serializeCardRecurringRegistration', () => {
  it('emits limits in minor units and keeps the wire key order', () => {
    const body = serializeCardRecurringRegistration({
      label: 'Mandat',
      frequency: 'MONTHLY',
      limitAmt: Money.pln(20000),
      totLimitAmt: Money.pln(100000),
      limitAmtFixed: false,
      expirationDate: '2028-12-31',
      initDate: '2026-09-01',
    })
    expect(body).toEqual({
      label: 'Mandat',
      frequency: 'MONTHLY',
      limit_amt: 20000,
      tot_limit_amt: 100000,
      is_limit_amt_fixed: false,
      expiration_date: '2028-12-31',
      init_date: '2026-09-01',
    })
    expect(Object.keys(body)).toEqual([
      'label',
      'frequency',
      'limit_amt',
      'tot_limit_amt',
      'is_limit_amt_fixed',
      'expiration_date',
      'init_date',
    ])
  })

  it('emits only the label when nothing else is set', () => {
    expect(serializeCardRecurringRegistration({ label: 'Mandat' })).toEqual({ label: 'Mandat' })
  })

  it('validates the label and the frequency', () => {
    expect(() => serializeCardRecurringRegistration({ label: '' })).toThrow(
      'Mandate label must be 1-50 characters',
    )
    expect(() => serializeCardRecurringRegistration({ label: 'a', frequency: 'nope' })).toThrow(
      'Invalid card recurring frequency "nope"',
    )
    expect(() => serializeCardRecurringRegistration({ label: 'a', frequency: 'nope' })).toThrow(
      DPayValueError,
    )
  })
})
