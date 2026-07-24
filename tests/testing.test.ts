import { describe, expect, it } from 'vitest'
import { MockHttpClient } from '../src/testing.js'

describe('MockHttpClient', () => {
  it('returns queued responses in order and records requests', async () => {
    const transport = new MockHttpClient()
    transport.queueJson(200, { a: 1 })
    transport.queueText(204, '')

    const first = await transport.request({ method: 'GET', url: 'https://a.test', headers: {}, body: null })
    const second = await transport.request({
      method: 'POST',
      url: 'https://b.test',
      headers: {},
      body: '{"b":2}',
    })

    expect(first.body).toBe('{"a":1}')
    expect(second.status).toBe(204)
    expect(transport.requests).toHaveLength(2)
    expect(transport.lastRequest.url).toBe('https://b.test')
    expect(transport.lastRequestBody).toEqual({ b: 2 })
  })

  it('throws a clear error when the queue runs dry', async () => {
    const transport = new MockHttpClient()
    await expect(
      transport.request({ method: 'GET', url: 'https://a.test', headers: {}, body: null }),
    ).rejects.toThrow('MockHttpClient queue is empty')
  })

  it('throws when asked for a body that is not a JSON object', async () => {
    const transport = new MockHttpClient()
    transport.queueText(200, 'ok')
    await transport.request({ method: 'GET', url: 'https://a.test', headers: {}, body: null })
    expect(() => transport.lastRequestBody).toThrow('Last request has no JSON object body')
  })
})
