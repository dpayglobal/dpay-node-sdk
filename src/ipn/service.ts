import type { Config } from '../config.js'
import type { IpnEvent } from './event.js'
import { readRawBody } from './request.js'
import { constructIpnEvent } from './verifier.js'

/** Verifies IPN notifications dpay posts to your server after a payment event. */
export class IpnService {
  private readonly config: Config

  constructor(config: Config) {
    this.config = config
  }

  /** Verifies an IPN body. Uses the client's `secretHash` unless one is given. */
  constructEvent(rawBody: string | Uint8Array, secretHash?: string): IpnEvent {
    return constructIpnEvent(rawBody, secretHash ?? this.config.secretHash)
  }

  /** Reads and verifies an IPN straight from an incoming HTTP request. */
  async constructEventFromRequest(request: unknown, secretHash?: string): Promise<IpnEvent> {
    return constructIpnEvent(await readRawBody(request), secretHash ?? this.config.secretHash)
  }
}
