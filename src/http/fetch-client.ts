import { TransportError } from '../errors.js'
import { ApiResponse } from './types.js'
import type { ApiRequest, HttpClient } from './types.js'

/** Default transport, built on the global `fetch`. */
export class FetchHttpClient implements HttpClient {
  private readonly fetchImpl: typeof fetch

  constructor(fetchImpl: typeof fetch = globalThis.fetch) {
    this.fetchImpl = fetchImpl
  }

  async request(request: ApiRequest): Promise<ApiResponse> {
    let response: Response
    try {
      response = await this.fetchImpl(request.url, {
        method: request.method,
        headers: { ...request.headers },
        ...(request.body !== null ? { body: request.body } : {}),
        signal: request.signal ?? null,
        redirect: 'manual',
      })
    } catch (error) {
      throw new TransportError('HTTP request failed', { cause: error })
    }

    let body: string
    try {
      body = await response.text()
    } catch (error) {
      throw new TransportError('Unable to read the API response body', { cause: error })
    }

    const headers: Record<string, string> = {}
    response.headers.forEach((value, name) => {
      headers[name] = value
    })
    return new ApiResponse(response.status, headers, body)
  }
}
