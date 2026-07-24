import { DPayValueError } from './errors.js'
import type { HttpClient } from './http/types.js'
import { BaseUrls } from './internal/base-urls.js'

const KNOWN_OPTIONS = [
  'service',
  'secretHash',
  'timeout',
  'httpClient',
  'baseUrls',
  'onRequest',
  'onResponse',
] as const

function ownOption<K extends keyof DPayClientOptions>(
  options: Partial<DPayClientOptions>,
  key: K,
): DPayClientOptions[K] | undefined {
  return Object.hasOwn(options, key) ? options[key] : undefined
}

/** Default HTTP timeout in milliseconds. */
export const DEFAULT_TIMEOUT = 30_000

const TIMEOUT_MESSAGE = 'Option "timeout" must be a positive integer number of milliseconds'

/**
 * Validates a timeout expressed in milliseconds, throwing `DPayValueError` when it is
 * not a positive integer. Shared by `Config.fromOptions`, for the configured timeout,
 * and by the per-call `RequestOptions.timeout`, so both are held to the same rule and
 * report the same message.
 */
export function validateTimeoutMs(timeout: number): number {
  if (!Number.isInteger(timeout) || timeout < 1) {
    throw new DPayValueError(TIMEOUT_MESSAGE)
  }
  return timeout
}

/** Per-call overrides accepted as the last argument of every service method. */
export interface RequestOptions {
  /** Cancels the call. Combined with the configured timeout. */
  signal?: AbortSignal
  /** Timeout for this call only, in milliseconds. */
  timeout?: number
}

/** What `onRequest` receives. Sensitive values are already redacted. */
export interface RequestHookContext {
  readonly method: string
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly body: string | null
}

/** What `onResponse` receives. */
export interface ResponseHookContext {
  readonly status: number
  readonly url: string
  readonly body: string
}

/** Options accepted by `new DPayClient(...)`. */
export interface DPayClientOptions {
  /** Payment point name from panel.dpay.pl. */
  service: string
  /** Secret Hash key from panel.dpay.pl. Never expose it to a browser. */
  secretHash: string
  /** HTTP timeout in milliseconds. Defaults to 30000. */
  timeout?: number
  /** Custom transport for proxying, retries or tests. */
  httpClient?: HttpClient
  /** Overrides for the `apiPayments`, `panel` and `gateway` hosts. */
  baseUrls?: Record<string, string>
  /** Called before every request, with the checksum and card data redacted. */
  onRequest?: (context: RequestHookContext) => void
  /** Called after every response that reached the SDK. */
  onResponse?: (context: ResponseHookContext) => void
}

export class Config {
  readonly service: string
  readonly secretHash: string
  readonly timeout: number
  readonly httpClient: HttpClient | null
  readonly baseUrls: BaseUrls
  readonly onRequest: ((context: RequestHookContext) => void) | null
  readonly onResponse: ((context: ResponseHookContext) => void) | null

  private constructor(init: {
    service: string
    secretHash: string
    timeout: number
    httpClient: HttpClient | null
    baseUrls: BaseUrls
    onRequest: ((context: RequestHookContext) => void) | null
    onResponse: ((context: ResponseHookContext) => void) | null
  }) {
    this.service = init.service
    this.secretHash = init.secretHash
    this.timeout = init.timeout
    this.httpClient = init.httpClient
    this.baseUrls = init.baseUrls
    this.onRequest = init.onRequest
    this.onResponse = init.onResponse
    Object.freeze(this)
  }

  static fromOptions(options: DPayClientOptions): Config {
    const snapshot = Object.fromEntries(Object.entries(options)) as Partial<DPayClientOptions>

    for (const key of Object.keys(snapshot)) {
      if (!(KNOWN_OPTIONS as readonly string[]).includes(key)) {
        throw new DPayValueError(`Unknown option "${key}"`)
      }
    }

    const service = ownOption(snapshot, 'service')
    if (typeof service !== 'string' || service === '') {
      throw new DPayValueError('Option "service" is required and must be a non-empty string')
    }

    const secretHash = ownOption(snapshot, 'secretHash')
    if (typeof secretHash !== 'string' || secretHash === '') {
      throw new DPayValueError('Option "secretHash" is required and must be a non-empty string')
    }

    const timeout = validateTimeoutMs(ownOption(snapshot, 'timeout') ?? DEFAULT_TIMEOUT)

    const httpClient = ownOption(snapshot, 'httpClient') ?? null
    if (httpClient !== null && typeof httpClient.request !== 'function') {
      throw new DPayValueError('Option "httpClient" must implement HttpClient')
    }

    const overrides = ownOption(snapshot, 'baseUrls') ?? {}
    if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides)) {
      throw new DPayValueError('Option "baseUrls" must be an object')
    }
    for (const url of Object.values(overrides)) {
      if (typeof url !== 'string' || url === '') {
        throw new DPayValueError('Base URLs must be non-empty strings')
      }
    }

    for (const name of ['onRequest', 'onResponse'] as const) {
      const hook = ownOption(snapshot, name)
      if (hook !== undefined && typeof hook !== 'function') {
        throw new DPayValueError(`Option "${name}" must be a function`)
      }
    }

    return new Config({
      service,
      secretHash,
      timeout,
      httpClient,
      baseUrls: new BaseUrls(overrides),
      onRequest: ownOption(snapshot, 'onRequest') ?? null,
      onResponse: ownOption(snapshot, 'onResponse') ?? null,
    })
  }
}
