import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const APP_NAME = 'ezNotes'

export function migrateUserData(): void {
  app.setName(APP_NAME)

  const appData = process.env.APPDATA || app.getPath('appData')
  const legacy = path.join(appData, 'aula')
  const current = path.join(appData, APP_NAME)

  if (!fs.existsSync(current) && fs.existsSync(legacy)) {
    try {
      fs.renameSync(legacy, current)
    } catch {
      try {
        fs.mkdirSync(current, { recursive: true })
        for (const name of [
          'settings.json',
          'schedule.json',
          'secrets.json',
          'recordings',
          'cache',
          'aula.log'
        ]) {
          copyIfExists(path.join(legacy, name), path.join(current, name))
        }
      } catch {
        app.setPath('userData', legacy)
        return
      }
    }
  } else if (!fs.existsSync(current)) {
    fs.mkdirSync(current, { recursive: true })
  } else if (fs.existsSync(legacy)) {
    // A previous run may have created the new folder before all data moved.
    for (const name of ['settings.json', 'schedule.json', 'secrets.json', 'recordings']) {
      const destination = path.join(current, name)
      if (!fs.existsSync(destination)) {
        copyIfExists(path.join(legacy, name), destination)
      }
    }
  }

  app.setPath('userData', current)
  renameLog(current)
}

function copyIfExists(source: string, destination: string): void {
  if (!fs.existsSync(source)) return
  try {
    fs.cpSync(source, destination, { recursive: true, force: false, errorOnExist: false })
  } catch {
    // Keep the legacy location usable if a file is locked.
  }
}

function renameLog(userData: string): void {
  const legacyLog = path.join(userData, 'aula.log')
  const currentLog = path.join(userData, 'eznotes.log')
  if (fs.existsSync(legacyLog) && !fs.existsSync(currentLog)) {
    try {
      fs.renameSync(legacyLog, currentLog)
    } catch {
      // Non-critical.
    }
  }
}
