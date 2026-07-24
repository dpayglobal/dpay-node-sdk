import { Currency, assertCurrency, isValidCurrency } from './currency.js'
import { DPayValueError } from './errors.js'
import { phpRound } from './internal/php.js'

const DECIMAL = /^(-?)(\d+)(?:\.(\d{1,2}))?$/

/** A monetary amount held in minor units, never as a float. */
export class Money {
  /** Amount in minor units, for example 1050 for 10.50 PLN. */
  readonly minor: number
  /** Three-letter currency code. */
  readonly currency: string

  private constructor(minor: number, currency: string) {
    if (!Number.isSafeInteger(minor)) {
      throw new DPayValueError('Money amount must be a safe integer number of minor units')
    }
    this.minor = minor
    this.currency = currency
    Object.freeze(this)
  }

  /** Amount in Polish grosz, for example `Money.pln(1050)` is 10.50 PLN. */
  static pln(minor: number): Money {
    return new Money(minor, Currency.PLN)
  }

  /** Amount in minor units of an arbitrary currency. */
  static of(minor: number, currency: string): Money {
    assertCurrency(currency)
    return new Money(minor, currency)
  }

  /** Parses a decimal string with at most two fraction digits. */
  static fromDecimal(decimal: string, currency: string): Money {
    assertCurrency(currency)
    const parsed = parseDecimal(decimal)
    if (parsed === null) throw new DPayValueError(`Invalid money amount "${decimal}"`)
    return new Money(parsed, currency)
  }

  /** Parses whatever shape the API used for this field. Throws on anything unparsable. */
  static fromApiNumber(value: unknown, currency: string): Money {
    const money = Money.tryFromApiNumber(value, currency)
    if (money === null) throw new DPayValueError('Money value must be a number or a decimal string')
    return money
  }

  /** Same as `fromApiNumber`, but returns null instead of throwing. */
  static tryFromApiNumber(value: unknown, currency: string): Money | null {
    if (!isValidCurrency(currency)) return null
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return null
      const minor = phpRound(value * 100)
      return Number.isSafeInteger(minor) ? new Money(minor, currency) : null
    }
    if (typeof value === 'string') {
      const parsed = parseDecimal(value)
      if (parsed === null || !Number.isSafeInteger(parsed)) return null
      return new Money(parsed, currency)
    }
    return null
  }

  /** Renders the amount as a decimal string with exactly two fraction digits. */
  toDecimal(): string {
    const absolute = Math.abs(this.minor)
    const sign = this.minor < 0 ? '-' : ''
    const fraction = String(absolute % 100).padStart(2, '0')
    return `${sign}${Math.floor(absolute / 100)}.${fraction}`
  }

  get isNegative(): boolean {
    return this.minor < 0
  }

  equals(other: Money): boolean {
    return this.minor === other.minor && this.currency === other.currency
  }

  toString(): string {
    return `${this.toDecimal()} ${this.currency}`
  }

  toJSON(): { minor: number; currency: string } {
    return { minor: this.minor, currency: this.currency }
  }
}

function parseDecimal(decimal: string): number | null {
  const match = DECIMAL.exec(decimal)
  if (match === null) return null
  const fraction = (match[3] ?? '').padEnd(2, '0')
  const minor = Number(match[2]) * 100 + Number(fraction)
  return match[1] === '-' ? -minor : minor
}
