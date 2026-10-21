import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export const MAX_LOG_BYTES = 2 * 1024 * 1024

export function log(scope: string, message: string, data?: unknown): void {
  const suffix = data === undefined ? '' : ` ${safeJson(data)}`
  const line = `${new Date().toISOString()} [${scope}] ${message}${suffix}`
  console.log(line)
  try {
    const file = path.join(app.getPath('userData'), 'eznotes.log')
    rotateLogFile(file)
    fs.appendFileSync(file, `${line}\n`)
  } catch {
    // Logging must never break the app.
  }
}

/**
 * Keeps the log bounded: when it reaches `maxBytes`, the current file becomes
 * `eznotes.log.1` (replacing the previous rotation) and a new file is started.
 */
export function rotateLogFile(file: string, maxBytes = MAX_LOG_BYTES): boolean {
  try {
    const { size } = fs.statSync(file)
    if (size < maxBytes) return false

    const previous = `${file}.1`
    fs.rmSync(previous, { force: true })
    fs.renameSync(file, previous)
    return true
  } catch {
    return false
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
