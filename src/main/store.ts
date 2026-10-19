import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type {
  SecretKey,
  Settings,
  SettingsStatus
} from '../shared/types'
import { demoMode } from './mock'

const DEFAULT_SETTINGS: Settings = {
  stt: {
    provider: 'groq',
    model: 'whisper-large-v3-turbo',
    language: 'pt'
  },
  llm: {
    provider: 'opencode-go',
    baseURL: 'https://opencode.ai/inference/go/openai/v1',
    model: 'deepseek-v4.1-flash'
  },
  notesDir: '',
  microphoneId: null,
  retentionDays: 30,
  theme: 'dark',
  uiLanguage: 'en',
  notifyBeforeMinutes: 5
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
    notesDir: path.join(app.getPath('documents'), 'Aula')
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
  settings.retentionDays = clamp(Number(settings.retentionDays) || 30, 1, 365)
  settings.notifyBeforeMinutes = clamp(
    Number(settings.notifyBeforeMinutes) || 5,
    0,
    120
  )

  ensureDir(settings.notesDir)
  return settings
}

export function saveSettings(next: Settings): Settings {
  const normalized: Settings = {
    ...next,
    retentionDays: clamp(Number(next.retentionDays) || 30, 1, 365),
    notifyBeforeMinutes: clamp(Number(next.notifyBeforeMinutes) || 5, 0, 120)
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
    demoMode
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
