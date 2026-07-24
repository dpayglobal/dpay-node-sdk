/** A single outbound HTTP request built by the SDK. */
export interface ApiRequest {
  readonly method: 'GET' | 'POST'
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly body: string | null
  readonly signal?: AbortSignal
}

/** A raw HTTP response handed back to the SDK. */
export class ApiResponse {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: string

  constructor(status: number, headers: Readonly<Record<string, string>>, body: string) {
    this.status = status
    this.headers = Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
    )
    this.body = body
  }

  /**
   * Retrieve the response header value by name, performing a case-insensitive lookup.
   * Returns `null` if the header was not present in the response.
   */
  getHeader(name: string): string | null {
    return this.headers[name.toLowerCase()] ?? null
  }

  /**
   * Attempt to decode the response body as JSON, returning the parsed value if it is a
   * plain object or array, or `null` if the body is not valid JSON or the parsed value
   * is a primitive (string, number, boolean, null).
   */
  decodeJson(): unknown {
    let decoded: unknown
    try {
      decoded = JSON.parse(this.body)
    } catch {
      return null
    }
    return typeof decoded === 'object' && decoded !== null ? decoded : null
  }
}

/**
 * Transport contract. Replace the default implementation to add proxying,
 * retries or request recording in tests.
 *
 * Critical invariant: the `request()` method must resolve to an `ApiResponse` for
 * every response the server actually sent, including 4xx and 5xx status codes.
 * It must reject with an error only when no response was obtained at all—that is,
 * for a genuine transport failure such as a connection reset, timeout, or abort.
 *
 * If your implementation rejects on 4xx or 5xx responses, the SDK will be unable
 * to map the status code to its typed error classes, and the SDK's error handling
 * will break silently.
 */
export interface HttpClient {
  /**
   * Execute an HTTP request and return the server's response. Must resolve with
   * an `ApiResponse` for every response, and reject only on transport failure.
   */
  request(request: ApiRequest): Promise<ApiResponse>
}
