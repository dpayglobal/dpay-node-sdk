import { constants, createPublicKey, publicEncrypt } from 'node:crypto'
import { CardEncryptionError } from '../errors.js'
import { phpJsonEncode } from '../internal/php.js'
import type { CardData } from './card-data.js'

/** Encrypts card credentials with the rotating RSA key from `cards.publicKey()`. */
export class CardEncryptor {
  /**
   * Returns the Base64 payload to put in `encryptedCardData`.
   * Fetch the public key immediately before every attempt - dpay rotates it.
   */
  encrypt(card: CardData, transactionId: string, publicKeyPem: string): string {
    let key: ReturnType<typeof createPublicKey>
    try {
      key = createPublicKey(publicKeyPem)
    } catch (error) {
      throw new CardEncryptionError('Invalid RSA public key', { cause: error })
    }

    const payload = phpJsonEncode(
      {
        PN: card.pan,
        SC: card.cvv,
        DT: card.expiry,
        ID: transactionId,
        TX: Math.floor(Date.now() / 1000),
      },
      { escapeSlashes: true },
    )

    try {
      return publicEncrypt(
        { key, padding: constants.RSA_PKCS1_PADDING },
        Buffer.from(payload, 'utf8'),
      ).toString('base64')
    } catch (error) {
      throw new CardEncryptionError('Card data encryption failed', { cause: error })
    }
  }
}
