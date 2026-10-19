import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { ClassSlot, Course, Schedule, UpcomingClass } from '../shared/types'
import { readJson, writeJson } from './store'

const EMPTY: Schedule = { courses: [], slots: [] }

function scheduleFile(): string {
  return path.join(app.getPath('userData'), 'schedule.json')
}

export function loadSchedule(): Schedule {
  const schedule = readJson<Schedule>(scheduleFile(), EMPTY)
  return {
    courses: Array.isArray(schedule.courses) ? schedule.courses : [],
    slots: Array.isArray(schedule.slots) ? schedule.slots : []
  }
}

export function saveSchedule(input: Schedule): Schedule {
  const courseIds = new Set(input.courses.map((course) => course.id))
  const schedule: Schedule = {
    courses: input.courses.map(normalizeCourse),
    slots: input.slots
      .filter((slot) => courseIds.has(slot.courseId))
      .map(normalizeSlot)
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
    room: slot.room?.trim() || undefined
  }
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
  const occurrences: UpcomingClass[] = []

  for (const slot of schedule.slots) {
    const course = courses.get(slot.courseId)
    if (!course) continue

    for (let offset = 0; offset < 8; offset++) {
      const day = addDays(startOfDay(from), offset)
      if (isoWeekday(day) !== slot.weekday) continue

      const startsAt = atTime(day, slot.startTime)
      const endsAt = atTime(day, slot.endTime)
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

  return occurrences
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )
    .slice(0, Math.max(1, limit))
}

export function ensureNotesDir(notesDir: string): void {
  fs.mkdirSync(notesDir, { recursive: true })
}
