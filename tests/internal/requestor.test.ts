import { describe, expect, it, vi } from 'vitest'
import { Config, type RequestHookContext } from '../../src/config.js'
import { ApiServerError, AuthenticationError, DPayValueError, TransportError } from '../../src/errors.js'
import { ApiResponse } from '../../src/http/types.js'
import type { ApiRequest, HttpClient } from '../../src/http/types.js'
import { API_PAYMENTS, PANEL } from '../../src/internal/base-urls.js'
import { decodeRecordOrFail } from '../../src/internal/operation.js'
import type { Operation } from '../../src/internal/operation.js'
import { ApiRequestor } from '../../src/internal/requestor.js'
import { MockHttpClient } from '../../src/testing.js'
import { SDK_VERSION } from '../../src/version.js'

const echo = (transport: HttpClient, overrides = {}): ApiRequestor =>
  new ApiRequestor(
    Config.fromOptions({ service: 's', secretHash: 'h', httpClient: transport, ...overrides }),
    transport,
  )

const ping: Operation<Record<string, unknown>> = {
  method: 'POST',
  host: PANEL,
  path: '/api/v1/pbl/details',
  body: { service: 's', transaction_id: 'tx-1' },
  parse: decodeRecordOrFail,
}

describe('ApiRequestor', () => {
  it('builds the URL, headers and body', async () => {
    const transport = new MockHttpClient()
    transport.queueJson(200, { ok: true })
    await echo(transport).execute(ping)

    const request = transport.lastRequest
    expect(request.method).toBe('POST')
    expect(request.url).toBe('https://panel.dpay.pl/api/v1/pbl/details')
    expect(request.headers.Accept).toBe('application/json')
    expect(request.headers['Content-Type']).toBe('application/json')
    expect(request.headers['User-Agent']).toBe(`dpay-node-sdk/${SDK_VERSION} node/${process.versions.node}`)
    expect(request.body).toBe('{"service":"s","transaction_id":"tx-1"}')
  })

  it('omits Content-Type when there is no body', async () => {
    const transport = new MockHttpClient()
    transport.queueJson(200, [])
    await echo(transport).execute({
      method: 'GET',
      host: PANEL,
      path: '/api/v1/pbl/banks',
      parse: () => null,
    })
    expect(transport.lastRequest.headers['Content-Type']).toBeUndefined()
    expect(transport.lastRequest.body).toBeNull()
  })

  it('resolves the api-payments host too', async () => {
    const transport = new MockHttpClient()
    transport.queueText(200, 'key')
    await echo(transport).execute({
      method: 'GET',
      host: API_PAYMENTS,
      path: '/api/v1_0/cards/public-key',
      parse: (response) => response.body,
    })
    expect(transport.lastRequest.url).toBe('https://api-payments.dpay.pl/api/v1_0/cards/public-key')
  })

  it('maps a 4xx response to the matching error', async () => {
    const transport = new MockHttpClient()
    transport.queueJson(401, { message: 'bad checksum' })
    await expect(echo(transport).execute(ping)).rejects.toBeInstanceOf(AuthenticationError)
  })

  it('honours raiseForStatus false and hands the response to the parser', async () => {
    const transport = new MockHttpClient()
    transport.queueJson(409, { refund: false })
    const result = await echo(transport).execute({
      ...ping,
      raiseForStatus: false,
      parse: (response) => response.status,
    })
    expect(result).toBe(409)
  })

  it('fails with ApiServerError when response body is not JSON', async () => {
    const transport = new MockHttpClient()
    transport.queueText(200, 'not json')
    await expect(echo(transport).execute(ping)).rejects.toBeInstanceOf(ApiServerError)
  })

  it('wraps transport errors in TransportError and preserves detail on cause', async () => {
    const underlyingError = new Error('ECONNRESET')
    const transport: HttpClient = {
      request: () => Promise.reject(underlyingError),
    }
    const rejection = await echo(transport)
      .execute(ping)
      .catch((e) => e)
    expect(rejection).toBeInstanceOf(TransportError)
    expect(rejection.message).toBe('HTTP request failed')
    expect(rejection.cause).toBe(underlyingError)
  })

  it('aborts on the caller signal and reports it as a transport failure', async () => {
    const controller = new AbortController()
    const transport: HttpClient = {
      request: (request: ApiRequest) =>
        new Promise((_resolve, reject) => {
          request.signal?.addEventListener('abort', () => reject(request.signal?.reason))
        }),
    }
    const promise = echo(transport).execute(ping, { signal: controller.signal })
    controller.abort()
    await expect(promise).rejects.toBeInstanceOf(TransportError)
  })

  it('aborts on the per-call timeout', async () => {
    const transport: HttpClient = {
      request: (request: ApiRequest) =>
        new Promise((_resolve, reject) => {
          request.signal?.addEventListener('abort', () => reject(request.signal?.reason))
        }),
    }
    await expect(echo(transport).execute(ping, { timeout: 20 })).rejects.toBeInstanceOf(TransportError)
  })

  it('calls the hooks with the checksum redacted', async () => {
    const onRequest = vi.fn()
    const onResponse = vi.fn()
    const transport = new MockHttpClient()
    transport.queueJson(200, { ok: true })
    const requestor = echo(transport, { onRequest, onResponse })
    await requestor.execute({ ...ping, body: { service: 's', checksum: 'abc', encryptedCardData: 'xyz' } })

    expect(onRequest).toHaveBeenCalledTimes(1)
    expect(onRequest.mock.calls[0]?.[0].body).toBe(
      '{"service":"s","checksum":"[redacted]","encryptedCardData":"[redacted]"}',
    )
    expect(onResponse.mock.calls[0]?.[0].status).toBe(200)
  })

  it('redacts sensitive keys nested inside objects and arrays, at any depth', async () => {
    const onRequest = vi.fn()
    const transport = new MockHttpClient()
    transport.queueJson(200, { ok: true })
    const requestor = echo(transport, { onRequest })
    await requestor.execute({
      ...ping,
      body: {
        service: 's',
        card: { encryptedCardData: 'SECRET' },
        items: [{ checksum: 'abc' }, { safe: 'value' }],
      },
    })

    expect(onRequest.mock.calls[0]?.[0].body).toBe(
      '{"service":"s","card":{"encryptedCardData":"[redacted]"},"items":[{"checksum":"[redacted]"},{"safe":"value"}]}',
    )
  })

  it('never lets a throwing hook break the call', async () => {
    const transport = new MockHttpClient()
    transport.queueJson(200, { ok: true })
    const requestor = echo(transport, {
      onRequest: () => {
        throw new Error('hook exploded')
      },
    })
    await expect(requestor.execute(ping)).resolves.toEqual({ ok: true })
  })

  it('never lets a rejecting async hook break the call or crash the process', async () => {
    const transport = new MockHttpClient()
    transport.queueJson(200, { ok: true })
    const requestor = echo(transport, {
      onRequest: async () => {
        throw new Error('async hook exploded')
      },
    })
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      await expect(requestor.execute(ping)).resolves.toEqual({ ok: true })
      await new Promise((resolve) => setImmediate(resolve))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.removeListener('unhandledRejection', unhandled)
    }
  })

  it('gives the hook a copy of the headers, so mutating it does not affect the request sent', async () => {
    const transport = new MockHttpClient()
    transport.queueJson(200, { ok: true })
    const requestor = echo(transport, {
      onRequest: (context: RequestHookContext) => {
        ;(context.headers as Record<string, string>)['X-Injected'] = '1'
      },
    })
    await requestor.execute(ping)
    expect(transport.lastRequest.headers['X-Injected']).toBeUndefined()
  })

  it('validates a per-call timeout and throws DPayValueError for an invalid value', async () => {
    const transport = new MockHttpClient()
    const requestor = echo(transport)
    const message = 'Option "timeout" must be a positive integer number of milliseconds'

    for (const invalid of [0, -1, 1.5, Number.NaN]) {
      const rejection = await requestor.execute(ping, { timeout: invalid }).catch((e) => e)
      expect(rejection).toBeInstanceOf(DPayValueError)
      expect(rejection.message).toBe(message)
    }

    transport.queueJson(200, { ok: true })
    await expect(requestor.execute(ping, { timeout: 1000 })).resolves.toEqual({ ok: true })
  })
})

describe('decoders', () => {
  it('throws ApiServerError on an undecodable body', () => {
    expect(() => decodeRecordOrFail(new ApiResponse(200, {}, 'x'))).toThrow(ApiServerError)
    expect(() => decodeRecordOrFail(new ApiResponse(200, {}, 'x'))).toThrow('Invalid JSON in API response')
  })

  it('coerces a non-object JSON body to an empty record', () => {
    expect(decodeRecordOrFail(new ApiResponse(200, {}, '[1]'))).toEqual({})
  })
})
