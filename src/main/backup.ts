import fs from 'node:fs'
import path from 'node:path'
import type { Schedule, Settings } from '../shared/types'
import { listNotes, rescanNotes } from './notes'
import { readJson, writeJson } from './store'

export interface BackupManifest {
  format: 'eznotes-backup'
  version: 1
  createdAt: string
  noteCount: number
  recordingIds: string[]
  settings: Settings
}

export interface BackupOutcome {
  path: string
  noteCount: number
  audioCount: number
}

export interface RestoreOutcome {
  notesDir: string
  noteCount: number
  audioCount: number
  warnings: string[]
  settings: Settings
  schedule: Schedule | null
}

const FORMAT = 'eznotes-backup'

export async function createBackup(
  parentDir: string,
  notesDir: string,
  userDataDir: string,
  settings: Settings,
  includeAudio: boolean
): Promise<BackupOutcome> {
  if (!fs.existsSync(parentDir)) {
    throw new Error('Choose an existing folder for the backup.')
  }

  const target = uniqueDirectory(
    parentDir,
    `ezNotes backup ${fileTimestamp()}`
  )
  if (isInside(notesDir, target)) {
    throw new Error('Choose a backup folder outside the notes folder.')
  }
  const notes = listNotes(notesDir)
  const recordingIds = includeAudio
    ? [
        ...new Set(
          notes
            .filter((note) => note.hasAudio && note.recordingId)
            .map((note) => note.recordingId as string)
        )
      ]
    : []
  const schedule = readOptionalFile(path.join(userDataDir, 'schedule.json'))

  try {
    fs.mkdirSync(path.join(target, 'app'), { recursive: true })
    await copyDirectoryContents(notesDir, path.join(target, 'notes'))

    if (schedule) {
      fs.writeFileSync(
        path.join(target, 'app', 'schedule.json'),
        schedule,
        'utf8'
      )
    }

    writeJson(path.join(target, 'app', 'settings.json'), {
      ...settings,
      notesDir: '',
      obsidianVault: '',
      microphoneId: null
    })

    let audioCount = 0
    for (const recordingId of recordingIds) {
      const source = path.join(userDataDir, 'recordings', recordingId)
      if (!fs.existsSync(source)) continue
      await fs.promises.cp(source, path.join(target, 'audio', recordingId), {
        recursive: true
      })
      audioCount += 1
    }

    const manifest: BackupManifest = {
      format: FORMAT,
      version: 1,
      createdAt: new Date().toISOString(),
      noteCount: notes.length,
      recordingIds,
      settings: {
        ...settings,
        notesDir: '',
        obsidianVault: '',
        microphoneId: null
      }
    }
    writeJson(path.join(target, 'manifest.json'), manifest)
    return { path: target, noteCount: notes.length, audioCount }
  } catch (error) {
    fs.rmSync(target, { recursive: true, force: true })
    throw error
  }
}

export function inspectBackup(backupDir: string): BackupManifest {
  const manifest = readJson<BackupManifest | null>(
    path.join(backupDir, 'manifest.json'),
    null
  )
  if (!manifest || manifest.format !== FORMAT || manifest.version !== 1) {
    throw new Error('That folder is not an ezNotes backup.')
  }
  if (
    typeof manifest.noteCount !== 'number' ||
    !Array.isArray(manifest.recordingIds) ||
    !manifest.settings
  ) {
    throw new Error('The backup manifest is incomplete.')
  }

  const notes = path.join(backupDir, 'notes')
  if (manifest.noteCount > 0 && !fs.existsSync(notes)) {
    throw new Error('The backup is missing its notes folder.')
  }
  if (!fs.existsSync(path.join(backupDir, 'app', 'settings.json'))) {
    throw new Error('The backup is missing its app settings.')
  }
  const settings = readJson<Settings | null>(
    path.join(backupDir, 'app', 'settings.json'),
    null
  )
  if (!settings) {
    throw new Error('The backup settings could not be read.')
  }
  const scheduleFile = path.join(backupDir, 'app', 'schedule.json')
  if (fs.existsSync(scheduleFile)) {
    const schedule = readJson<Schedule | null>(scheduleFile, null)
    if (!schedule) throw new Error('The backup schedule could not be read.')
  }
  for (const recordingId of manifest.recordingIds) {
    if (!/^[A-Za-z0-9_-]+$/.test(recordingId)) {
      throw new Error('The backup contains an invalid audio reference.')
    }
  }
  return manifest
}

export async function restoreBackup(
  backupDir: string,
  parentDir: string,
  currentRecordingsDir: string
): Promise<RestoreOutcome> {
  const manifest = inspectBackup(backupDir)
  if (!fs.existsSync(parentDir)) {
    throw new Error('Choose an existing folder for the restored library.')
  }

  const notesDir = uniqueDirectory(
    parentDir,
    `ezNotes Restored ${fileTimestamp()}`
  )
  if (isInside(path.join(backupDir, 'notes'), notesDir)) {
    throw new Error('Choose a restore folder outside the backup notes folder.')
  }
  const warnings: string[] = []
  let audioCount = 0

  try {
    fs.mkdirSync(notesDir, { recursive: true })
    const sourceNotes = path.join(backupDir, 'notes')
    if (fs.existsSync(sourceNotes)) {
      await copyDirectoryContents(sourceNotes, notesDir)
    }
    const notes = rescanNotes(notesDir)

    for (const recordingId of manifest.recordingIds) {
      const source = path.join(backupDir, 'audio', recordingId)
      if (!fs.existsSync(source)) {
        warnings.push(`Audio for ${recordingId} is missing from the backup.`)
        continue
      }
      const destination = path.join(currentRecordingsDir, recordingId)
      if (fs.existsSync(destination)) {
        warnings.push(
          `Audio ${recordingId} already exists on this PC; kept the existing copy.`
        )
        continue
      }
      await fs.promises.cp(source, destination, { recursive: true })
      audioCount += 1
    }

    return {
      notesDir,
      noteCount: notes.length,
      audioCount,
      warnings,
      settings: manifest.settings,
      schedule: readJson<Schedule | null>(
        path.join(backupDir, 'app', 'schedule.json'),
        null
      )
    }
  } catch (error) {
    fs.rmSync(notesDir, { recursive: true, force: true })
    throw error
  }
}

async function copyDirectoryContents(
  source: string,
  destination: string
): Promise<void> {
  fs.mkdirSync(destination, { recursive: true })
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(source, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const from = path.join(source, entry.name)
    const to = path.join(destination, entry.name)
    await fs.promises.cp(from, to, { recursive: true })
  }
}

function readOptionalFile(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function uniqueDirectory(parent: string, name: string): string {
  let candidate = path.join(parent, name)
  let counter = 2
  while (fs.existsSync(candidate)) {
    candidate = path.join(parent, `${name} ${counter}`)
    counter += 1
  }
  return candidate
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate))
  return (
    Boolean(relative) &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative)
  )
}

function fileTimestamp(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
}
