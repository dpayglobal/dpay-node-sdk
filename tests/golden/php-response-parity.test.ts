import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { leaves } from './leaves.js'
import { runResponseScenario } from './response-scenario.js'

const GOLDEN = JSON.parse(
  readFileSync(new URL('./php_response_golden.json', import.meta.url), 'utf8'),
) as Record<string, unknown>
const ACTUAL = runResponseScenario()

const GOLDEN_LEAVES = leaves(GOLDEN, { emptyArrayIsObject: true })
const ACTUAL_LEAVES = leaves(ACTUAL, { emptyArrayIsObject: true })

describe('response parity with the PHP SDK', () => {
  it('covers all nine model groups', () => {
    expect(Object.keys(ACTUAL).sort()).toEqual(Object.keys(GOLDEN).sort())
    expect(Object.keys(GOLDEN).sort()).toEqual([
      'availability',
      'bank',
      'blik_alias',
      'blik_recurring',
      'card_result',
      'payout',
      'refund',
      'registered',
      'transaction',
    ])
  })

  it('produces exactly the same set of leaves', () => {
    expect(Object.keys(ACTUAL_LEAVES).sort()).toEqual(Object.keys(GOLDEN_LEAVES).sort())
  })

  it('compares at least 500 leaf values', () => {
    expect(Object.keys(GOLDEN_LEAVES).length).toBeGreaterThanOrEqual(500)
  })

  it.each(Object.keys(GOLDEN_LEAVES).sort())('%s matches the PHP SDK', (path) => {
    expect(ACTUAL_LEAVES[path]).toEqual(GOLDEN_LEAVES[path])
  })
})
