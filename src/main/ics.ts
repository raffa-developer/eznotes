import type {
  ImportedOneOff,
  ImportedScheduleCourse,
  ImportedScheduleException,
  ImportedScheduleSlot,
  ScheduleImportPreview
} from '../shared/types'

interface IcsProperty {
  value: string
  params: Record<string, string>
}

interface IcsEvent {
  props: Record<string, IcsProperty[]>
}

interface ParsedDate {
  date: Date
  allDay: boolean
}

const WEEKDAYS: Record<string, number> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7
}

const DEFAULT_DURATION_MS = 90 * 60 * 1000

/**
 * Parse the weekly classes, one-off changes, and cancellations in an ICS file.
 * The importer intentionally supports the common university-calendar shape:
 * weekly RRULEs, EXDATE cancellations, and RECURRENCE-ID overrides.
 */
export function parseIcs(
  content: string,
  fileName = 'calendar.ics'
): ScheduleImportPreview {
  const lines = unfoldIcs(content)
  const events = parseEvents(lines)
  const warnings: string[] = []
  const slots: ImportedScheduleSlot[] = []
  const oneOffs: ImportedOneOff[] = []
  const exceptions: ImportedScheduleException[] = []
  const courses = new Map<string, ImportedScheduleCourse>()
  const masterSlots = new Map<string, ImportedScheduleSlot[]>()
  const exceptionKeys = new Set<string>()
  let skipped = 0

  const rememberCourse = (course: ImportedScheduleCourse): void => {
    const key = course.name.toLocaleLowerCase()
    const existing = courses.get(key)
    if (!existing) courses.set(key, course)
    else if (!existing.code && course.code) existing.code = course.code
  }

  const addException = (exception: ImportedScheduleException): void => {
    const key = `${exception.slotKey}|${exception.date}`
    if (exceptionKeys.has(key)) return
    exceptionKeys.add(key)
    exceptions.push(exception)
  }

  const masters = events.filter(
    (event) => !event.props['RECURRENCE-ID']?.length
  )
  const overrides = events.filter(
    (event) => event.props['RECURRENCE-ID']?.length
  )

  masters.forEach((event, eventIndex) => {
    const start = parseIcsDate(first(event.props['DTSTART']))
    if (!start) {
      skipped += 1
      warnings.push(`Skipped an event without a usable DTSTART.`)
      return
    }
    if (start.allDay) {
      skipped += 1
      warnings.push('Skipped an all-day event; only timed classes are imported.')
      return
    }
    if (first(event.props['STATUS'])?.value.toUpperCase() === 'CANCELLED') {
      skipped += 1
      return
    }

    const uid =
      first(event.props['UID'])?.value.trim() || `event_${eventIndex}`
    const summary = unescapeIcs(first(event.props['SUMMARY'])?.value ?? 'Aula')
    const course = parseCourse(summary)
    rememberCourse(course)
    const room = unescapeIcs(first(event.props['LOCATION'])?.value ?? '').trim()
    const end = parseIcsDate(first(event.props['DTEND']))
    const endDate = end?.date ?? new Date(start.date.getTime() + DEFAULT_DURATION_MS)

    const rrule = parseRule(first(event.props['RRULE'])?.value)
    if (!rrule) {
      const classEnd = sameDay(start.date, endDate) ? endDate : new Date(start.date.getTime() + DEFAULT_DURATION_MS)
      oneOffs.push({
        key: `oneoff_${uid}`,
        courseName: course.name,
        ...(course.code ? { code: course.code } : {}),
        date: localDateKey(start.date),
        startTime: localTime(start.date),
        endTime: localTime(classEnd),
        ...(room ? { room } : {})
      })
      return
    }

    if (rrule.freq !== 'WEEKLY' || rrule.interval > 1) {
      skipped += 1
      warnings.push(
        `Skipped “${course.name}”: only weekly recurring classes are supported.`
      )
      return
    }

    const byDays = rrule.byDays.length
      ? rrule.byDays
      : [isoWeekday(start.date)]
    const range = occurrenceRange(
      start.date,
      byDays,
      rrule.count,
      rrule.until?.date
    )
    const master: ImportedScheduleSlot[] = []

    for (const weekday of byDays) {
      const firstDate = firstOccurrence(start.date, weekday)
      if (range.endsOn && localDateKey(firstDate) > range.endsOn) continue
      const slot: ImportedScheduleSlot = {
        key: `${uid}:${weekday}`,
        courseName: course.name,
        ...(course.code ? { code: course.code } : {}),
        weekday,
        startTime: localTime(start.date),
        endTime: localTime(endDate),
        startsOn: localDateKey(firstDate),
        ...(range.endsOn ? { endsOn: range.endsOn } : {}),
        ...(room ? { room } : {})
      }
      slots.push(slot)
      master.push(slot)
    }
    masterSlots.set(uid, master)

    for (const property of event.props['EXDATE'] ?? []) {
      for (const value of property.value.split(',')) {
        const excluded = parseIcsDate({
          value,
          params: property.params
        })
        if (!excluded) continue
        const slot = master.find(
          (item) => item.weekday === isoWeekday(excluded.date)
        )
        if (!slot) continue
        if (slot.startsOn && localDateKey(excluded.date) < slot.startsOn) {
          continue
        }
        if (slot.endsOn && localDateKey(excluded.date) > slot.endsOn) {
          continue
        }
        addException({
          slotKey: slot.key,
          date: localDateKey(excluded.date),
          canceled: true
        })
      }
    }
  })

  overrides.forEach((event, index) => {
    const uid = first(event.props['UID'])?.value.trim()
    if (!uid) {
      skipped += 1
      return
    }
    const recurrence = parseIcsDate(first(event.props['RECURRENCE-ID']))
    if (!recurrence) {
      skipped += 1
      return
    }
    const master = masterSlots.get(uid)
    const original = master?.find(
      (slot) => slot.weekday === isoWeekday(recurrence.date)
    )
    if (!original) {
      skipped += 1
      return
    }

    if (first(event.props['STATUS'])?.value.toUpperCase() === 'CANCELLED') {
      addException({
        slotKey: original.key,
        date: localDateKey(recurrence.date),
        canceled: true
      })
      return
    }

    const start = parseIcsDate(first(event.props['DTSTART']))
    if (!start) {
      skipped += 1
      return
    }
    const end = parseIcsDate(first(event.props['DTEND']))
    const endDate = end?.date ?? new Date(start.date.getTime() + DEFAULT_DURATION_MS)
    const summary = unescapeIcs(
      first(event.props['SUMMARY'])?.value ?? original.courseName
    )
    const course = parseCourse(summary)
    rememberCourse(course)
    const room = unescapeIcs(first(event.props['LOCATION'])?.value ?? '').trim()

    addException({
      slotKey: original.key,
      date: localDateKey(recurrence.date),
      canceled: true
    })
    oneOffs.push({
      key: `override_${uid}_${index}`,
      courseName: course.name,
      ...(course.code ? { code: course.code } : {}),
      date: localDateKey(start.date),
      startTime: localTime(start.date),
      endTime: localTime(endDate),
      ...(room ? { room } : {})
    })
  })

  return {
    fileName,
    courses: [...courses.values()],
    slots,
    oneOffs,
    exceptions,
    skipped,
    warnings,
    conflicts: []
  }
}

