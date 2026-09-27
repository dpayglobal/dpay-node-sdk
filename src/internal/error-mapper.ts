import {
  AccessDeniedError,
  ApiError,
  ApiServerError,
  AuthenticationError,
  InvalidRequestError,
  NotFoundError,
  RateLimitError,
} from '../errors.js'
import type { ApiResponse } from '../http/types.js'
import { isNumeric, isScalar, phpInt, phpStrval } from './php.js'

export function mapError(response: ApiResponse): ApiError {
  const status = response.status
  const rawBody = response.body
  const decoded = response.decodeJson()
  const data: Record<string, unknown> =
    typeof decoded === 'object' && decoded !== null && !Array.isArray(decoded)
      ? (decoded as Record<string, unknown>)
      : {}

  let message = 'Unexpected API error'
  if (typeof data.message === 'string') message = data.message
  else if (typeof data.msg === 'string') message = data.msg

  // Cards API, Events API and webhook errors carry `code`; older endpoints `errorcode`
  let errorCode: string | null = null
  if (typeof data.code === 'string') errorCode = data.code
  else if (typeof data.errorcode === 'string') errorCode = data.errorcode
  const reason = typeof data.reason === 'string' ? data.reason : null
  const fieldErrors = normalizeFieldErrors(data.errors)

  if (status === 429) {
    return new RateLimitError(
      message,
      status,
      intHeader(response, 'Retry-After'),
      intHeader(response, 'X-RateLimit-Limit'),
      intHeader(response, 'X-RateLimit-Remaining'),
      rawBody,
    )
  }
  if (status === 401) return new AuthenticationError(message, status, errorCode, fieldErrors, rawBody, reason)
  if (status === 403) return new AccessDeniedError(message, status, errorCode, fieldErrors, rawBody, reason)
  if (status === 404) return new NotFoundError(message, status, errorCode, fieldErrors, rawBody, reason)
  if (status === 400 || status === 422) {
    return new InvalidRequestError(message, status, errorCode, fieldErrors, rawBody, reason)
  }
  if (status >= 500) return new ApiServerError(message, status, errorCode, fieldErrors, rawBody, reason)
  return new ApiError(message, status, errorCode, fieldErrors, rawBody, reason)
}

function normalizeFieldErrors(errors: unknown): Record<string, string[]> {
  let entries: Array<[string, unknown]>
  if (Array.isArray(errors)) {
    entries = errors.map((value, index) => [String(index), value])
  } else if (typeof errors === 'object' && errors !== null) {
    entries = Object.entries(errors as Record<string, unknown>)
  } else {
    return {}
  }

  const normalized: Record<string, string[]> = {}
  for (const [field, messages] of entries) {
    if (typeof messages === 'string') {
      normalized[phpStrval(field)] = [messages]
    } else if (Array.isArray(messages)) {
      normalized[phpStrval(field)] = messages.filter(isScalar).map(phpStrval)
    }
  }
  return normalized
}

function intHeader(response: ApiResponse, name: string): number | null {
  const value = response.getHeader(name)
  return value === null || !isNumeric(value) ? null : phpInt(value)
}
