import { describe, expect, it } from 'vitest'
import type { ClassSlot, Schedule } from '../shared/types'
import { dueClass, dueSoonClass } from './autoStart'

const course = {
  id: 'c1',
  name: 'Cálculo',
  color: '#d8ff6a',
  glossary: []
}

function scheduleWith(slot: Partial<ClassSlot>): Schedule {
  return {
    courses: [course],
    slots: [
      {
        id: 's1',
        courseId: 'c1',
        weekday: 3,
        startTime: '09:00',
        endTime: '10:00',
        ...slot
      }
    ]
  }
}

// Wednesday 21 October 2026, local time.
const schedule = scheduleWith({})

describe('dueClass', () => {
  it('is due within the grace window after the start', () => {
    const now = new Date(2026, 9, 21, 9, 1, 0)
    const item = dueClass(schedule, now, new Date(2026, 9, 21, 8, 0).getTime())

    expect(item?.course.id).toBe('c1')
  })

  it('is not due before the class starts', () => {
    const now = new Date(2026, 9, 21, 8, 59, 0)
    expect(dueClass(schedule, now, 0)).toBeNull()
  })

  it('is not due after the grace window', () => {
    const now = new Date(2026, 9, 21, 9, 5, 0)
    expect(dueClass(schedule, now, 0)).toBeNull()
  })

  it('does not start a class that began before the app started', () => {
    const now = new Date(2026, 9, 21, 9, 1, 0)
    const startedAt = new Date(2026, 9, 21, 9, 0, 30).getTime()
    expect(dueClass(schedule, now, startedAt)).toBeNull()
  })

  it('ignores classes that already ended', () => {
    const now = new Date(2026, 9, 21, 10, 30, 0)
    expect(dueClass(schedule, now, 0)).toBeNull()
  })
})

describe('dueSoonClass', () => {
  it('finds a class inside the notification window', () => {
    const now = new Date(2026, 9, 21, 8, 56, 0)
    expect(dueSoonClass(schedule, now, 5)?.slot.id).toBe('s1')
  })

  it('ignores classes outside the window', () => {
    const now = new Date(2026, 9, 21, 8, 54, 0)
    expect(dueSoonClass(schedule, now, 5)).toBeNull()
  })

  it('does not treat a class starting now as upcoming', () => {
    const now = new Date(2026, 9, 21, 9, 0, 0)
    expect(dueSoonClass(schedule, now, 5)).toBeNull()
  })

  it('can be disabled', () => {
    const now = new Date(2026, 9, 21, 8, 56, 0)
    expect(dueSoonClass(schedule, now, 0)).toBeNull()
  })
})
