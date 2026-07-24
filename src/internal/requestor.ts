import { validateTimeoutMs } from '../config.js'
import type { Config, RequestOptions } from '../config.js'
import { DPayError, TransportError } from '../errors.js'
import type { ApiRequest, ApiResponse, HttpClient } from '../http/types.js'
import { SDK_VERSION } from '../version.js'
import { ChecksumCalculator } from './checksum.js'
import { mapError } from './error-mapper.js'
import type { Operation } from './operation.js'
import { phpJsonEncode } from './php.js'

const USER_AGENT = `dpay-node-sdk/${SDK_VERSION} node/${process.versions.node}`
const REDACTED_KEYS = ['checksum', 'encryptedCardData', 'xPayToken']

export class ApiRequestor {
  readonly service: string
  readonly checksum: ChecksumCalculator
  private readonly config: Config
  private readonly httpClient: HttpClient

  constructor(config: Config, httpClient: HttpClient) {
    this.config = config
    this.httpClient = httpClient
    this.service = config.service
    this.checksum = new ChecksumCalculator(config.secretHash)
  }

  async execute<T>(operation: Operation<T>, options?: RequestOptions): Promise<T> {
    const request = this.buildRequest(operation, options)
    this.notify(() => this.config.onRequest?.(redactRequest(request)))

    let response: ApiResponse
    try {
      response = await this.httpClient.request(request)
    } catch (error) {
      if (error instanceof DPayError) throw error
      throw new TransportError('HTTP request failed', { cause: error })
    }

    this.notify(() =>
      this.config.onResponse?.({ status: response.status, url: request.url, body: response.body }),
    )

    if (operation.raiseForStatus !== false && response.status >= 400) throw mapError(response)
    return operation.parse(response)
  }

  private buildRequest<T>(operation: Operation<T>, options?: RequestOptions): ApiRequest {
    const url = this.config.baseUrls.resolve(operation.host) + operation.path
    const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': USER_AGENT }
    let body: string | null = null
    if (operation.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      try {
        body = phpJsonEncode(operation.body)
      } catch (error) {
        throw new TransportError('Unable to encode request body as JSON', {
          cause: error,
        })
      }
    }
    return { method: operation.method, url, headers, body, signal: this.resolveSignal(options) }
  }

  private resolveSignal(options?: RequestOptions): AbortSignal {
    const timeout = AbortSignal.timeout(validateTimeoutMs(options?.timeout ?? this.config.timeout))
    return options?.signal === undefined ? timeout : AbortSignal.any([options.signal, timeout])
  }

  private notify(emit: () => unknown): void {
    let outcome: unknown
    try {
      outcome = emit()
    } catch {
      return
    }
    if (isThenable(outcome)) outcome.then(noop, noop)
  }
}

function noop(): void {}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function'
  )
}

function redactRequest(request: ApiRequest): {
  method: string
  url: string
  headers: Readonly<Record<string, string>>
  body: string | null
} {
  return {
    method: request.method,
    url: request.url,
    headers: { ...request.headers },
    body: redactBody(request.body),
  }
}

function redactBody(body: string | null): string | null {
  if (body === null) return null
  let decoded: unknown
  try {
    decoded = JSON.parse(body)
  } catch {
    return body
  }
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) return body
  try {
    return phpJsonEncode(redactValue(decoded))
  } catch {
    return body
  }
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue)
  if (typeof value !== 'object' || value === null) return value
  const redacted: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    redacted[key] = REDACTED_KEYS.includes(key) ? '[redacted]' : redactValue(nested)
  }
  return redacted
}
