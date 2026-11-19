import fs from 'node:fs'

export const LOW_DISK_BYTES = 512 * 1024 * 1024
export const CRITICAL_DISK_BYTES = 128 * 1024 * 1024

export type DiskLevel = 'ok' | 'low' | 'critical' | 'unknown'

export function freeDiskBytes(dir: string): number | null {
  try {
    const stats = fs.statfsSync(dir)
    const free = Number(stats.bavail) * Number(stats.bsize)
    return Number.isFinite(free) && free >= 0 ? free : null
  } catch {
    return null
  }
}

export function diskSpaceLevel(freeBytes: number | null): DiskLevel {
  if (freeBytes === null) return 'unknown'
  if (freeBytes <= CRITICAL_DISK_BYTES) return 'critical'
  if (freeBytes <= LOW_DISK_BYTES) return 'low'
  return 'ok'
}

export function megabytes(bytes: number): number {
  return Math.max(0, Math.round(bytes / 1024 / 1024))
}
