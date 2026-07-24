import { ApiServerError } from '../errors.js'
import type { ApiResponse } from '../http/types.js'
import type { BaseUrlKey } from './base-urls.js'

export interface Operation<T> {
  readonly method: 'GET' | 'POST'
  readonly host: BaseUrlKey
  readonly path: string
  readonly parse: (response: ApiResponse) => T
  readonly body?: Record<string, unknown>
  readonly raiseForStatus?: boolean
}

export function decodeJsonOrFail(response: ApiResponse): unknown {
  const data = response.decodeJson()
  if (data === null) {
    throw new ApiServerError('Invalid JSON in API response', response.status, null, {}, response.body)
  }
  return data
}

export function decodeRecordOrFail(response: ApiResponse): Record<string, unknown> {
  const data = decodeJsonOrFail(response)
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {}
}

export function decodeArrayOrFail(response: ApiResponse): unknown[] {
  const data = decodeJsonOrFail(response)
  return Array.isArray(data) ? data : []
}