function unfoldIcs(content: string): string[] {
  return content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
}

function parseEvents(lines: string[]): IcsEvent[] {
  const events: IcsEvent[] = []
  let current: IcsEvent | null = null

  for (const line of lines) {
    const upper = line.trim().toUpperCase()
    if (upper === 'BEGIN:VEVENT') {
      current = { props: {} }
      continue
    }
    if (upper === 'END:VEVENT') {
      if (current) events.push(current)
      current = null
      continue
    }
    if (!current || !line.trim()) continue

    const property = parseProperty(line)
    if (!property) continue
    const name = property.name
    current.props[name] = current.props[name] ?? []
    current.props[name].push(property.property)
  }

  return events
}

function parseProperty(line: string): {
  name: string
  property: IcsProperty
} | null {
  const separator = line.indexOf(':')
  if (separator < 0) return null
  const left = line.slice(0, separator)
  const value = line.slice(separator + 1)
  const parts = left.split(';')
  const name = parts[0].trim().toUpperCase()
  if (!name) return null
  const params: Record<string, string> = {}
  for (const part of parts.slice(1)) {
    const equals = part.indexOf('=')
    if (equals < 0) continue
    params[part.slice(0, equals).trim().toUpperCase()] = part
      .slice(equals + 1)
      .trim()
      .replace(/^"|"$/g, '')
  }
  return { name, property: { value, params } }
}

function first(properties: IcsProperty[] | undefined): IcsProperty | undefined {
  return properties?.[0]
}

