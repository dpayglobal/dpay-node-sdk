import { createHash } from 'node:crypto'
import { phpStrval } from './php.js'

export class ChecksumCalculator {
  private readonly secretHash: string

  constructor(secretHash: string) {
    this.secretHash = secretHash
  }

  secretSecond(service: string, fields: readonly unknown[]): string {
    const parts = [service, this.secretHash, ...fields.map(phpStrval)]
    return sha256(parts.join('|'))
  }

  orderedBody(values: readonly unknown[]): string {
    const joined = values.map(phpStrval).join('|')
    return sha256(`${joined}|${this.secretHash}`)
  }
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}
