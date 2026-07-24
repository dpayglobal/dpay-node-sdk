import { inspect } from 'node:util'
import { DPayValueError } from '../errors.js'

const PAN = /^\d{12,19}$/
const CVV = /^\d{3,4}$/
const EXPIRY = /^(0[1-9]|1[0-2])\/\d{2}$/

/**
 * Raw card credentials, held only long enough to encrypt them.
 *
 * Redacts itself when logged or serialized, so it never reaches a log sink in clear text.
 * `pan`, `cvv`, and `expiry` are exposed through getters backed by private fields rather than
 * plain enumerable own data properties, so APIs that bypass custom inspection - such as
 * `console.dir(card)` or `Object.keys(card)` - have nothing to dump either.
 */
export class CardData {
  /** Card number, normalized to digits only (spaces stripped). */
  readonly #pan: string
  /** Card verification value, 3-4 digits. */
  readonly #cvv: string
  /** Expiry in `MM/YY` format. */
  readonly #expiry: string

  constructor(params: { pan: string; cvv: string; expiry: string }) {
    const pan = params.pan.replaceAll(' ', '')
    if (!PAN.test(pan)) throw new DPayValueError('Card number must be 12-19 digits')
    if (!CVV.test(params.cvv)) throw new DPayValueError('CVV must be 3-4 digits')
    if (!EXPIRY.test(params.expiry)) throw new DPayValueError('Expiry must be in MM/YY format')
    this.#pan = pan
    this.#cvv = params.cvv
    this.#expiry = params.expiry
    Object.freeze(this)
  }

  /** Card number, normalized to digits only (spaces stripped). */
  get pan(): string {
    return this.#pan
  }

  /** Card verification value, 3-4 digits. */
  get cvv(): string {
    return this.#cvv
  }

  /** Expiry in `MM/YY` format. */
  get expiry(): string {
    return this.#expiry
  }

  private redacted(): { pan: string; cvv: string; expiry: string } {
    return { pan: `****${this.#pan.slice(-4)}`, cvv: '***', expiry: this.#expiry }
  }

  /** Redacted representation - `pan` masked to its last 4 digits, `cvv` fully masked. */
  toJSON(): { pan: string; cvv: string; expiry: string } {
    return this.redacted()
  }

  /** Redacted representation - `pan` masked to its last 4 digits, `cvv` fully masked. */
  toString(): string {
    const { pan, cvv, expiry } = this.redacted()
    return `CardData(pan='${pan}', cvv='${cvv}', expiry='${expiry}')`
  }

  /** Node `util.inspect` hook - delegates to the same redacted `toString()`. */
  [inspect.custom](): string {
    return this.toString()
  }
}
