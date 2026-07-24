import { ApiResponse } from './http/types.js'
import type { ApiRequest, HttpClient } from './http/types.js'
import { phpJsonEncode } from './internal/php.js'

/** In-memory transport for testing an integration without network access. */
export class MockHttpClient implements HttpClient {
  /** Every request the SDK made, in order. */
  readonly requests: ApiRequest[] = []
  private readonly queued: ApiResponse[] = []

  /** Queues a prepared response. */
  queue(response: ApiResponse): void {
    this.queued.push(response)
  }

  /** Queues a JSON response, encoded the same way the SDK encodes bodies. */
  queueJson(status: number, body: unknown, headers: Readonly<Record<string, string>> = {}): void {
    this.queue(
      new ApiResponse(status, { 'content-type': 'application/json', ...headers }, phpJsonEncode(body)),
    )
  }

  /** Queues a plain text response. */
  queueText(status: number, body: string, headers: Readonly<Record<string, string>> = {}): void {
    this.queue(new ApiResponse(status, headers, body))
  }

  request(request: ApiRequest): Promise<ApiResponse> {
    this.requests.push(request)
    const response = this.queued.shift()
    if (response === undefined) return Promise.reject(new Error('MockHttpClient queue is empty'))
    return Promise.resolve(response)
  }

  /** The most recent request. Throws when nothing was recorded. */
  get lastRequest(): ApiRequest {
    const request = this.requests.at(-1)
    if (request === undefined) throw new Error('No requests recorded')
    return request
  }

  /** The most recent request body, decoded. Throws when it was not a JSON object. */
  get lastRequestBody(): Record<string, unknown> {
    const body = this.lastRequest.body
    let decoded: unknown = null
    if (body !== null) {
      try {
        decoded = JSON.parse(body)
      } catch {
        decoded = null
      }
    }
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
      throw new Error('Last request has no JSON object body')
    }
    return decoded as Record<string, unknown>
  }
}
