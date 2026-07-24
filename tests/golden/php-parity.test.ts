import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SDK_VERSION } from '../../src/version.js'
import { leaves } from './leaves.js'
import { runRequestScenario } from './scenario.js'

const GOLDEN = JSON.parse(
  readFileSync(new URL('./php_sdk_golden.json', import.meta.url), 'utf8'),
) as Record<string, unknown>
const ACTUAL = await runRequestScenario()

const GOLDEN_LEAVES = leaves(GOLDEN, { skipPathsContaining: 'User-Agent' })
const ACTUAL_LEAVES = leaves(ACTUAL, { skipPathsContaining: 'User-Agent' })

describe('parity with the PHP SDK', () => {
  it('covers all 23 recorded calls', () => {
    expect((GOLDEN.calls as unknown[]).length).toBe(23)
    expect((ACTUAL.calls as unknown[]).length).toBe(23)
  })

  it('produces exactly the same set of leaves', () => {
    expect(Object.keys(ACTUAL_LEAVES).sort()).toEqual(Object.keys(GOLDEN_LEAVES).sort())
  })

  it.each(Object.keys(GOLDEN_LEAVES).sort())('%s matches the PHP SDK', (path) => {
    expect(ACTUAL_LEAVES[path]).toEqual(GOLDEN_LEAVES[path])
  })

  it('identifies itself as the Node SDK in the only deliberate difference', () => {
    const agent = (ACTUAL.calls as Array<{ headers: Record<string, string> }>)[0]?.headers['User-Agent']
    expect(agent).toBe(`dpay-node-sdk/${SDK_VERSION} node/${process.versions.node}`)
  })
})
