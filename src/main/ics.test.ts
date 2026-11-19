import { describe, expect, it } from 'vitest'
import { parseIcs } from './ics'

const CALENDAR = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:redes-1
SUMMARY:Redes - Aula teórica
DTSTART;TZID=Europe/Lisbon:20260915T100000
DTEND;TZID=Europe/Lisbon:20260915T120000
RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261215T100000Z
EXDATE;TZID=Europe/Lisbon:20261006T100000
LOCATION:Anfiteatro 2
END:VEVENT
BEGIN:VEVENT
UID:redes-1
RECURRENCE-ID;TZID=Europe/Lisbon:20261110T100000
SUMMARY:Redes - Aula especial
DTSTART;TZID=Europe/Lisbon:20261111T140000
DTEND;TZID=Europe/Lisbon:20261111T160000
LOCATION:Sala 3
END:VEVENT
BEGIN:VEVENT
UID:calculo-1
SUMMARY:Cálculo - Revisões
DTSTART:20261120T090000
DTEND:20261120T103000
END:VEVENT
BEGIN:VEVENT
UID:counted
SUMMARY:Redes - Laboratório
DTSTART;TZID=Europe/Lisbon:20260921T140000
DTEND;TZID=Europe/Lisbon:20260921T153000
RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3
END:VEVENT
BEGIN:VEVENT
UID:fortnightly
SUMMARY:Redes - Quinzenal
DTSTART;TZID=Europe/Lisbon:20260922T160000
DTEND;TZID=Europe/Lisbon:20260922T170000
RRULE:FREQ=WEEKLY;INTERVAL=2
END:VEVENT
END:VCALENDAR`

describe('parseIcs', () => {
  it('imports recurring classes with bounds and cancellations', () => {
    const preview = parseIcs(CALENDAR, 'semester.ics')

    expect(preview.fileName).toBe('semester.ics')
    expect(preview.courses).toEqual(
      expect.arrayContaining([
        { name: 'Redes' },
        { name: 'Cálculo' }
      ])
    )

    const lecture = preview.slots.find((slot) => slot.key === 'redes-1:2')
    expect(lecture).toMatchObject({
      courseName: 'Redes',
      weekday: 2,
      startTime: '10:00',
      endTime: '12:00',
      startsOn: '2026-09-15',
      endsOn: '2026-12-15',
      room: 'Anfiteatro 2'
    })
    expect(preview.exceptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotKey: 'redes-1:2',
          date: '2026-10-06',
          canceled: true
        })
      ])
    )
  })

  it('imports moved occurrences and standalone events', () => {
    const preview = parseIcs(CALENDAR)
    expect(preview.exceptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotKey: 'redes-1:2',
          date: '2026-11-10',
          canceled: true
        })
      ])
    )
    expect(preview.oneOffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          courseName: 'Redes',
          date: '2026-11-11',
          startTime: '14:00',
          endTime: '16:00',
          room: 'Sala 3'
        }),
        expect.objectContaining({
          courseName: 'Cálculo',
          date: '2026-11-20',
          startTime: '09:00',
          endTime: '10:30'
        })
      ])
    )
  })

  it('computes COUNT ranges and skips unsupported recurrences', () => {
    const preview = parseIcs(CALENDAR)
    const lab = preview.slots.find((slot) => slot.key === 'counted:1')
    expect(lab?.endsOn).toBe('2026-10-05')
    expect(preview.skipped).toBe(1)
    expect(preview.warnings.join(' ')).toContain('weekly recurring')
  })

  it('handles DST when converting a named timezone', () => {
    const summer = parseIcs(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:summer
SUMMARY:Redes - Verão
DTSTART;TZID=Europe/Lisbon:20260715T100000
DTEND;TZID=Europe/Lisbon:20260715T110000
END:VEVENT
END:VCALENDAR`)
    const winter = parseIcs(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:winter
SUMMARY:Redes - Inverno
DTSTART;TZID=Europe/Lisbon:20261215T100000
DTEND;TZID=Europe/Lisbon:20261215T110000
END:VEVENT
END:VCALENDAR`)

    expect(summer.oneOffs[0]).toMatchObject({ startTime: '10:00', endTime: '11:00' })
    expect(winter.oneOffs[0]).toMatchObject({ startTime: '10:00', endTime: '11:00' })
  })
})
