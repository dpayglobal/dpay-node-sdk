import type { ApiResponse } from '../http/types.js'
import { PANEL } from '../internal/base-urls.js'
import type { ChecksumCalculator } from '../internal/checksum.js'
import { type Operation, decodeJsonOrFail } from '../internal/operation.js'
import { type Bank, parseBank } from './models.js'

export function allBanksOperation(): Operation<Bank[]> {
  return { method: 'GET', host: PANEL, path: '/api/v1/pbl/banks', parse: parseBanks }
}

export function forServiceOperation(
  service: string,
  checksum: ChecksumCalculator,
  timestamp?: number,
): Operation<Bank[]> {
  const body: Record<string, unknown> = {
    service,
    timestamp: timestamp ?? Math.floor(Date.now() / 1000),
  }
  body.checksum = checksum.orderedBody(Object.values(body))
  return { method: 'POST', host: PANEL, path: '/api/v1/pbl/banks', body, parse: parseBanks }
}

function parseBanks(response: ApiResponse): Bank[] {
  const data = decodeJsonOrFail(response)
  const items = Array.isArray(data) ? data : Object.values(data as Record<string, unknown>)
  return items
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && !Array.isArray(item),
    )
    .map(parseBank)
}
