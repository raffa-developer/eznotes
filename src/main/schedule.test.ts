import { describe, expect, it } from 'vitest'
import type { ClassSlot, Schedule } from '../shared/types'
import { isoWeekday, upcomingClasses } from './schedule'

const course = {
  id: 'c1',
  name: 'Cálculo',
  color: '#d8ff6a',
  glossary: []
}

function slot(overrides: Partial<ClassSlot>): ClassSlot {
  return {
    id: 's1',
    courseId: 'c1',
    weekday: 3,
    startTime: '09:00',
    endTime: '10:00',
    ...overrides
  }
}

function scheduleWith(slots: ClassSlot[]): Schedule {
  return { courses: [course], slots }
}

// Wednesday 21 October 2026, local time.
const wednesdayMorning = new Date(2026, 9, 21, 8, 0, 0)

describe('isoWeekday', () => {
  it('maps Monday to 1 and Sunday to 7', () => {
    expect(isoWeekday(new Date(2026, 9, 19))).toBe(1)
    expect(isoWeekday(new Date(2026, 9, 21))).toBe(3)
    expect(isoWeekday(new Date(2026, 9, 25))).toBe(7)
  })
})

describe('upcomingClasses', () => {
  it('returns today’s occurrence before it starts', () => {
    const classes = upcomingClasses(scheduleWith([slot({})]), wednesdayMorning)

    expect(classes).toHaveLength(1)
    expect(classes[0].slot.id).toBe('s1')
    expect(classes[0].isNow).toBe(false)
    expect(new Date(classes[0].startsAt).getDate()).toBe(21)
    expect(new Date(classes[0].startsAt).getHours()).toBe(9)
  })

  it('marks a slot in progress as isNow', () => {
    const during = new Date(2026, 9, 21, 9, 30, 0)
    const classes = upcomingClasses(scheduleWith([slot({})]), during)

    expect(classes).toHaveLength(1)
    expect(classes[0].isNow).toBe(true)
  })

  it('skips a slot that already ended and returns next week', () => {
    const after = new Date(2026, 9, 21, 10, 30, 0)
    const classes = upcomingClasses(scheduleWith([slot({})]), after)

    expect(classes).toHaveLength(1)
    expect(classes[0].isNow).toBe(false)
    expect(new Date(classes[0].startsAt).getDate()).toBe(28)
  })

  it('sorts occurrences and respects the limit', () => {
    const schedule = scheduleWith([
      slot({ id: 'late', startTime: '14:00', endTime: '15:00' }),
      slot({ id: 'early', startTime: '09:00', endTime: '10:00' })
    ])

    expect(
      upcomingClasses(schedule, wednesdayMorning).map((item) => item.slot.id)
    ).toEqual(['early', 'late'])
    expect(upcomingClasses(schedule, wednesdayMorning, 1)).toHaveLength(1)
  })

  it('ignores slots whose course no longer exists', () => {
    const orphaned: Schedule = {
      courses: [],
      slots: [slot({ courseId: 'missing' })]
    }

    expect(upcomingClasses(orphaned, wednesdayMorning)).toEqual([])
  })
})
