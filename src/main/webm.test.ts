import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readWebmDurationSec, isWebmShorterThanWav, webmDurationSec } from './webm'

const tempDirs: string[] = []

function header(duration: number): Buffer {
  return Buffer.concat([
    Buffer.from([0x2a, 0xd7, 0xb1, 0x84, 0x00, 0x0f, 0x42, 0x40]),
    Buffer.from([0x44, 0x89, 0x88]),
    (() => {
      const value = Buffer.alloc(8)
      value.writeDoubleBE(duration)
      return value
    })()
  ])
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('webmDurationSec', () => {
  it('reads the segment duration in milliseconds', () => {
    expect(webmDurationSec(header(1_470_840))).toBeCloseTo(1_470.84, 2)
  })

  it('returns null when the header has no duration element', () => {
    expect(webmDurationSec(Buffer.alloc(64))).toBeNull()
  })
})

describe('readWebmDurationSec', () => {
  it('reads the duration from a file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eznotes-webm-test-'))
    tempDirs.push(dir)
    const file = path.join(dir, 'audio.webm')
    fs.writeFileSync(file, header(90_000))

    expect(readWebmDurationSec(file)).toBeCloseTo(90, 2)
  })
})

describe('isWebmShorterThanWav', () => {
  it('detects a truncated copy', () => {
    expect(isWebmShorterThanWav(4_161, 1_470.84)).toBe(true)
    expect(isWebmShorterThanWav(60, null)).toBe(true)
  })

  it('accepts small encoder-tail differences', () => {
    expect(isWebmShorterThanWav(60, 59)).toBe(false)
    expect(isWebmShorterThanWav(60, 57.5)).toBe(false)
  })

  it('does not claim a WAV is longer when its duration is unknown', () => {
    expect(isWebmShorterThanWav(0, 30)).toBe(false)
  })
})
