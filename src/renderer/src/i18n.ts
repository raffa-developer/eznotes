import type { UiLanguage } from '../../shared/types'
import { pt } from './locales/pt'

let language: UiLanguage = 'en'

export function setUiLanguage(next: UiLanguage): void {
  language = next
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next === 'pt' ? 'pt-PT' : 'en-GB'
  }
}

export function getUiLanguage(): UiLanguage {
  return language
}

export function uiLocale(): string {
  return language === 'pt' ? 'pt-PT' : 'en-GB'
}

/**
 * Translate an English source string. English is the fallback, so missing
 * entries never leave the interface empty; Portuguese lives in locales/pt.
 */
export function t(
  key: string,
  vars?: Record<string, string | number>
): string {
  const template = language === 'pt' ? pt[key] ?? key : key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] === undefined ? `{${name}}` : String(vars[name])
  )
}
