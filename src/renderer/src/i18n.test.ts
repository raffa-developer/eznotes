import { afterEach, describe, expect, it } from 'vitest'
import { setUiLanguage, t } from './i18n'

afterEach(() => {
  setUiLanguage('en')
})

describe('i18n', () => {
  it('translates to European Portuguese', () => {
    setUiLanguage('pt')
    expect(t('Library')).toBe('Biblioteca')
  })

  it('falls back to English for unknown keys', () => {
    setUiLanguage('pt')
    expect(t('An untranslated key')).toBe('An untranslated key')
  })

  it('interpolates placeholders', () => {
    setUiLanguage('pt')
    expect(t('in {minutes} min', { minutes: 5 })).toBe('em 5 min')
  })
})
