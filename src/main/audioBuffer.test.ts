import { describe, expect, it } from 'vitest'
import {
  AudioChunkWriter,
  ByteRingBuffer,
  float32ToPcm16
} from './audioBuffer'

function bytes(values: number[]): Buffer {
  return Buffer.from(values)
}

describe('ByteRingBuffer', () => {
  it('keeps the oldest bytes in order before wrapping', () => {
    const ring = new ByteRingBuffer(8)
    ring.append(bytes([1, 2, 3]))
    ring.append(bytes([4, 5]))
    expect([...ring.tail()]).toEqual([1, 2, 3, 4, 5])
    expect(ring.length).toBe(5)
  })

  it('overwrites the oldest bytes once capacity is reached', () => {
    const ring = new ByteRingBuffer(8)
    ring.append(bytes([1, 2, 3, 4, 5]))
    ring.append(bytes([6, 7, 8, 9]))
    expect(ring.length).toBe(8)
    expect([...ring.tail()]).toEqual([2, 3, 4, 5, 6, 7, 8, 9])
    expect([...ring.tail(3)]).toEqual([7, 8, 9])
  })

  it('keeps the newest bytes when a chunk is larger than capacity', () => {
    const ring = new ByteRingBuffer(4)
    ring.append(bytes([1, 2, 3, 4, 5, 6]))
    expect([...ring.tail()]).toEqual([3, 4, 5, 6])
  })

  it('copies across the wrap point in both directions', () => {
    const ring = new ByteRingBuffer(6)
    ring.append(bytes([1, 2, 3, 4]))
    ring.append(bytes([5, 6, 7]))
    expect([...ring.tail(5)]).toEqual([3, 4, 5, 6, 7])
    expect([...ring.tail(2)]).toEqual([6, 7])
  })

  it('clears without reallocating', () => {
    const ring = new ByteRingBuffer(4)
    ring.append(bytes([1, 2, 3, 4]))
    ring.clear()
    expect(ring.length).toBe(0)
    expect(ring.tail()).toHaveLength(0)
    ring.append(bytes([9]))
    expect([...ring.tail()]).toEqual([9])
  })
})

describe('AudioChunkWriter', () => {
  it('flushes batches in order when the threshold is reached', () => {
    const writes: Buffer[] = []
    const writer = new AudioChunkWriter((chunk) => writes.push(Buffer.from(chunk)), 8)

    writer.push(bytes([1, 2, 3]))
    writer.push(bytes([4, 5]))
    expect(writes).toHaveLength(0)
    expect(writer.pendingBytes).toBe(5)

    writer.push(bytes([6, 7, 8]))
    expect(writer.pendingBytes).toBe(0)
    expect(writes).toHaveLength(1)
    expect([...writes[0]]).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(writer.totalBytes).toBe(8)
  })

  it('flushes a partial batch on demand', () => {
    const writes: Buffer[] = []
    const writer = new AudioChunkWriter((chunk) => writes.push(Buffer.from(chunk)), 1024)

    writer.push(bytes([1, 2, 3]))
    writer.flush()
    writer.flush()
    expect(writes).toHaveLength(1)
    expect([...writes[0]]).toEqual([1, 2, 3])
  })

  it('retains pending data when a write fails', () => {
    let fail = true
    const writer = new AudioChunkWriter(() => {
      if (fail) throw new Error('disk full')
    }, 1024)

    writer.push(bytes([1, 2, 3]))
    expect(() => writer.flush()).toThrow('disk full')
    expect(writer.pendingBytes).toBe(3)

    fail = false
    writer.flush()
    expect(writer.pendingBytes).toBe(0)
  })
})

describe('float32ToPcm16', () => {
  it('converts and clamps microphone samples', () => {
    const input = new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2])
    const result = float32ToPcm16(input.buffer)

    expect(result.samples).toBe(7)
    expect(result.pcm.length).toBe(14)
    expect(result.pcm.readInt16LE(0)).toBe(0)
    expect(result.pcm.readInt16LE(2)).toBe(16384)
    expect(result.pcm.readInt16LE(4)).toBe(-16383)
    expect(result.pcm.readInt16LE(6)).toBe(32767)
    expect(result.pcm.readInt16LE(8)).toBe(-32767)
    expect(result.pcm.readInt16LE(10)).toBe(32767)
    expect(result.pcm.readInt16LE(12)).toBe(-32767)
    expect(result.sumSquares).toBeCloseTo(4.5)
  })

  it('returns an empty chunk for incomplete samples', () => {
    const result = float32ToPcm16(new ArrayBuffer(3))
    expect(result.samples).toBe(0)
    expect(result.pcm).toHaveLength(0)
  })
})
