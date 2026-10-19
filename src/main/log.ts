import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export function log(scope: string, message: string, data?: unknown): void {
  const suffix = data === undefined ? '' : ` ${safeJson(data)}`
  const line = `${new Date().toISOString()} [${scope}] ${message}${suffix}`
  console.log(line)
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'aula.log'), `${line}\n`)
  } catch {
    // Logging must never break the app.
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
