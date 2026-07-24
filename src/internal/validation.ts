import { DPayValueError } from '../errors.js'

const EMAIL = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

export function isValidUrl(url: string): boolean {
  if (url === '') return false
  for (const char of url) {
    const code = char.charCodeAt(0)
    if (code <= 0x20 || code === 0x7f) return false
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return parsed.protocol !== '' && parsed.host !== ''
}

export function isValidEmail(email: string): boolean {
  return EMAIL.test(email)
}

export function isValidDate(date: string): boolean {
  return DATE.test(date)
}

export function assertDate(date: string): string {
  if (!isValidDate(date)) throw new DPayValueError(`Date "${date}" must be in YYYY-MM-DD format`)
  return date
}
