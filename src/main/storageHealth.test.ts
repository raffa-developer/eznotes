import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CRITICAL_DISK_BYTES,
  diskSpaceLevel,
  freeDiskBytes,
  LOW_DISK_BYTES,
  megabytes
} from './storageHealth'

describe('disk health', () => {
  it('classifies free space thresholds', () => {
    expect(diskSpaceLevel(null)).toBe('unknown')
    expect(diskSpaceLevel(0)).toBe('critical')
    expect(diskSpaceLevel(CRITICAL_DISK_BYTES)).toBe('critical')
    expect(diskSpaceLevel(CRITICAL_DISK_BYTES + 1)).toBe('low')
    expect(diskSpaceLevel(LOW_DISK_BYTES)).toBe('low')
    expect(diskSpaceLevel(LOW_DISK_BYTES + 1)).toBe('ok')
    expect(diskSpaceLevel(1024 ** 4)).toBe('ok')
  })

  it('reads free space from an existing directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eznotes-disk-'))
    try {
      const free = freeDiskBytes(dir)
      expect(free === null || free > 0).toBe(true)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns null for a missing directory', () => {
    expect(freeDiskBytes(path.join(os.tmpdir(), 'eznotes-missing-xyz'))).toBeNull()
  })

  it('formats disk sizes for messages', () => {
    expect(megabytes(512 * 1024 * 1024)).toBe(512)
    expect(megabytes(-1)).toBe(0)
  })
})
