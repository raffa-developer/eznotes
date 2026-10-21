import { getUiLanguage, t, uiLocale } from '../i18n'

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const language = getUiLanguage()
  const minute = language === 'pt' ? 'min' : 'm'
  if (total < 60) return language === 'pt' ? `${total} s` : `${total}s`
  const hours = Math.floor(total / 3600)
  const minutes = Math.round((total % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}${minute}`
  }
  return language === 'pt' ? `${minutes} min` : `${minutes}m`
}

export function formatTimer(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(uiLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date(iso))
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(uiLocale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(iso))
}

export function formatTime(time: string): string {
  return time
}

export const WEEKDAYS = [
  { value: 1 },
  { value: 2 },
  { value: 3 },
  { value: 4 },
  { value: 5 },
  { value: 6 },
  { value: 7 }
]

export function weekdayShort(value: number): string {
  return new Intl.DateTimeFormat(uiLocale(), { weekday: 'short' }).format(
    new Date(2024, 0, value)
  )
}

export function weekdayLong(value: number): string {
  return new Intl.DateTimeFormat(uiLocale(), { weekday: 'long' }).format(
    new Date(2024, 0, value)
  )
}

export function countdown(iso: string, now = new Date()): string {
  const target = new Date(iso).getTime()
  const diff = target - now.getTime()
  if (diff <= 0) return t('now')
  const minutes = Math.round(diff / 60000)
  if (minutes < 60) return t('in {minutes} min', { minutes })
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours < 24) {
    return rest
      ? t('in {hours}h {rest}m', { hours, rest })
      : t('in {hours}h', { hours })
  }
  const days = Math.floor(hours / 24)
  return days === 1 ? t('tomorrow') : t('in {days} days', { days })
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function greeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 6) return t('Still up')
  if (hour < 12) return t('Good morning')
  if (hour < 18) return t('Good afternoon')
  return t('Good evening')
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function uid(prefix = ''): string {
  return `${prefix}${crypto.randomUUID()}`
}
