import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type {
  SecretKey,
  Settings,
  SettingsStatus
} from '../shared/types'
import { demoMode } from './mock'
import { diarizationStatus } from './diarization'
import { DEFAULT_HOTKEY, HOTKEY_OPTIONS } from '../shared/hotkeys'

const DEFAULT_SETTINGS: Settings = {
  stt: {
    provider: 'groq',
    model: 'whisper-large-v3-turbo',
    language: 'pt',
    liveTranscript: true,
    speakerLabels: false
  },
  llm: {
    provider: 'opencode-go',
    baseURL: 'https://opencode.ai/inference/go/openai/v1',
    model: 'deepseek-v4.1-flash'
  },
  notesDir: '',
  obsidianVault: '',
  microphoneId: null,
  retentionDays: 30,
  theme: 'dark',
  uiLanguage: 'en',
  notifyBeforeMinutes: 5,
  autoStartRecording: false,
  globalHotkey: false,
  globalHotkeyKey: DEFAULT_HOTKEY
}

function userDataPath(...parts: string[]): string {
  return path.join(app.getPath('userData'), ...parts)
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

export function atomicWrite(file: string, data: string): void {
  ensureDir(path.dirname(file))
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, data, 'utf8')
  try {
    fs.renameSync(tmp, file)
  } catch {
    fs.rmSync(file, { force: true })
    fs.renameSync(tmp, file)
  }
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(file, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJson(file: string, value: unknown): void {
  atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`)
}

function settingsFile(): string {
  return userDataPath('settings.json')
}

function secretsFile(): string {
  return userDataPath('secrets.json')
}

export function defaultSettings(): Settings {
  return {
    ...DEFAULT_SETTINGS,
    stt: { ...DEFAULT_SETTINGS.stt },
    llm: { ...DEFAULT_SETTINGS.llm },
    notesDir: path.join(app.getPath('documents'), 'ezNotes')
  }
}

function migrateNotesDirectory(settings: Settings): boolean {
  const documents = app.getPath('documents')
  const legacy = path.join(documents, 'Aula')
  const current = path.join(documents, 'ezNotes')
  let changed = false

  if (path.resolve(settings.notesDir) === path.resolve(legacy)) {
    if (!fs.existsSync(current) && fs.existsSync(legacy)) {
      try {
        fs.renameSync(legacy, current)
      } catch {
        return false
      }
    }
    if (!fs.existsSync(current)) {
      try {
        fs.mkdirSync(current, { recursive: true })
      } catch {
        return false
      }
    }
    if (path.resolve(settings.notesDir) !== path.resolve(current)) {
      settings.notesDir = current
      changed = true
    }
    migrateMetaFolder(current, legacy)
  } else {
    migrateMetaFolder(settings.notesDir, settings.notesDir)
  }

  return changed
}

function migrateMetaFolder(notesDir: string, legacyRoot: string): void {
  const legacyMeta = path.join(notesDir, '.aula')
  const currentMeta = path.join(notesDir, '.eznotes')

  if (!fs.existsSync(currentMeta) && fs.existsSync(legacyMeta)) {
    try {
      fs.renameSync(legacyMeta, currentMeta)
    } catch {
      // Fall back to the legacy folder if it is locked.
    }
  }

  const meta = fs.existsSync(currentMeta) ? currentMeta : legacyMeta
  const index = path.join(meta, 'index.json')
  if (!fs.existsSync(index)) return

  try {
    const data = JSON.parse(fs.readFileSync(index, 'utf8')) as {
      notes?: Array<{ path?: string }>
    }
    if (!Array.isArray(data.notes)) return

    let changed = false
    data.notes = data.notes.map((note) => {
      if (typeof note.path !== 'string') return note
      const next = note.path.replace(legacyRoot, notesDir)
      if (next === note.path) return note
      changed = true
      return { ...note, path: next }
    })
    if (changed) fs.writeFileSync(index, `${JSON.stringify(data, null, 2)}\n`)
  } catch {
    // The library can rebuild its index from the Markdown files.
  }
}

export function loadSettings(): Settings {
  const defaults = defaultSettings()
  const stored = readJson<Partial<Settings>>(settingsFile(), {})
  const settings: Settings = {
    ...defaults,
    ...stored,
    stt: { ...defaults.stt, ...(stored.stt ?? {}) },
    llm: { ...defaults.llm, ...(stored.llm ?? {}) }
  }

  if (!settings.notesDir) settings.notesDir = defaults.notesDir
  settings.obsidianVault =
    typeof settings.obsidianVault === 'string' ? settings.obsidianVault : ''
  settings.stt.liveTranscript = settings.stt.liveTranscript !== false
  settings.stt.speakerLabels = settings.stt.speakerLabels === true
  const notesMoved = migrateNotesDirectory(settings)
  settings.retentionDays = clamp(Number(settings.retentionDays) || 30, 1, 365)
  const notifyBefore = Number(settings.notifyBeforeMinutes)
  settings.notifyBeforeMinutes = clamp(
    Number.isFinite(notifyBefore) ? notifyBefore : 5,
    0,
    120
  )
  settings.autoStartRecording = settings.autoStartRecording === true
  settings.globalHotkey = settings.globalHotkey === true
  settings.globalHotkeyKey = normalizeHotkey(settings.globalHotkeyKey)

  if (notesMoved) writeJson(settingsFile(), settings)
  ensureDir(settings.notesDir)
  return settings
}

export function saveSettings(next: Settings): Settings {
  const normalized: Settings = {
    ...next,
    retentionDays: clamp(Number(next.retentionDays) || 30, 1, 365),
    notifyBeforeMinutes: clamp(
      Number.isFinite(Number(next.notifyBeforeMinutes))
        ? Number(next.notifyBeforeMinutes)
        : 5,
      0,
      120
    ),
    globalHotkeyKey: normalizeHotkey(next.globalHotkeyKey)
  }
  writeJson(settingsFile(), normalized)
  ensureDir(normalized.notesDir)
  return normalized
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const current = loadSettings()
  const next: Settings = {
    ...current,
    ...patch,
    stt: { ...current.stt, ...(patch.stt ?? {}) },
    llm: { ...current.llm, ...(patch.llm ?? {}) }
  }
  return saveSettings(next)
}

interface SecretStore {
  encrypted: Partial<Record<SecretKey, string>>
}

function loadSecrets(): SecretStore {
  return readJson<SecretStore>(secretsFile(), { encrypted: {} })
}

export function setSecret(key: SecretKey, value: string): void {
  const store = loadSecrets()
  const trimmed = value.trim()
  if (!trimmed) {
    delete store.encrypted[key]
  } else if (safeStorage.isEncryptionAvailable()) {
    store.encrypted[key] = `dpapi:${safeStorage.encryptString(trimmed).toString('base64')}`
  } else {
    store.encrypted[key] = `plain:${Buffer.from(trimmed, 'utf8').toString('base64')}`
  }
  writeJson(secretsFile(), store)
}

export function getSecret(key: SecretKey): string | null {
  const stored = loadSecrets().encrypted[key]
  if (!stored) return null
  try {
    if (stored.startsWith('dpapi:')) {
      return safeStorage.decryptString(Buffer.from(stored.slice(6), 'base64'))
    }
    if (stored.startsWith('plain:')) {
      return Buffer.from(stored.slice(6), 'base64').toString('utf8')
    }
  } catch {
    return null
  }
  return null
}

export function clearSecret(key: SecretKey): void {
  const store = loadSecrets()
  delete store.encrypted[key]
  writeJson(secretsFile(), store)
}

export function hasSecret(key: SecretKey): boolean {
  return Boolean(getSecret(key))
}

export function settingsStatus(): SettingsStatus {
  const settings = loadSettings()
  return {
    settings,
    hasGroqKey: hasSecret('groqApiKey'),
    hasLlmKey: hasSecret('llmApiKey'),
    notesDir: settings.notesDir,
    appVersion: app.getVersion(),
    recordingsDir: recordingsDir(),
    demoMode,
    diarization: diarizationStatus()
  }
}

export function recordingsDir(): string {
  const dir = userDataPath('recordings')
  ensureDir(dir)
  return dir
}

export function cacheDir(): string {
  const dir = userDataPath('cache')
  ensureDir(dir)
  return dir
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeHotkey(value: unknown): string {
  return typeof value === 'string' &&
    HOTKEY_OPTIONS.some((option) => option.value === value)
    ? value
    : DEFAULT_HOTKEY
}
