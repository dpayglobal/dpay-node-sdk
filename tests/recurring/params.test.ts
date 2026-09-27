import { describe, expect, it } from 'vitest'
import { DPayValueError } from '../../src/errors.js'
import { RecurringMethod, RecurringModel } from '../../src/recurring/enums.js'
import {
  type RecurringRegistrationParams,
  serializeRecurringRegistration,
} from '../../src/recurring/params.js'

const TERMS = 'https://shop.example/terms'
const modelA: RecurringRegistrationParams = {
  label: 'Abonament',
  model: RecurringModel.A,
  termsUrl: TERMS,
  frequency: '1M',
  limitAmt: 5999,
  totLimitAmt: 71988,
  expirationDate: '2027-09-30',
  initDate: '2026-11-01',
}

describe('serializeRecurringRegistration', () => {
  it('sends no frequency or limits in model O', () => {
    const body = serializeRecurringRegistration({
      label: 'Abonament',
      model: RecurringModel.O,
      termsUrl: TERMS,
      alias: 'SUB-0001',
      methods: [RecurringMethod.BLIK],
      termsVersion: '2026-09',
    })
    expect(body).toEqual({
      label: 'Abonament',
      alias: 'SUB-0001',
      model: 'O',
      methods: ['blik'],
      terms_url: TERMS,
      terms_version: '2026-09',
    })
    expect(Object.keys(body)).toEqual(['label', 'alias', 'model', 'methods', 'terms_url', 'terms_version'])
  })

  it('keeps the full key order of the golden vector', () => {
    const body = serializeRecurringRegistration({
      termsVersion: '2026-09',
      methods: ['blik'],
      initDate: '2026-08-01',
      expirationDate: '2027-01-01',
      limitAmtFixed: true,
      totLimitAmt: 500000,
      limitAmt: 100000,
      frequency: '12M',
      alias: 'SUB-1',
      termsUrl: 'https://shop.test/regulamin',
      model: 'M',
      label: 'Subskrypcja',
    })
    expect(Object.keys(body)).toEqual([
      'label',
      'alias',
      'model',
      'frequency',
      'limit_amt',
      'tot_limit_amt',
      'is_limit_amt_fixed',
      'expiration_date',
      'init_date',
      'methods',
      'terms_url',
      'terms_version',
    ])
  })

  it('rejects limits in model O', () => {
    const base = { label: 'Abonament', model: RecurringModel.O, termsUrl: TERMS }
    expect(() => serializeRecurringRegistration({ ...base, frequency: '1M' })).toThrow(
      'frequency is not allowed in recurring model O',
    )
    expect(() => serializeRecurringRegistration({ ...base, limitAmt: 100 })).toThrow(
      'limit_amt is not allowed in recurring model O',
    )
    expect(() => serializeRecurringRegistration({ ...base, totLimitAmt: 100 })).toThrow(
      'tot_limit_amt is not allowed in recurring model O',
    )
    expect(() => serializeRecurringRegistration({ ...base, limitAmtFixed: true })).toThrow(
      'is_limit_amt_fixed is not allowed in recurring model O',
    )
    expect(() => serializeRecurringRegistration({ ...base, expirationDate: '2027-01-01' })).not.toThrow()
  })

  it('requires the full terms in model A and only a fixed amount', () => {
    expect(Object.keys(serializeRecurringRegistration(modelA))).toEqual([
      'label',
      'model',
      'frequency',
      'limit_amt',
      'tot_limit_amt',
      'expiration_date',
      'init_date',
      'terms_url',
    ])
    const { initDate: _initDate, ...withoutInitDate } = modelA
    expect(() => serializeRecurringRegistration(withoutInitDate)).toThrow(
      'init_date is required in recurring model A',
    )
    const { frequency: _frequency, ...withoutFrequency } = modelA
    expect(() => serializeRecurringRegistration(withoutFrequency)).toThrow(
      'frequency is required in recurring model A',
    )
    expect(() => serializeRecurringRegistration({ ...modelA, limitAmtFixed: false })).toThrow(
      'Recurring model A requires a fixed amount (is_limit_amt_fixed = true)',
    )
    expect(serializeRecurringRegistration({ ...modelA, limitAmtFixed: true }).is_limit_amt_fixed).toBe(true)
  })

  it('allows optional terms in model M', () => {
    expect(serializeRecurringRegistration({ label: 'A', model: 'M', termsUrl: TERMS })).toEqual({
      label: 'A',
      model: 'M',
      terms_url: TERMS,
    })
  })

  it('accepts only BLIK frequencies (no quarters)', () => {
    const base = { label: 'Abonament', model: RecurringModel.M, termsUrl: TERMS }
    for (const frequency of ['1D', '2W', '14D', '1M', '12M', '1Y', '999D']) {
      expect(() => serializeRecurringRegistration({ ...base, frequency })).not.toThrow()
    }
    for (const frequency of ['1Q', '0M', '1000D', 'M', '1m', ' 1M']) {
      expect(() => serializeRecurringRegistration({ ...base, frequency })).toThrow(
        `Invalid recurring frequency "${frequency}"`,
      )
    }
  })

  it('validates label, model, terms and the other fields', () => {
    const base = { label: 'Abonament', model: RecurringModel.M, termsUrl: TERMS }
    const cases: Array<[Partial<RecurringRegistrationParams>, string]> = [
      [{ label: '' }, 'Recurring payment label must be 1-50 characters'],
      [{ label: 'ż'.repeat(51) }, 'Recurring payment label must be 1-50 characters'],
      [{ model: 'B' }, 'Invalid recurring model "B"'],
      [{ termsUrl: 'not a url' }, 'Invalid terms URL "not a url"'],
      [{ termsUrl: `https://shop.example/${'a'.repeat(2030)}` }, 'Invalid terms URL'],
      [{ alias: '' }, 'Recurring alias must be 1-128 characters'],
      [{ alias: 'x'.repeat(129) }, 'Recurring alias must be 1-128 characters'],
      [{ termsVersion: '' }, 'Terms version must be 1-64 characters'],
      [{ methods: [] }, 'Methods must be a non-empty list of distinct methods'],
      [{ methods: ['blik', 'blik'] }, 'Methods must be a non-empty list of distinct methods'],
      [{ methods: ['card'] }, 'Unsupported recurring method "card"'],
      [{ limitAmt: 0 }, 'limit_amt must be at least 1 (minor units)'],
      [{ totLimitAmt: 10.5 }, 'tot_limit_amt must be an integer number of minor units'],
      [{ expirationDate: '30-09-2027' }, 'Date "30-09-2027" must be in YYYY-MM-DD format'],
      [{ initDate: '2026/11/01' }, 'Date "2026/11/01" must be in YYYY-MM-DD format'],
    ]
    for (const [override, message] of cases) {
      expect(() => serializeRecurringRegistration({ ...base, ...override })).toThrow(message)
      expect(() => serializeRecurringRegistration({ ...base, ...override })).toThrow(DPayValueError)
    }
    expect(() => serializeRecurringRegistration({ ...base, label: 'ż'.repeat(50) })).not.toThrow()
  })
})
