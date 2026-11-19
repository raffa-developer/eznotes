export interface SecureStorageAdapter {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

export interface SecretContainer {
  encrypted: Partial<Record<string, string>>
}

const SECURE_PREFIX = 'secure:'
const LEGACY_DPAPI_PREFIX = 'dpapi:'
const LEGACY_PLAIN_PREFIX = 'plain:'

export const SECURE_STORAGE_UNAVAILABLE =
  'Secure key storage is unavailable on this PC. ezNotes will not save API keys in plain text.'

export function canStoreSecrets(storage: SecureStorageAdapter): boolean {
  return storage.isEncryptionAvailable()
}

/**
 * Linux can fall back to Electron's basic_text backend, which is not real
 * encryption. Treat that as unavailable so keys are never stored insecurely.
 */
export function secureStorageUsable(
  platform: NodeJS.Platform,
  encryptionAvailable: boolean,
  linuxBackend?: string
): boolean {
  if (!encryptionAvailable) return false
  if (platform === 'linux' && linuxBackend === 'basic_text') return false
  return true
}

export function encryptSecret(
  storage: SecureStorageAdapter,
  value: string
): string {
  if (!storage.isEncryptionAvailable()) {
    throw new Error(SECURE_STORAGE_UNAVAILABLE)
  }
  return `${SECURE_PREFIX}${storage.encryptString(value).toString('base64')}`
}

export function decryptSecret(
  storage: SecureStorageAdapter,
  stored: string | undefined
): string | null {
  if (!stored) return null
  const prefix = stored.startsWith(SECURE_PREFIX)
    ? SECURE_PREFIX
    : stored.startsWith(LEGACY_DPAPI_PREFIX)
      ? LEGACY_DPAPI_PREFIX
      : null
  if (!prefix) return null
  if (!storage.isEncryptionAvailable()) return null
  try {
    return storage.decryptString(
      Buffer.from(stored.slice(prefix.length), 'base64')
    )
  } catch {
    return null
  }
}

/**
 * Older builds could fall back to base64 when DPAPI was unavailable. Re-encrypt
 * those values as soon as secure storage works; otherwise leave them untouched
 * and ignore them, rather than continuing to use plaintext.
 */
export function migratePlainSecrets(
  storage: SecureStorageAdapter,
  container: SecretContainer
): boolean {
  if (!storage.isEncryptionAvailable()) return false

  let changed = false
  for (const key of Object.keys(container.encrypted)) {
    const stored = container.encrypted[key]
    if (!stored?.startsWith(LEGACY_PLAIN_PREFIX)) continue
    try {
      const value = Buffer.from(
        stored.slice(LEGACY_PLAIN_PREFIX.length),
        'base64'
      ).toString('utf8')
      container.encrypted[key] = encryptSecret(storage, value)
      changed = true
    } catch {
      // Keep the unusable legacy value until the user replaces it.
    }
  }
  return changed
}
