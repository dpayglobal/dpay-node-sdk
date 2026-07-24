const PRECISION = 14
const INTEGER_FAST_PATH_LIMIT = 10 ** PRECISION

export function isPhpInt(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value)
}

export function isPhpBool(value: unknown): boolean {
  return typeof value === 'boolean'
}

export function isScalar(value: unknown): boolean {
  const type = typeof value
  return type === 'number' || type === 'boolean' || type === 'string'
}

const PHP_WHITESPACE = String.raw`[ \t\n\r\v\f]`
const PHP_NUMBER_GRAMMAR = String.raw`(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?`
const PHP_NUMERIC_STRING = new RegExp(`^${PHP_WHITESPACE}*[+-]?${PHP_NUMBER_GRAMMAR}${PHP_WHITESPACE}*$`)
const PHP_LEADING_NUMBER = new RegExp(`^${PHP_WHITESPACE}*([+-]?${PHP_NUMBER_GRAMMAR})`)

export function isNumeric(value: unknown): boolean {
  if (typeof value === 'number') return true
  if (typeof value !== 'string') return false
  return PHP_NUMERIC_STRING.test(value)
}

export function phpStrval(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? '1' : ''
  if (typeof value === 'number') return numberToPhpString(value)
  if (typeof value === 'string') return value
  return String(value)
}

function numberToPhpString(value: number): string {
  if (Number.isNaN(value)) return 'NAN'
  if (value === Number.POSITIVE_INFINITY) return 'INF'
  if (value === Number.NEGATIVE_INFINITY) return '-INF'
  if (Object.is(value, -0)) return '-0'
  if (Number.isInteger(value) && Math.abs(value) < INTEGER_FAST_PATH_LIMIT) return String(value)
  return formatG(value)
}

function formatG(value: number): string {
  const exponent = Number(value.toExponential(PRECISION - 1).split('e')[1])
  if (exponent < -4 || exponent >= PRECISION) {
    const mantissa = stripTrailingZeros(value.toExponential(PRECISION - 1).split('e')[0] as string)
    const normalized = mantissa.includes('.') ? mantissa : `${mantissa}.0`
    return `${normalized}E${exponent < 0 ? '-' : '+'}${Math.abs(exponent)}`
  }
  return stripTrailingZeros(value.toFixed(Math.max(0, PRECISION - 1 - exponent)))
}

function stripTrailingZeros(text: string): string {
  if (!text.includes('.')) return text
  return text.replace(/\.?0+$/, '')
}

export function phpRound(value: number): number {
  return value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5)
}

function clampToSafeInt(value: number): number {
  if (!Number.isFinite(value)) return 0
  const truncated = Math.trunc(value)
  if (truncated > Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER
  if (truncated < Number.MIN_SAFE_INTEGER) return Number.MIN_SAFE_INTEGER
  if (truncated === 0) return 0
  return truncated
}

export function phpInt(value: unknown): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') return clampToSafeInt(value)
  if (typeof value === 'string') return clampToSafeInt(leadingNumber(value))
  return 0
}

function leadingNumber(text: string): number {
  const match = PHP_LEADING_NUMBER.exec(text)
  return match === null ? 0 : Number(match[1] as string)
}

export function phpJsonEncode(data: unknown, options?: { escapeSlashes?: boolean }): string {
  const encoded = JSON.stringify(data, (_key, value: unknown) => {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new TypeError('Value is not JSON encodable')
    }
    return value
  })
  if (encoded === undefined) throw new TypeError('Value is not JSON encodable')
  return options?.escapeSlashes === true ? encoded.replaceAll('/', '\\/') : encoded
}
