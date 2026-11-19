import { describe, expect, it } from 'vitest'
import {
  decryptSecret,
  encryptSecret,
  migratePlainSecrets,
  SECURE_STORAGE_UNAVAILABLE
} from './secretStorage'

function adapter(available = true): {
  isEncryptionAvailable: () => boolean
  encryptString: (value: string) => Buffer
  decryptString: (value: Buffer) => string
} {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: (value) => value.toString('utf8').replace('encrypted:', '')
  }
}

describe('secure secret storage', () => {
  it('stores and decrypts DPAPI values', () => {
    const storage = adapter()
    const stored = encryptSecret(storage, 'gsk_test')
    expect(stored.startsWith('dpapi:')).toBe(true)
    expect(stored).not.toContain('gsk_test')
    expect(decryptSecret(storage, stored)).toBe('gsk_test')
  })

  it('refuses to save when encryption is unavailable', () => {
    expect(() => encryptSecret(adapter(false), 'gsk_test')).toThrow(
      SECURE_STORAGE_UNAVAILABLE
    )
  })

  it('ignores legacy plaintext values', () => {
    const plain = `plain:${Buffer.from('legacy-key').toString('base64')}`
    expect(decryptSecret(adapter(), plain)).toBeNull()
    expect(decryptSecret(adapter(false), plain)).toBeNull()
  })

  it('migrates legacy plaintext when encryption becomes available', () => {
    const container = {
      encrypted: {
        groqApiKey: `plain:${Buffer.from('legacy-key').toString('base64')}`
      }
    }
    expect(migratePlainSecrets(adapter(), container)).toBe(true)
    expect(container.encrypted.groqApiKey?.startsWith('dpapi:')).toBe(true)
    expect(decryptSecret(adapter(), container.encrypted.groqApiKey)).toBe(
      'legacy-key'
    )
  })

  it('leaves legacy values untouched without encryption', () => {
    const plain = `plain:${Buffer.from('legacy-key').toString('base64')}`
    const container = { encrypted: { groqApiKey: plain } }
    expect(migratePlainSecrets(adapter(false), container)).toBe(false)
    expect(container.encrypted.groqApiKey).toBe(plain)
  })

  it('returns null when decryption fails', () => {
    const storage = adapter()
    storage.decryptString = () => {
      throw new Error('bad ciphertext')
    }
    expect(decryptSecret(storage, 'dpapi:broken')).toBeNull()
  })
})
