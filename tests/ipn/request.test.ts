import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { DPayValueError, TransportError } from '../../src/errors.js'
import { readRawBody } from '../../src/ipn/request.js'

describe('readRawBody', () => {
  it('reads a WHATWG Request', async () => {
    expect(await readRawBody(new Request('https://shop.test/ipn', { method: 'POST', body: '{"a":1}' }))).toBe(
      '{"a":1}',
    )
  })

  it('reads a Node IncomingMessage-shaped stream', async () => {
    const stream = Readable.from([Buffer.from('{"a":'), Buffer.from('1}')])
    expect(await readRawBody(stream)).toBe('{"a":1}')
  })

  it('passes a string or a Buffer through', async () => {
    expect(await readRawBody('{"a":1}')).toBe('{"a":1}')
    expect(await readRawBody(Buffer.from('{"a":1}'))).toBe('{"a":1}')
  })

  it('explains the express.json trap when the stream was already consumed', async () => {
    const consumed = Object.assign(Readable.from([]), { body: { a: 1 } })
    await expect(readRawBody(consumed)).rejects.toThrow(/express\.raw/)
    await expect(readRawBody(consumed)).rejects.toBeInstanceOf(DPayValueError)
  })

  it('rejects something that is not a request at all', async () => {
    await expect(readRawBody(42)).rejects.toThrow('Unsupported request object')
  })

  it('wraps a WHATWG Request body-already-read error in TransportError', async () => {
    const request = new Request('https://shop.test/ipn', { method: 'POST', body: '{"a":1}' })
    await request.text() // consume the body
    await expect(readRawBody(request)).rejects.toBeInstanceOf(TransportError)
    const error = await readRawBody(request).catch((e) => e)
    expect(error).toBeInstanceOf(TransportError)
    expect(error.cause).toBeDefined()
    expect(error.message).toContain('Unable to read the request body')
  })

  it('wraps a Node stream error in TransportError', async () => {
    const errorStream = Readable.from(
      (async function* () {
        yield Buffer.from('x')
        throw new Error('socket boom')
      })(),
    )
    await expect(readRawBody(errorStream)).rejects.toBeInstanceOf(TransportError)
    const error = await readRawBody(errorStream).catch((e) => e)
    expect(error).toBeInstanceOf(TransportError)
    expect(error.cause?.message).toBe('socket boom')
    expect(error.message).toContain('Unable to read the request body')
  })

  it('preserves DPayValueError for already-consumed stream with .body present', async () => {
    const consumed = Object.assign(Readable.from([]), { body: { a: 1 } })
    await expect(readRawBody(consumed)).rejects.toBeInstanceOf(DPayValueError)
    await expect(readRawBody(consumed)).rejects.not.toBeInstanceOf(TransportError)
    await expect(readRawBody(consumed)).rejects.toThrow(/express\.raw/)
  })
})
