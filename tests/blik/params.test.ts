import { describe, expect, it } from 'vitest'
import { BlikAliasType } from '../../src/blik/enums.js'
import { serializeBlikAliasRegistration, serializeBlikRecurringRegistration } from '../../src/blik/params.js'
import { DPayValueError } from '../../src/errors.js'
import { Money } from '../../src/money.js'

describe('serializeBlikAliasRegistration', () => {
  it('defaults the type to UID', () => {
    expect(serializeBlikAliasRegistration({ label: 'Moj alias' })).toEqual({
      label: 'Moj alias',
      type: BlikAliasType.UID,
    })
    expect(serializeBlikAliasRegistration({ label: 'Moj alias', type: 'PAYID' })).toEqual({
      label: 'Moj alias',
      type: 'PAYID',
    })
  })

  it('validates the label and the type', () => {
    expect(() => serializeBlikAliasRegistration({ label: '' })).toThrow('Alias label must be 1-50 characters')
    expect(() => serializeBlikAliasRegistration({ label: 'x'.repeat(51) })).toThrow(DPayValueError)
    expect(() => serializeBlikAliasRegistration({ label: 'a', type: 'nope' })).toThrow(
      'Invalid BLIK alias type "nope"',
    )
  })
})

describe('serializeBlikRecurringRegistration', () => {
  it('emits the wire shape used in the golden vector', () => {
    const body = serializeBlikRecurringRegistration({
      label: 'Subskrypcja',
      model: 'M',
      frequency: '12M',
      value: Money.pln(4999),
      limitAmt: 100000,
      totLimitAmt: 500000,
      limitAmtFixed: true,
      expirationDate: '2027-01-01',
      initDate: '2026-08-01',
    })
    expect(body).toEqual({
      label: 'Subskrypcja',
      type: 'PAYID',
      model: 'M',
      frequency: '12M',
      value: '49.99',
      limit_amt: 100000,
      tot_limit_amt: 500000,
      is_limit_amt_fixed: true,
      expiration_date: '2027-01-01',
      init_date: '2026-08-01',
    })
    expect(Object.keys(body)).toEqual([
      'label',
      'type',
      'model',
      'frequency',
      'value',
      'limit_amt',
      'tot_limit_amt',
      'is_limit_amt_fixed',
      'expiration_date',
      'init_date',
    ])
  })

  it('always forces type PAYID', () => {
    expect(serializeBlikRecurringRegistration({ label: 'a', model: 'A', frequency: '1D' }).type).toBe('PAYID')
  })

  it('validates label, model, frequency and dates', () => {
    expect(() => serializeBlikRecurringRegistration({ label: '', model: 'M', frequency: '1M' })).toThrow(
      'Alias label must be 1-50 characters',
    )
    expect(() =>
      serializeBlikRecurringRegistration({ label: 'a', model: 'X' as never, frequency: '1M' }),
    ).toThrow('Invalid recurring model "X"')
    expect(() => serializeBlikRecurringRegistration({ label: 'a', model: 'M', frequency: '0M' })).toThrow(
      'Invalid recurring frequency "0M"',
    )
    expect(() => serializeBlikRecurringRegistration({ label: 'a', model: 'M', frequency: '12X' })).toThrow(
      DPayValueError,
    )
    expect(() =>
      serializeBlikRecurringRegistration({ label: 'a', model: 'M', frequency: '1M', initDate: 'nope' }),
    ).toThrow('Date "nope" must be in YYYY-MM-DD format')
  })
})
