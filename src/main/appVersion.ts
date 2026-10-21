import { app } from 'electron'

export function userAgent(): string {
  return `ezNotes/${app.getVersion()}`
}
