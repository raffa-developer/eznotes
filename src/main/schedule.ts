import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import type {
  ClassSlot,
  Course,
  OneOffClass,
  Schedule,
  ScheduleException,
  ScheduleImportPreview,
  UpcomingClass
} from '../shared/types'
import { readJson, writeJson } from './store'

const EMPTY: Schedule = {
  courses: [],
  slots: [],
  oneOffs: [],
  exceptions: []
}

const COURSE_COLORS = [
  '#d8ff6a',
  '#ffb86b',
  '#7cd4fd',
  '#f7a8d8',
  '#b7a6ff',
  '#8ce99a',
  '#ffd43b',
  '#ff8787'
]

function scheduleFile(): string {
  return path.join(app.getPath('userData'), 'schedule.json')
}

export function loadSchedule(): Schedule {
  const schedule = readJson<Schedule>(scheduleFile(), EMPTY)
  return {
    courses: Array.isArray(schedule.courses) ? schedule.courses : [],
    slots: Array.isArray(schedule.slots) ? schedule.slots : [],
    oneOffs: Array.isArray(schedule.oneOffs) ? schedule.oneOffs : [],
    exceptions: Array.isArray(schedule.exceptions) ? schedule.exceptions : []
  }
}

export function saveSchedule(input: Schedule): Schedule {
  const courseIds = new Set(input.courses.map((course) => course.id))
  const schedule: Schedule = {
    courses: input.courses.map(normalizeCourse),
    slots: input.slots
      .filter((slot) => courseIds.has(slot.courseId))
      .map(normalizeSlot),
    oneOffs: (input.oneOffs ?? [])
      .filter((item) => courseIds.has(item.courseId))
      .map(normalizeOneOff),
    exceptions: (input.exceptions ?? []).map(normalizeException)
  }
  writeJson(scheduleFile(), schedule)
  return schedule
}

function normalizeCourse(course: Course): Course {
  return {
    id: course.id,
    name: course.name.trim(),
    code: course.code?.trim() || undefined,
    lecturer: course.lecturer?.trim() || undefined,
    color: course.color || '#d8ff6a',
    glossary: Array.isArray(course.glossary)
      ? course.glossary.map((term) => term.trim()).filter(Boolean)
      : []
  }
}

function normalizeSlot(slot: ClassSlot): ClassSlot {
  return {
    id: slot.id,
    courseId: slot.courseId,
    weekday: Math.min(7, Math.max(1, Number(slot.weekday) || 1)),
    startTime: normalizeTime(slot.startTime),
    endTime: normalizeTime(slot.endTime),
    room: slot.room?.trim() || undefined,
    startsOn: normalizeDate(slot.startsOn),
    endsOn: normalizeDate(slot.endsOn)
  }
}

function normalizeOneOff(item: OneOffClass): OneOffClass {
  return {
    id: item.id,
    courseId: item.courseId,
    date: normalizeDate(item.date) ?? '',
    startTime: normalizeTime(item.startTime),
    endTime: normalizeTime(item.endTime),
    room: item.room?.trim() || undefined
  }
}

function normalizeException(item: ScheduleException): ScheduleException {
  return {
    id: item.id,
    slotId: item.slotId,
    date: normalizeDate(item.date) ?? '',
    canceled: item.canceled === true,
    startTime: item.startTime ? normalizeTime(item.startTime) : undefined,
    endTime: item.endTime ? normalizeTime(item.endTime) : undefined,
    room: item.room?.trim() || undefined
  }
}

function normalizeDate(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
}

function normalizeTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? '')
  if (!match) return '09:00'
  const hours = Math.min(23, Math.max(0, Number(match[1])))
  const minutes = Math.min(59, Math.max(0, Number(match[2])))
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function isoWeekday(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1
}

function atTime(day: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number)
  const result = new Date(day)
  result.setHours(hours, minutes, 0, 0)
  return result
}

function startOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function upcomingClasses(
  schedule: Schedule,
  from = new Date(),
  limit = 12
): UpcomingClass[] {
  const courses = new Map(schedule.courses.map((course) => [course.id, course]))
  const exceptions = new Map(
    (schedule.exceptions ?? []).map((item) => [
      `${item.slotId}|${item.date}`,
      item
    ])
  )
  const occurrences: UpcomingClass[] = []

  for (const slot of schedule.slots) {
    const course = courses.get(slot.courseId)
    if (!course) continue

    for (let offset = 0; offset < 8; offset++) {
      const day = addDays(startOfDay(from), offset)
      if (isoWeekday(day) !== slot.weekday) continue
      const dateKey = localDateKey(day)
      if (!withinDateRange(dateKey, slot.startsOn, slot.endsOn)) continue

      const exception = exceptions.get(`${slot.id}|${dateKey}`)
      if (exception?.canceled) continue

      const startsAt = atTime(day, exception?.startTime ?? slot.startTime)
      const endsAt = atTime(day, exception?.endTime ?? slot.endTime)
      if (endsAt <= from) continue

      occurrences.push({
        slot,
        course,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        isNow: startsAt <= from && endsAt > from
      })
      break
    }
  }

  for (const oneOff of schedule.oneOffs ?? []) {
    const course = courses.get(oneOff.courseId)
    if (!course) continue
    const day = dateFromKey(oneOff.date)
    if (!day) continue
    const startsAt = atTime(day, oneOff.startTime)
    const endsAt = atTime(day, oneOff.endTime)
    if (endsAt <= from) continue
    if (startsAt.getTime() - from.getTime() > 8 * 24 * 60 * 60 * 1000) {
      continue
    }

    occurrences.push({
      slot: {
        id: oneOff.id,
        courseId: oneOff.courseId,
        weekday: isoWeekday(day),
        startTime: oneOff.startTime,
        endTime: oneOff.endTime,
        room: oneOff.room
      },
      course,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      isNow: startsAt <= from && endsAt > from,
      oneOffId: oneOff.id
    })
  }

  return occurrences
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )
    .slice(0, Math.max(1, limit))
}

