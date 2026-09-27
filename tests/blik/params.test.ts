import { describe, expect, it } from 'vitest'
import { BlikAliasType } from '../../src/blik/enums.js'
import { serializeBlikAliasRegistration } from '../../src/blik/params.js'
import { DPayValueError } from '../../src/errors.js'

describe('serializeBlikAliasRegistration', () => {
  it('defaults the type to UID', () => {
    expect(serializeBlikAliasRegistration({ label: 'Moj alias' })).toEqual({
      label: 'Moj alias',
      type: BlikAliasType.UID,
    })
    expect(serializeBlikAliasRegistration({ label: 'Moj alias', type: 'UID' })).toEqual({
      label: 'Moj alias',
      type: 'UID',
    })
  })

  it('validates the label and the type', () => {
    expect(() => serializeBlikAliasRegistration({ label: '' })).toThrow('Alias label must be 1-50 characters')
    expect(() => serializeBlikAliasRegistration({ label: 'x'.repeat(51) })).toThrow(DPayValueError)
    expect(() => serializeBlikAliasRegistration({ label: 'a', type: 'nope' })).toThrow(
      'Invalid BLIK alias type "nope"',
    )
  })

  it('rejects PAYID - OneClick aliases are UID only, recurring payments live in dpay.recurring', () => {
    expect(Object.values(BlikAliasType)).toEqual(['UID'])
    expect(() => serializeBlikAliasRegistration({ label: 'a', type: 'PAYID' })).toThrow(
      'Invalid BLIK alias type "PAYID"',
    )
  })
})
