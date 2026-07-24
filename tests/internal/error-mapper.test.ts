import { describe, expect, it } from 'vitest'
import {
  AccessDeniedError,
  ApiError,
  ApiServerError,
  AuthenticationError,
  InvalidRequestError,
  NotFoundError,
  RateLimitError,
} from '../../src/errors.js'
import { ApiResponse } from '../../src/http/types.js'
import { mapError } from '../../src/internal/error-mapper.js'

const json = (status: number, body: unknown, headers: Record<string, string> = {}): ApiResponse =>
  new ApiResponse(status, headers, JSON.stringify(body))

describe('mapError', () => {
  it('maps every status to its class', () => {
    expect(mapError(json(401, {}))).toBeInstanceOf(AuthenticationError)
    expect(mapError(json(400, {}))).toBeInstanceOf(InvalidRequestError)
    expect(mapError(json(422, {}))).toBeInstanceOf(InvalidRequestError)
    expect(mapError(json(403, {}))).toBeInstanceOf(AccessDeniedError)
    expect(mapError(json(404, {}))).toBeInstanceOf(NotFoundError)
    expect(mapError(json(429, {}))).toBeInstanceOf(RateLimitError)
    expect(mapError(json(500, {}))).toBeInstanceOf(ApiServerError)
    expect(mapError(json(503, {}))).toBeInstanceOf(ApiServerError)
    const fallback = mapError(json(418, {}))
    expect(fallback).toBeInstanceOf(ApiError)
    expect(fallback.type).toBe('api_error')
  })

  it('prefers message over msg and falls back when neither is a string', () => {
    expect(mapError(json(400, { message: 'a', msg: 'b' })).message).toBe('a')
    expect(mapError(json(400, { msg: 'b' })).message).toBe('b')
    expect(mapError(json(400, { message: 42 })).message).toBe('Unexpected API error')
    expect(mapError(new ApiResponse(500, {}, 'not json')).message).toBe('Unexpected API error')
  })

  it('reads the business error code', () => {
    expect(mapError(json(403, { errorcode: 'err01' })).errorCode).toBe('err01')
    expect(mapError(json(403, { errorcode: 7 })).errorCode).toBeNull()
  })

  it('normalizes both field error formats into arrays', () => {
    expect(mapError(json(400, { errors: { value: 'is required' } })).fieldErrors).toEqual({
      value: ['is required'],
    })
    expect(mapError(json(422, { errors: { value: ['too low', 'not a number'] } })).fieldErrors).toEqual({
      value: ['too low', 'not a number'],
    })
    expect(mapError(json(422, { errors: ['first', 'second'] })).fieldErrors).toEqual({
      '0': ['first'],
      '1': ['second'],
    })
    expect(mapError(json(400, { errors: 'nope' })).fieldErrors).toEqual({})
    expect(mapError(json(400, { errors: { value: [1, {}, 'ok'] } })).fieldErrors).toEqual({
      value: ['1', 'ok'],
    })
  })

  it('reads rate limit headers', () => {
    const error = mapError(
      json(
        429,
        { message: 'slow down' },
        {
          'Retry-After': '30',
          'X-RateLimit-Limit': '100',
          'X-RateLimit-Remaining': '0',
        },
      ),
    ) as RateLimitError
    expect(error.retryAfter).toBe(30)
    expect(error.limit).toBe(100)
    expect(error.remaining).toBe(0)
  })

  it('leaves rate limit metadata null when the headers are absent', () => {
    const error = mapError(json(429, {})) as RateLimitError
    expect(error.retryAfter).toBeNull()
    expect(error.limit).toBeNull()
  })

  it('always keeps the raw body', () => {
    expect(mapError(new ApiResponse(500, {}, 'boom')).rawBody).toBe('boom')
  })

  it('treats non-numeric Retry-After as null', () => {
    const error = mapError(
      json(
        429,
        { message: 'slow down' },
        {
          'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT',
        },
      ),
    ) as RateLimitError
    expect(error.retryAfter).toBeNull()
  })

  it('treats numeric Retry-After of 0 as 0 not null', () => {
    const error = mapError(
      json(
        429,
        { message: 'slow down' },
        {
          'Retry-After': '0',
        },
      ),
    ) as RateLimitError
    expect(error.retryAfter).toBe(0)
  })

  it('treats non-numeric rate limit headers as null', () => {
    const error = mapError(
      json(
        429,
        { message: 'slow down' },
        {
          'X-RateLimit-Limit': 'unlimited',
        },
      ),
    ) as RateLimitError
    expect(error.limit).toBeNull()
  })
})
