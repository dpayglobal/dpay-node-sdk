import { DPayValueError } from '../errors.js'

export type BaseUrlKey = 'apiPayments' | 'panel' | 'gateway'

export const API_PAYMENTS: BaseUrlKey = 'apiPayments'
export const PANEL: BaseUrlKey = 'panel'
export const GATEWAY: BaseUrlKey = 'gateway'

export const DEFAULT_BASE_URLS: Record<BaseUrlKey, string> = {
  apiPayments: 'https://api-payments.dpay.pl',
  panel: 'https://panel.dpay.pl',
  gateway: 'https://secure.dpay.pl',
}

export class BaseUrls {
  private readonly urls: Record<string, string>

  constructor(overrides: Readonly<Record<string, string>> = {}) {
    for (const key of Object.keys(overrides)) {
      if (!Object.hasOwn(DEFAULT_BASE_URLS, key)) throw new DPayValueError(`Unknown base URL key "${key}"`)
    }
    this.urls = { ...DEFAULT_BASE_URLS }
    for (const [key, url] of Object.entries(overrides)) {
      this.urls[key] = url.replace(/\/+$/, '')
    }
  }

  resolve(host: BaseUrlKey): string {
    const url = this.urls[host]
    if (!Object.hasOwn(this.urls, host) || url === undefined)
      throw new DPayValueError(`Unknown API host "${host}"`)
    return url
  }
}