function parseIcsDate(property: IcsProperty | undefined): ParsedDate | null {
  if (!property) return null
  const value = property.value.trim()
  const allDay = /^\d{8}$/.test(value)
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(
    value
  )
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4] ?? 0)
  const minute = Number(match[5] ?? 0)
  const second = Number(match[6] ?? 0)
  const utc = Boolean(match[7])
  const timeZone = property.params.TZID

  let date: Date
  if (allDay) {
    date = new Date(year, month - 1, day)
  } else if (utc) {
    date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  } else if (timeZone) {
    date = zonedWallTimeToDate(year, month, day, hour, minute, second, timeZone)
  } else {
    date = new Date(year, month - 1, day, hour, minute, second)
  }

  return Number.isNaN(date.getTime()) ? null : { date, allDay }
}

function zonedWallTimeToDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second)
  try {
    const firstOffset = timeZoneOffset(new Date(guess), timeZone)
    const candidate = new Date(guess - firstOffset)
    const secondOffset = timeZoneOffset(candidate, timeZone)
    return new Date(guess - secondOffset)
  } catch {
    return new Date(year, month - 1, day, hour, minute, second)
  }
}

function timeZoneOffset(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date)
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
  )
  return (
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second)
    ) - date.getTime()
  )
}

function parseCourse(summary: string): ImportedScheduleCourse {
  const clean = unescapeIcs(summary).trim() || 'Aula'
  const short = clean.split(/\s+[-–—]\s+/)[0]?.trim() || clean
  const codeFirst = /^([A-Z]{2,12}\d{2,6})\s+(.+)$/.exec(short)
  if (codeFirst) {
    return { name: codeFirst[2].trim(), code: codeFirst[1] }
  }
  const parenthesised = /^(.+?)\s*\(([^)]+)\)$/.exec(short)
  if (parenthesised && parenthesised[2].length <= 16) {
    return { name: parenthesised[1].trim(), code: parenthesised[2].trim() }
  }
  return { name: short }
}

interface ParsedRule {
  freq: string
  interval: number
  byDays: number[]
  count?: number
  until?: ParsedDate
}

function parseRule(value: string | undefined): ParsedRule | null {
  if (!value) return null
  const fields = new Map<string, string>()
  for (const part of value.split(';')) {
    const equals = part.indexOf('=')
    if (equals > 0) {
      fields.set(part.slice(0, equals).toUpperCase(), part.slice(equals + 1))
    }
  }
  const freq = (fields.get('FREQ') ?? '').toUpperCase()
  if (!freq) return null
  const interval = Math.max(1, Number(fields.get('INTERVAL')) || 1)
  const byDays = (fields.get('BYDAY') ?? '')
    .split(',')
    .map((day) => WEEKDAYS[day.trim().toUpperCase().slice(-2)])
    .filter((day): day is number => Boolean(day))
  const countValue = Number(fields.get('COUNT'))
  const until = fields.get('UNTIL')
    ? parseIcsDate({ value: fields.get('UNTIL') ?? '', params: {} })
    : null

  return {
    freq,
    interval,
    byDays,
    ...(Number.isFinite(countValue) && countValue > 0
      ? { count: Math.floor(countValue) }
      : {}),
    ...(until ? { until } : {})
  }
}

function occurrenceRange(
  start: Date,
  weekdays: number[],
  count: number | undefined,
  until: Date | undefined
): { startsOn: string; endsOn?: string } {
  if (!count) {
    return {
      startsOn: localDateKey(start),
      ...(until ? { endsOn: localDateKey(until) } : {})
    }
  }

  const sorted = [...new Set(weekdays)].sort((a, b) => a - b)
  const weekStart = startOfWeek(start)
  let seen = 0
  let last: Date | null = null

  for (let week = 0; week < 520; week += 1) {
    for (const weekday of sorted) {
      const candidate = addDays(weekStart, week * 7 + weekday - 1)
      if (localDateKey(candidate) < localDateKey(start)) continue
      if (
        until &&
        localDateKey(candidate) > localDateKey(until)
      ) {
        return {
          startsOn: localDateKey(start),
          endsOn: last ? localDateKey(last) : localDateKey(start)
        }
      }
      seen += 1
      last = candidate
      if (seen >= count) {
        return {
          startsOn: localDateKey(start),
          endsOn: localDateKey(candidate)
        }
      }
    }
  }

  return {
    startsOn: localDateKey(start),
    ...(last ? { endsOn: localDateKey(last) } : {})
  }
}

function firstOccurrence(start: Date, weekday: number): Date {
  const delta = (weekday - isoWeekday(start) + 7) % 7
  return addDays(start, delta)
}

function startOfWeek(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  result.setDate(result.getDate() - (isoWeekday(result) - 1))
  return result
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function isoWeekday(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1
}

function sameDay(a: Date, b: Date): boolean {
  return localDateKey(a) === localDateKey(b)
}

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes()
  ).padStart(2, '0')}`
}

function unescapeIcs(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}
