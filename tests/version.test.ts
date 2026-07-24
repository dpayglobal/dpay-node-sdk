import { describe, expect, it } from 'vitest'
import { SDK_VERSION } from '../src/version.js'

describe('SDK_VERSION', () => {
  it('matches the version in package.json', async () => {
    const pkg = await import('../package.json', { with: { type: 'json' } })
    expect(SDK_VERSION).toBe(pkg.default.version)
  })

  it('is a semver string', () => {
    expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
