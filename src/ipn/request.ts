import { DPayValueError, TransportError } from '../errors.js'

/**
 * Reads the exact bytes of an incoming request body.
 * Accepts a WHATWG `Request`, a Node `IncomingMessage`, a string, a Buffer, or a Uint8Array.
 */
export async function readRawBody(request: unknown): Promise<string> {
  if (typeof request === 'string') return request
  if (request instanceof Uint8Array) return Buffer.from(request).toString('utf8')

  if (typeof request !== 'object' || request === null) {
    throw new DPayValueError('Unsupported request object passed to the IPN verifier')
  }

  const candidate = request as { text?: unknown; body?: unknown; [Symbol.asyncIterator]?: unknown }

  if (typeof candidate.text === 'function') {
    try {
      return await (candidate.text as () => Promise<string>)()
    } catch (error) {
      if (error instanceof DPayValueError) {
        throw error
      }
      throw new TransportError('Unable to read the request body', { cause: error })
    }
  }

  if (typeof candidate[Symbol.asyncIterator] === 'function') {
    const chunks: Buffer[] = []
    try {
      for await (const chunk of request as AsyncIterable<Buffer | string>) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk)
      }
    } catch (error) {
      if (error instanceof DPayValueError) {
        throw error
      }
      throw new TransportError('Unable to read the request body', { cause: error })
    }
    const text = Buffer.concat(chunks).toString('utf8')
    if (text === '' && candidate.body !== undefined) {
      throw new DPayValueError(
        'The request body was already consumed by a body parser. ' +
          'Mount the IPN route before express.json(), for example with ' +
          "express.raw({ type: '*/*' }), and pass the raw Buffer instead.",
      )
    }
    return text
  }

  throw new DPayValueError('Unsupported request object passed to the IPN verifier')
}
