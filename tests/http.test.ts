import { describe, expect, it } from 'vitest'
import { TransportError } from '../src/errors.js'
import { FetchHttpClient } from '../src/http/fetch-client.js'
import { ApiResponse } from '../src/http/types.js'

describe('ApiResponse', () => {
  it('lowercases header names for lookup', () => {
    const response = new ApiResponse(200, { 'Retry-After': '30' }, '{}')
    expect(response.getHeader('retry-after')).toBe('30')
    expect(response.getHeader('Retry-After')).toBe('30')
    expect(response.getHeader('missing')).toBeNull()
  })

  it('decodes objects and arrays, and returns null for anything else', () => {
    expect(new ApiResponse(200, {}, '{"a":1}').decodeJson()).toEqual({ a: 1 })
    expect(new ApiResponse(200, {}, '[1,2]').decodeJson()).toEqual([1, 2])
    expect(new ApiResponse(200, {}, 'not json').decodeJson()).toBeNull()
    expect(new ApiResponse(200, {}, '"just a string"').decodeJson()).toBeNull()
    expect(new ApiResponse(200, {}, '').decodeJson()).toBeNull()
  })
})

describe('FetchHttpClient', () => {
  it('passes method, headers and body through to fetch', async () => {
    const calls: Array<[string, RequestInit]> = []
    const fetchImpl = async (url: string | URL, init?: RequestInit): Promise<Response> => {
      calls.push([String(url), init ?? {}])
      return new Response('{"ok":true}', { status: 200, headers: { 'X-Test': '1' } })
    }
    const client = new FetchHttpClient(fetchImpl as typeof fetch)
    const response = await client.request({
      method: 'POST',
      url: 'https://api.test/x',
      headers: { Accept: 'application/json' },
      body: '{"a":1}',
    })

    expect(calls[0]?.[0]).toBe('https://api.test/x')
    expect(calls[0]?.[1].method).toBe('POST')
    expect(calls[0]?.[1].body).toBe('{"a":1}')
    expect(response.status).toBe(200)
    expect(response.body).toBe('{"ok":true}')
    expect(response.getHeader('x-test')).toBe('1')
  })

  it('lets 4xx and 5xx reach the caller instead of throwing', async () => {
    const fetchImpl = async (): Promise<Response> => new Response('{"message":"nope"}', { status: 422 })
    const client = new FetchHttpClient(fetchImpl as typeof fetch)
    const response = await client.request({
      method: 'GET',
      url: 'https://api.test/x',
      headers: {},
      body: null,
    })
    expect(response.status).toBe(422)
  })

  it('wraps a network failure in TransportError and keeps the cause', async () => {
    const cause = new Error('ECONNRESET')
    const fetchImpl = async (): Promise<Response> => {
      throw cause
    }
    const client = new FetchHttpClient(fetchImpl as typeof fetch)
    await expect(
      client.request({ method: 'GET', url: 'https://api.test/x', headers: {}, body: null }),
    ).rejects.toMatchObject({ constructor: TransportError, cause })
  })

  it('wraps an aborted request in TransportError', async () => {
    const controller = new AbortController()
    controller.abort()
    const client = new FetchHttpClient()
    await expect(
      client.request({
        method: 'GET',
        url: 'https://api-payments.dpay.pl/api/v1_0/cards/public-key',
        headers: {},
        body: null,
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(TransportError)
  })

  it('rejects with TransportError when reading the response body fails', async () => {
    const cause = new Error('stream exploded')
    const body = new ReadableStream({
      pull() {
        throw cause
      },
    })
    const fetchImpl = async (): Promise<Response> => new Response(body, { status: 200 })
    const client = new FetchHttpClient(fetchImpl as typeof fetch)
    await expect(
      client.request({ method: 'GET', url: 'https://api.test/x', headers: {}, body: null }),
    ).rejects.toMatchObject({
      constructor: TransportError,
      message: 'Unable to read the API response body',
      cause,
    })
  })

  it('must not follow redirects to protect merchant checksum in request body', async () => {
    const calls: Array<[string, RequestInit]> = []
    const fetchImpl = async (url: string | URL, init?: RequestInit): Promise<Response> => {
      calls.push([String(url), init ?? {}])
      return new Response('{"ok":true}', { status: 200 })
    }
    const client = new FetchHttpClient(fetchImpl as typeof fetch)
    await client.request({
      method: 'POST',
      url: 'https://api.test/x',
      headers: {},
      body: '{"checksum":"merchant-secret"}',
    })

    expect(calls[0]?.[1].redirect).toBe('manual')
  })
})