function withinDateRange(
  date: string,
  startsOn: string | undefined,
  endsOn: string | undefined
): boolean {
  if (startsOn && date < startsOn) return false
  if (endsOn && date > endsOn) return false
  return true
}

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateFromKey(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

export function findImportConflicts(
  schedule: Schedule,
  preview: ScheduleImportPreview
): string[] {
  const courseById = new Map(
    schedule.courses.map((course) => [course.id, course])
  )
  const existingOneOffs = schedule.oneOffs ?? []
  const conflicts = new Set<string>()

  for (const imported of preview.slots) {
    for (const existing of schedule.slots) {
      if (existing.weekday !== imported.weekday) continue
      if (!timesOverlap(imported.startTime, imported.endTime, existing.startTime, existing.endTime)) {
        continue
      }
      if (!rangesOverlap(imported, existing)) continue
      const course = courseById.get(existing.courseId)
      if (!course || sameCourseName(course, imported.courseName)) continue
      conflicts.add(
        `${imported.courseName} on ${weekdayName(imported.weekday)} ${imported.startTime}–${imported.endTime} overlaps ${course.name}`
      )
    }
  }

  for (const imported of preview.oneOffs) {
    const date = dateFromKey(imported.date)
    if (!date) continue
    const weekday = isoWeekday(date)
    for (const existing of schedule.slots) {
      if (existing.weekday !== weekday) continue
      if (!withinDateRange(imported.date, existing.startsOn, existing.endsOn)) {
        continue
      }
      if (!timesOverlap(imported.startTime, imported.endTime, existing.startTime, existing.endTime)) {
        continue
      }
      const course = courseById.get(existing.courseId)
      if (!course || sameCourseName(course, imported.courseName)) continue
      conflicts.add(
        `${imported.courseName} on ${imported.date} ${imported.startTime}–${imported.endTime} overlaps ${course.name}`
      )
    }
    for (const existing of existingOneOffs) {
      if (existing.date !== imported.date) continue
      if (!timesOverlap(imported.startTime, imported.endTime, existing.startTime, existing.endTime)) {
        continue
      }
      const course = courseById.get(existing.courseId)
      if (!course || sameCourseName(course, imported.courseName)) continue
      conflicts.add(
        `${imported.courseName} on ${imported.date} ${imported.startTime}–${imported.endTime} overlaps ${course.name}`
      )
    }
  }

  return [...conflicts]
}

export function applyScheduleImport(
  schedule: Schedule,
  preview: ScheduleImportPreview,
  skipConflicts: boolean
): Schedule {
  const courses = [...schedule.courses]
  const slots = [...schedule.slots]
  const oneOffs = [...(schedule.oneOffs ?? [])]
  const exceptions = [...(schedule.exceptions ?? [])]
  const courseByName = new Map(
    courses.map((course) => [course.name.toLocaleLowerCase(), course])
  )
  const courseByCode = new Map(
    courses
      .filter((course) => course.code)
      .map((course) => [course.code!.toLocaleLowerCase(), course])
  )
  const slotIds = new Map<string, string>()
  let sequence = 0
  const nextId = (prefix: string): string =>
    `${prefix}_${Date.now()}_${sequence++}_${randomUUID().slice(0, 4)}`

  const ensureCourse = (name: string, code?: string): Course => {
    const byName = courseByName.get(name.toLocaleLowerCase())
    if (byName) {
      if (!byName.code && code) byName.code = code
      return byName
    }
    if (code) {
      const byCode = courseByCode.get(code.toLocaleLowerCase())
      if (byCode) return byCode
    }
    const course: Course = {
      id: nextId('course'),
      name,
      code: code || undefined,
      color: COURSE_COLORS[courses.length % COURSE_COLORS.length],
      glossary: []
    }
    courses.push(course)
    courseByName.set(course.name.toLocaleLowerCase(), course)
    if (course.code) courseByCode.set(course.code.toLocaleLowerCase(), course)
    return course
  }

  for (const imported of preview.slots) {
    if (
      skipConflicts &&
      slotConflicts(imported.courseName, imported, slots, courses)
    ) {
      continue
    }
    const course = ensureCourse(imported.courseName, imported.code)
    const duplicate = slots.find(
      (slot) =>
        slot.courseId === course.id &&
        slot.weekday === imported.weekday &&
        slot.startTime === imported.startTime &&
        slot.endTime === imported.endTime &&
        slot.startsOn === imported.startsOn &&
        slot.endsOn === imported.endsOn
    )
    if (duplicate) {
      slotIds.set(imported.key, duplicate.id)
      continue
    }
    const slot: ClassSlot = {
      id: nextId('slot'),
      courseId: course.id,
      weekday: imported.weekday,
      startTime: imported.startTime,
      endTime: imported.endTime,
      room: imported.room || undefined,
      startsOn: imported.startsOn,
      endsOn: imported.endsOn
    }
    slots.push(slot)
    slotIds.set(imported.key, slot.id)
  }

  for (const imported of preview.exceptions) {
    const slotId = slotIds.get(imported.slotKey)
    if (!slotId) continue
    const existing = exceptions.find(
      (item) => item.slotId === slotId && item.date === imported.date
    )
    const exception: ScheduleException = {
      id: existing?.id ?? nextId('exc'),
      slotId,
      date: imported.date,
      canceled: imported.canceled,
      startTime: imported.startTime,
      endTime: imported.endTime,
      room: imported.room
    }
    if (existing) {
      Object.assign(existing, exception)
    } else {
      exceptions.push(exception)
    }
  }

  for (const imported of preview.oneOffs) {
    if (
      skipConflicts &&
      oneOffConflicts(imported.courseName, imported, slots, oneOffs, courses)
    ) {
      continue
    }
    const course = ensureCourse(imported.courseName, imported.code)
    const duplicate = oneOffs.find(
      (item) =>
        item.courseId === course.id &&
        item.date === imported.date &&
        item.startTime === imported.startTime &&
        item.endTime === imported.endTime
    )
    if (duplicate) continue
    oneOffs.push({
      id: nextId('oneoff'),
      courseId: course.id,
      date: imported.date,
      startTime: imported.startTime,
      endTime: imported.endTime,
      room: imported.room || undefined
    })
  }

  return { courses, slots, oneOffs, exceptions }
}

function slotConflicts(
  courseName: string,
  imported: {
    weekday: number
    startTime: string
    endTime: string
    startsOn?: string
    endsOn?: string
  },
  slots: ClassSlot[],
  courses: Course[]
): boolean {
  const courseById = new Map(courses.map((course) => [course.id, course]))
  return slots.some((slot) => {
    if (slot.weekday !== imported.weekday) return false
    if (!rangesOverlap(imported, slot)) return false
    if (!timesOverlap(imported.startTime, imported.endTime, slot.startTime, slot.endTime)) return false
    const course = courseById.get(slot.courseId)
    return Boolean(course && !sameCourseName(course, courseName))
  })
}

function oneOffConflicts(
  courseName: string,
  imported: { date: string; startTime: string; endTime: string },
  slots: ClassSlot[],
  oneOffs: OneOffClass[],
  courses: Course[]
): boolean {
  const date = dateFromKey(imported.date)
  if (!date) return false
  const weekday = isoWeekday(date)
  const courseById = new Map(courses.map((course) => [course.id, course]))
  const regularConflict = slots.some((slot) => {
    if (slot.weekday !== weekday) return false
    if (!withinDateRange(imported.date, slot.startsOn, slot.endsOn)) return false
    if (!timesOverlap(imported.startTime, imported.endTime, slot.startTime, slot.endTime)) return false
    const course = courseById.get(slot.courseId)
    return Boolean(course && !sameCourseName(course, courseName))
  })
  if (regularConflict) return true
  return oneOffs.some((item) => {
    if (item.date !== imported.date) return false
    if (!timesOverlap(imported.startTime, imported.endTime, item.startTime, item.endTime)) return false
    const course = courseById.get(item.courseId)
    return Boolean(course && !sameCourseName(course, courseName))
  })
}

function sameCourseName(course: Course, name: string): boolean {
  return (
    course.name.toLocaleLowerCase() === name.toLocaleLowerCase() ||
    course.code?.toLocaleLowerCase() === name.toLocaleLowerCase()
  )
}

function timesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  return startA < endB && startB < endA
}

function rangesOverlap(
  a: { startsOn?: string; endsOn?: string },
  b: { startsOn?: string; endsOn?: string }
): boolean {
  const aStart = a.startsOn ?? '0000-01-01'
  const aEnd = a.endsOn ?? '9999-12-31'
  const bStart = b.startsOn ?? '0000-01-01'
  const bEnd = b.endsOn ?? '9999-12-31'
  return aStart <= bEnd && bStart <= aEnd
}

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday - 1] ?? String(weekday)
}

export function ensureNotesDir(notesDir: string): void {
  fs.mkdirSync(notesDir, { recursive: true })
}
