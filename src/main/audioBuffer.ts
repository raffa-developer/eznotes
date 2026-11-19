/**
 * A fixed-size byte ring used for the live-transcription window. Appending never
 * allocates or copies the existing contents; only `tail()` materialises the
 * requested slice.
 */
export class ByteRingBuffer {
  private readonly storage: Buffer
  private writeOffset = 0
  private storedBytes = 0

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error('ByteRingBuffer capacity must be a positive integer.')
    }
    this.storage = Buffer.allocUnsafe(capacity)
  }

  get capacityBytes(): number {
    return this.storage.length
  }

  get length(): number {
    return this.storedBytes
  }

  clear(): void {
    this.writeOffset = 0
    this.storedBytes = 0
  }

  append(chunk: Buffer): void {
    if (!chunk.length) return

    if (chunk.length >= this.storage.length) {
      chunk.copy(this.storage, 0, chunk.length - this.storage.length)
      this.writeOffset = 0
      this.storedBytes = this.storage.length
      return
    }

    const first = Math.min(chunk.length, this.storage.length - this.writeOffset)
    chunk.copy(this.storage, this.writeOffset, 0, first)
    if (first < chunk.length) {
      chunk.copy(this.storage, 0, first)
    }

    this.writeOffset = (this.writeOffset + chunk.length) % this.storage.length
    this.storedBytes = Math.min(
      this.storage.length,
      this.storedBytes + chunk.length
    )
  }

  tail(maxBytes = this.storedBytes): Buffer {
    const count = Math.max(0, Math.min(this.storedBytes, maxBytes))
    if (!count) return Buffer.alloc(0)

    const start =
      (this.writeOffset - count + this.storage.length) %
      this.storage.length
    const result = Buffer.allocUnsafe(count)
    const first = Math.min(count, this.storage.length - start)
    this.storage.copy(result, 0, start, start + first)
    if (first < count) {
      this.storage.copy(result, first, 0, count - first)
    }
    return result
  }
}

/**
 * Batches audio chunks into fewer disk writes while preserving byte order.
 * Call `flush()` at checkpoints and before closing the file.
 */
export class AudioChunkWriter {
  private chunks: Buffer[] = []
  private pending = 0
  private written = 0

  constructor(
    private readonly write: (chunk: Buffer) => void,
    private readonly maxBatchBytes = 16 * 1024
  ) {
    if (!Number.isInteger(maxBatchBytes) || maxBatchBytes < 1) {
      throw new Error('Audio batch size must be a positive integer.')
    }
  }

  get totalBytes(): number {
    return this.written
  }

  get pendingBytes(): number {
    return this.pending
  }

  push(chunk: Buffer): void {
    if (!chunk.length) return
    this.chunks.push(chunk)
    this.pending += chunk.length
    this.written += chunk.length
    if (this.pending >= this.maxBatchBytes) this.flush()
  }

  flush(): void {
    if (!this.pending) return

    const batch =
      this.chunks.length === 1
        ? this.chunks[0]
        : Buffer.concat(this.chunks, this.pending)
    this.write(batch)
    this.chunks = []
    this.pending = 0
  }
}

export interface Pcm16Chunk {
  pcm: Buffer
  samples: number
  sumSquares: number
}

/** Convert interleaved float32 microphone samples to 16-bit little-endian PCM. */
export function float32ToPcm16(input: ArrayBuffer): Pcm16Chunk {
  const samples = Math.floor(input.byteLength / 4)
  const pcm = Buffer.allocUnsafe(samples * 2)
  const floats = new Float32Array(input, 0, samples)
  let sumSquares = 0

  for (let i = 0; i < samples; i++) {
    const value = Math.max(-1, Math.min(1, floats[i]))
    sumSquares += value * value
    pcm.writeInt16LE(Math.round(value * 32767), i * 2)
  }

  return { pcm, samples, sumSquares }
}
