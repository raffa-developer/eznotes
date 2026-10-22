import fs from 'node:fs'

const DURATION_ID = Buffer.from([0x44, 0x89])
const TIMECODE_SCALE_ID = Buffer.from([0x2a, 0xd7, 0xb1])
const DEFAULT_TIMECODE_SCALE_NS = 1_000_000
const HEADER_BYTES = 256 * 1024

export function readWebmDurationSec(file: string): number | null {
  try {
    const size = fs.statSync(file).size
    const length = Math.min(size, HEADER_BYTES)
    if (length < 12) return null
    const buffer = Buffer.allocUnsafe(length)
    const fd = fs.openSync(file, 'r')
    try {
      fs.readSync(fd, buffer, 0, length, 0)
    } finally {
      fs.closeSync(fd)
    }
    return webmDurationSec(buffer)
  } catch {
    return null
  }
}

/**
 * Reads the Segment > Info > Duration element from a WebM header. This is the
 * duration the player will report, and it is enough to tell a complete Opus
 * copy from one that stopped early.
 */
export function webmDurationSec(buffer: Buffer): number | null {
  const scale = readUintElement(buffer, TIMECODE_SCALE_ID)
  const timecodeScale = scale && scale > 0 ? scale : DEFAULT_TIMECODE_SCALE_NS
  const duration = readFloatElement(buffer, DURATION_ID)
  if (duration === null || !Number.isFinite(duration)) return null
  return (duration * timecodeScale) / 1_000_000_000
}

/**
 * A WebM that stops early must not replace the full WAV. Allow a small tail
 * difference for encoder flush/padding, but never accept a 24-minute copy of a
 * 69-minute lecture.
 */
export function isWebmShorterThanWav(
  wavSec: number,
  webmSec: number | null
): boolean {
  if (wavSec <= 0) return false
  const tolerance = Math.max(3, wavSec * 0.01)
  return webmSec === null || webmSec + tolerance < wavSec
}

function readUintElement(buffer: Buffer, id: Buffer): number | null {
  const offset = findElement(buffer, id)
  if (offset < 0) return null
  const size = readVint(buffer, offset + id.length)
  if (!size || size.value < 1 || size.value > 8) return null
  const start = offset + id.length + size.length
  if (start + size.value > buffer.length) return null

  let value = 0
  for (let i = 0; i < size.value; i++) value = value * 256 + buffer[start + i]
  return value
}

function readFloatElement(buffer: Buffer, id: Buffer): number | null {
  const offset = findElement(buffer, id)
  if (offset < 0) return null
  const size = readVint(buffer, offset + id.length)
  if (!size) return null
  const start = offset + id.length + size.length
  if (start + size.value > buffer.length) return null
  if (size.value === 4) return buffer.readFloatBE(start)
  if (size.value === 8) return buffer.readDoubleBE(start)
  return null
}

function findElement(buffer: Buffer, id: Buffer): number {
  let offset = buffer.indexOf(id)
  while (offset >= 0) {
    // An EBML element ID is followed by a valid VINT size.
    if (readVint(buffer, offset + id.length)) return offset
    offset = buffer.indexOf(id, offset + 1)
  }
  return -1
}

function readVint(
  buffer: Buffer,
  offset: number
): { length: number; value: number } | null {
  if (offset >= buffer.length) return null
  const first = buffer[offset]
  if (!first) return null

  let length = 0
  let mask = 0x80
  for (let n = 1; n <= 8; n++) {
    if (first & mask) {
      length = n
      break
    }
    mask >>= 1
  }
  if (!length || offset + length > buffer.length) return null

  let value = first & (0xff >> length)
  for (let i = 1; i < length; i++) value = value * 256 + buffer[offset + i]
  return { length, value }
}
