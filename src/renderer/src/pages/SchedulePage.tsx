import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  Clock,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Upload,
  UserRound
} from 'lucide-react'
import type {
  ClassSlot,
  Course,
  Schedule,
  ScheduleImportPreview
} from '../../../shared/types'
import { useApp } from '../state/AppContext'
import { Button, Card, EmptyState, Field, Modal } from '../components/ui'
import { t, uiLocale } from '../i18n'
import { uid, weekdayLong, weekdayShort, WEEKDAYS } from '../lib/format'
import { COURSE_COLORS } from '../lib/colors'

interface CourseForm {
  id: string
  name: string
  code: string
  lecturer: string
  color: string
  glossary: string
}

interface SlotForm {
  id: string
  courseId: string
  weekday: number
  startTime: string
  endTime: string
  room: string
  startsOn?: string
  endsOn?: string
}

interface PositionedSlot {
  slot: ClassSlot
  top: number
  height: number
  left: string
  width: string
  compact: boolean
}

const EMPTY_COURSE: CourseForm = {
  id: '',
  name: '',
  code: '',
  lecturer: '',
  color: COURSE_COLORS[0],
  glossary: ''
}

const HOUR_HEIGHT = 58
const DAY_MINUTES = 24 * 60

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return Math.max(0, Math.min(DAY_MINUTES, hours * 60 + minutes))
}

function clockLabel(value: number): string {
  const total = Math.max(0, Math.min(DAY_MINUTES, value))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(
    total % 60
  ).padStart(2, '0')}`
}

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

function endOf(slot: ClassSlot): number {
  const start = toMinutes(slot.startTime)
  return Math.min(DAY_MINUTES, Math.max(start + 15, toMinutes(slot.endTime)))
}

function layoutDay(slots: ClassSlot[], startMinute: number): PositionedSlot[] {
  if (!slots.length) return []

  const sorted = [...slots].sort(
    (a, b) =>
      toMinutes(a.startTime) - toMinutes(b.startTime) ||
      endOf(a) - endOf(b)
  )

  // Split the day into groups of classes that physically overlap. Classes in
  // separate groups can use the full column width; only overlapping ones share it.
  const groups: ClassSlot[][] = []
  for (const slot of sorted) {
    const start = toMinutes(slot.startTime)
    const group = groups[groups.length - 1]
    const groupEnd = group ? Math.max(...group.map(endOf)) : -1
    if (!group || start >= groupEnd) groups.push([slot])
    else group.push(slot)
  }

  const positioned: PositionedSlot[] = []
  for (const group of groups) {
    const laneEnds: number[] = []
    const assigned: Array<{ slot: ClassSlot; lane: number; start: number; end: number }> = []

    for (const slot of group) {
      const start = toMinutes(slot.startTime)
      const end = endOf(slot)
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(end)
      } else {
        laneEnds[lane] = end
      }
      assigned.push({ slot, lane, start, end })
    }

    const lanes = Math.max(1, laneEnds.length)
    for (const { slot, lane, start, end } of assigned) {
      const rawHeight = ((end - start) / 60) * HOUR_HEIGHT
      positioned.push({
        slot,
        top: ((start - startMinute) / 60) * HOUR_HEIGHT,
        height: Math.max(22, rawHeight - 4),
        left: `${(lane / lanes) * 100}%`,
        width: `${(1 / lanes) * 100}%`,
        compact: rawHeight < 44
      })
    }
  }

  return positioned
}

export default function SchedulePage(): React.JSX.Element {
  const { schedule, refreshSchedule, refreshUpcoming, toast } = useApp()
  const [courseForm, setCourseForm] = useState<CourseForm | null>(null)
  const [slotForm, setSlotForm] = useState<SlotForm | null>(null)
  const [deleteCourse, setDeleteCourse] = useState<Course | null>(null)
  const [saving, setSaving] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [importPreview, setImportPreview] = useState<ScheduleImportPreview | null>(null)
  const [skipImportConflicts, setSkipImportConflicts] = useState(true)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const todayWeekday = ((now.getDay() + 6) % 7) + 1
  const mondayOffset = (now.getDay() + 6) % 7
  const weekStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - mondayOffset
  )
  const weekEnd = new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate() + 6
  )
  const dateFormatter = new Intl.DateTimeFormat(uiLocale(), {
    day: 'numeric',
    month: 'short'
  })
  const weekRange = `${dateFormatter.format(weekStart)} – ${dateFormatter.format(
    weekEnd
  )}`
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  const slotsByDay = useMemo(() => {
    const map = new Map<number, ClassSlot[]>()
    for (const day of WEEKDAYS) map.set(day.value, [])

    const exceptions = schedule.exceptions ?? []
    const oneOffs = schedule.oneOffs ?? []

    for (const day of WEEKDAYS) {
      const dayDate = dateForWeekday(day.value)
      const key = localDateKey(dayDate)
      for (const slot of schedule.slots) {
        if (slot.weekday !== day.value) continue
        if (!withinDateRange(key, slot.startsOn, slot.endsOn)) continue
        const exception = exceptions.find(
          (item) => item.slotId === slot.id && item.date === key
        )
        if (exception?.canceled) continue
        map.get(day.value)?.push({
          ...slot,
          startTime: exception?.startTime ?? slot.startTime,
          endTime: exception?.endTime ?? slot.endTime,
          room: exception?.room ?? slot.room
        })
      }
      for (const oneOff of oneOffs) {
        if (oneOff.date !== key) continue
        map.get(day.value)?.push({
          id: oneOff.id,
          courseId: oneOff.courseId,
          weekday: day.value,
          startTime: oneOff.startTime,
          endTime: oneOff.endTime,
          room: oneOff.room
        })
      }
      map.get(day.value)?.sort((a, b) => a.startTime.localeCompare(b.startTime))
    }

    return map
    // dateForWeekday is derived from weekStart, which changes with `now`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule.slots, schedule.oneOffs, schedule.exceptions, weekStart.getTime()])

  const range = useMemo(() => {
    const starts = schedule.slots.map((slot) => toMinutes(slot.startTime))
    const ends = schedule.slots.map(endOf)
    for (const oneOff of schedule.oneOffs ?? []) {
      starts.push(toMinutes(oneOff.startTime))
      ends.push(toMinutes(oneOff.endTime))
    }
    for (const exception of schedule.exceptions ?? []) {
      if (exception.startTime) starts.push(toMinutes(exception.startTime))
      if (exception.endTime) ends.push(toMinutes(exception.endTime))
    }
    const first = starts.length ? Math.min(...starts) : 8 * 60
    const last = ends.length ? Math.max(...ends) : 18 * 60
    const startMinute = Math.max(0, Math.floor(first / 60) * 60)
    const endMinute = Math.min(
      DAY_MINUTES,
      Math.max(startMinute + 4 * 60, Math.ceil(last / 60) * 60)
    )
    const hourMarks: number[] = []
    for (let minute = startMinute; minute <= endMinute; minute += 60) {
      hourMarks.push(minute)
    }
    return { startMinute, endMinute, hourMarks }
  }, [schedule.slots, schedule.oneOffs, schedule.exceptions])

  const dayLayouts = useMemo(() => {
    const map = new Map<number, PositionedSlot[]>()
    for (const day of WEEKDAYS) {
      map.set(
        day.value,
        layoutDay(slotsByDay.get(day.value) ?? [], range.startMinute)
      )
    }
    return map
  }, [slotsByDay, range.startMinute])

  const weeklyCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const slot of schedule.slots) {
      counts.set(slot.courseId, (counts.get(slot.courseId) ?? 0) + 1)
    }
    return counts
  }, [schedule.slots])

  const defaultStart = clockLabel(range.startMinute)
  const defaultEnd = clockLabel(Math.min(DAY_MINUTES - 1, range.startMinute + 90))
  const gridHeight = ((range.endMinute - range.startMinute) / 60) * HOUR_HEIGHT
  const showNow =
    currentMinutes >= range.startMinute && currentMinutes <= range.endMinute
  const nowTop = ((currentMinutes - range.startMinute) / 60) * HOUR_HEIGHT
  const editingSlot = Boolean(
    slotForm && schedule.slots.some((slot) => slot.id === slotForm.id)
  )

  function courseById(id: string): Course | undefined {
    return schedule.courses.find((course) => course.id === id)
  }

  function dateForWeekday(weekday: number): Date {
    const date = new Date(weekStart)
    date.setDate(weekStart.getDate() + weekday - 1)
    return date
  }

  function dayCountLabel(count: number): string {
    if (count === 0) return t('No classes')
    return t(count === 1 ? '{count} class' : '{count} classes', { count })
  }

  async function persist(next: typeof schedule): Promise<void> {
    setSaving(true)
    try {
      await window.ezNotes.schedule.save(next)
      await refreshSchedule()
      await refreshUpcoming()
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function chooseImport(): Promise<void> {
    setImporting(true)
    try {
      const preview = await window.ezNotes.schedule.chooseImport()
      if (!preview) return
      setImportPreview(preview)
      setSkipImportConflicts(preview.conflicts.length > 0)
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setImporting(false)
    }
  }

  async function applyImport(): Promise<void> {
    if (!importPreview) return
    setImporting(true)
    try {
      await window.ezNotes.schedule.applyImport(
        importPreview,
        skipImportConflicts
      )
      setImportPreview(null)
      await refreshSchedule()
      await refreshUpcoming()
      toast(t('Calendar imported.'), 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setImporting(false)
    }
  }

  async function saveCourse(): Promise<void> {
    if (!courseForm) return
    if (!courseForm.name.trim()) {
      toast(t('Give the course a name.'), 'warn')
      return
    }
    const course: Course = {
      id: courseForm.id || uid('course_'),
      name: courseForm.name.trim(),
      code: courseForm.code.trim() || undefined,
      lecturer: courseForm.lecturer.trim() || undefined,
      color: courseForm.color,
      glossary: courseForm.glossary
        .split(',')
        .map((term) => term.trim())
        .filter(Boolean)
    }
    const exists = schedule.courses.some((item) => item.id === course.id)
    const next = {
      ...schedule,
      courses: exists
        ? schedule.courses.map((item) => (item.id === course.id ? course : item))
        : [...schedule.courses, course]
    }
    await persist(next)
    setCourseForm(null)
    toast(t(exists ? 'Course updated.' : 'Course added.'), 'success')
  }

  async function saveSlot(): Promise<void> {
    if (!slotForm) return
    if (!slotForm.courseId) {
      toast(t('Choose a course.'), 'warn')
      return
    }
    if (slotForm.endTime <= slotForm.startTime) {
      toast(t('The end time must be after the start time.'), 'warn')
      return
    }
    const slot: ClassSlot = {
      id: slotForm.id || uid('slot_'),
      courseId: slotForm.courseId,
      weekday: slotForm.weekday,
      startTime: slotForm.startTime,
      endTime: slotForm.endTime,
      room: slotForm.room.trim() || undefined,
      startsOn: slotForm.startsOn,
      endsOn: slotForm.endsOn
    }
    const exists = schedule.slots.some((item) => item.id === slot.id)
    const next = {
      ...schedule,
      slots: exists
        ? schedule.slots.map((item) => (item.id === slot.id ? slot : item))
        : [...schedule.slots, slot]
    }
    await persist(next)
    setSlotForm(null)
    toast(t(exists ? 'Class updated.' : 'Class added.'), 'success')
  }

  async function removeSlot(): Promise<void> {
    if (!slotForm) return
    if (!schedule.slots.some((slot) => slot.id === slotForm.id)) {
      setSlotForm(null)
      return
    }
    const next = {
      ...schedule,
      slots: schedule.slots.filter((slot) => slot.id !== slotForm.id),
      exceptions: (schedule.exceptions ?? []).filter(
        (item) => item.slotId !== slotForm.id
      )
    }
    await persist(next)
    setSlotForm(null)
    toast(t('Class removed.'), 'success')
  }

  async function removeCourse(): Promise<void> {
    if (!deleteCourse) return
    const removedSlots = new Set(
      schedule.slots
        .filter((slot) => slot.courseId === deleteCourse.id)
        .map((slot) => slot.id)
    )
    const next = {
      courses: schedule.courses.filter((course) => course.id !== deleteCourse.id),
      slots: schedule.slots.filter((slot) => slot.courseId !== deleteCourse.id),
      oneOffs: (schedule.oneOffs ?? []).filter(
        (item) => item.courseId !== deleteCourse.id
      ),
      exceptions: (schedule.exceptions ?? []).filter(
        (item) => !removedSlots.has(item.slotId)
      )
    }
    await persist(next)
    setDeleteCourse(null)
    toast(t('Course removed.'), 'success')
  }

  function editCourse(course: Course): void {
    setCourseForm({
      id: course.id,
      name: course.name,
      code: course.code ?? '',
      lecturer: course.lecturer ?? '',
      color: course.color,
      glossary: course.glossary.join(', ')
    })
  }

  function newCourse(): void {
    setCourseForm({ ...EMPTY_COURSE, id: uid('course_') })
  }

  function editSlot(slot: ClassSlot): void {
    setSlotForm({
      id: slot.id,
      courseId: slot.courseId,
      weekday: slot.weekday,
      startTime: slot.startTime,
      endTime: slot.endTime,
      room: slot.room ?? '',
      startsOn: slot.startsOn,
      endsOn: slot.endsOn
    })
  }

  function newSlot(weekday: number, startTime = defaultStart, endTime = defaultEnd): void {
    if (!schedule.courses.length) {
      toast(t('Add a course first, then place it on the timetable.'), 'warn')
      newCourse()
      return
    }
    setSlotForm({
      id: uid('slot_'),
      courseId: schedule.courses[0].id,
      weekday,
      startTime,
      endTime,
      room: ''
    })
  }

  function createSlotFromGrid(
    weekday: number,
    event: React.MouseEvent<HTMLDivElement>
  ): void {
    if (event.target !== event.currentTarget) return
    const rect = event.currentTarget.getBoundingClientRect()
    const raw =
      range.startMinute + ((event.clientY - rect.top) / HOUR_HEIGHT) * 60
    const start = Math.max(0, Math.min(DAY_MINUTES - 30, Math.round(raw / 30) * 30))
    const end = Math.min(DAY_MINUTES - 1, start + 90)
    newSlot(weekday, clockLabel(start), clockLabel(end))
  }

  return (
    <div className="page schedule-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{t('Timetable')}</p>
          <h1>{t('Your week')}</h1>
          <p className="page-sub">
            {t(
              'Set your weekly classes once. ezNotes uses them to match lectures and prefill the note header.'
            )}
          </p>
        </div>
        <div className="page-actions">
          <Button
            variant="ghost"
            onClick={() => void chooseImport()}
            disabled={saving || importing}
          >
            <Upload size={16} />
            {t('Import .ics')}
          </Button>
          <Button variant="ghost" onClick={newCourse} disabled={saving}>
            <Plus size={16} />
            {t('New course')}
          </Button>
          <Button
            variant="primary"
            onClick={() => newSlot(todayWeekday)}
            disabled={saving}
          >
            <CalendarDays size={16} />
            {t('Add class')}
          </Button>
        </div>
      </header>

      {schedule.courses.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDays size={24} />}
            title={t('Start with a course')}
            body={t(
              'Add the course name, lecturer, and any technical terms the transcription should recognise.'
            )}
            action={
              <Button variant="primary" onClick={newCourse}>
                <Plus size={16} />
                {t('Add your first course')}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="sched-layout">
          <Card className="sched-board">
            <div className="sched-board-head">
              <div>
                <h2>{t('Weekly timetable')}</h2>
                <p>
                  {schedule.slots.length
                    ? t(
                        schedule.slots.length === 1
                          ? '{count} class scheduled'
                          : '{count} classes scheduled',
                        { count: schedule.slots.length }
                      )
                    : t('No classes yet. Click a day to add one.')}
                </p>
              </div>
              <span className="sched-week-range">
                {t('Week of {range}', { range: weekRange })}
              </span>
            </div>

            <div className="sched-grid-scroll">
              <div className="sched-grid">
                <div className="sched-head-row">
                  <div className="sched-axis-head" />
                  {WEEKDAYS.map((day) => {
                    const isToday = day.value === todayWeekday
                    const count = slotsByDay.get(day.value)?.length ?? 0
                    const date = dateForWeekday(day.value)
                    return (
                      <div
                        key={day.value}
                        className={`sched-day-head ${isToday ? 'is-today' : ''}`}
                      >
                        <div className="sched-day-top">
                          <span className="sched-day-name">
                            {weekdayShort(day.value)}
                          </span>
                          <span className="sched-day-date">{date.getDate()}</span>
                          {isToday ? (
                            <span
                              className="sched-today-dot"
                              title={t('Today')}
                            />
                          ) : null}
                        </div>
                        <div className="sched-day-bottom">
                          <span
                            className={`sched-day-count ${count === 0 ? 'is-empty' : ''}`}
                          >
                            {dayCountLabel(count)}
                          </span>
                          <button
                            className="sched-day-add"
                            type="button"
                            onClick={() => newSlot(day.value)}
                            aria-label={t('Add class on {day}', {
                              day: weekdayLong(day.value)
                            })}
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div
                  className="sched-body"
                  style={
                    {
                      height: gridHeight,
                      '--hour-height': `${HOUR_HEIGHT}px`
                    } as React.CSSProperties
                  }
                >
                  <div className="sched-axis" aria-hidden="true">
                    {range.hourMarks.map((minute) => (
                      <span
                        key={minute}
                        className="sched-axis-label"
                        style={{
                          top: ((minute - range.startMinute) / 60) * HOUR_HEIGHT
                        }}
                      >
                        {clockLabel(minute)}
                      </span>
                    ))}
                  </div>

                  {WEEKDAYS.map((day) => {
                    const isToday = day.value === todayWeekday
                    return (
                      <div
                        key={day.value}
                        className={`sched-col ${isToday ? 'is-today' : ''}`}
                        onClick={(event) => createSlotFromGrid(day.value, event)}
                        title={t('Click an empty spot to add a class.')}
                      >
                        {(dayLayouts.get(day.value) ?? []).map((positioned) => {
                          const course = courseById(positioned.slot.courseId)
                          if (!course) return null
                          const slot = positioned.slot
                          const room = slot.room?.trim()
                          return (
                            <button
                              key={slot.id}
                              type="button"
                              className={`sched-slot ${positioned.compact ? 'is-compact' : ''}`}
                              style={
                                {
                                  top: positioned.top,
                                  height: positioned.height,
                                  left: `calc(${positioned.left} + 3px)`,
                                  width: `calc(${positioned.width} - 6px)`,
                                  '--course-color': course.color
                                } as React.CSSProperties
                              }
                              onClick={(event) => {
                                event.stopPropagation()
                                if (
                                  (schedule.oneOffs ?? []).some(
                                    (item) => item.id === slot.id
                                  )
                                ) {
                                  toast(
                                    t(
                                      'One-off imported classes are read-only. Re-import the calendar to change them.'
                                    ),
                                    'info'
                                  )
                                  return
                                }
                                editSlot(slot)
                              }}
                              aria-label={`${course.name}, ${clockLabel(
                                toMinutes(slot.startTime)
                              )}–${clockLabel(endOf(slot))}${
                                room ? `, ${room}` : ''
                              }`}
                              title={`${course.name}, ${clockLabel(
                                toMinutes(slot.startTime)
                              )}–${clockLabel(endOf(slot))}${
                                room ? `, ${room}` : ''
                              }`}
                            >
                              <strong>{course.name}</strong>
                              {!positioned.compact ? (
                                <span className="sched-slot-time">
                                  {clockLabel(toMinutes(slot.startTime))}–
                                  {clockLabel(endOf(slot))}
                                </span>
                              ) : null}
                              {!positioned.compact && room ? (
                                <span className="sched-slot-meta">
                                  <MapPin size={10} /> {room}
                                </span>
                              ) : null}
                            </button>
                          )
                        })}
                        {isToday && showNow ? (
                          <div
                            className="sched-now"
                            style={{ top: nowTop }}
                            title={t('Now')}
                          />
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </Card>

          <aside className="sched-course-panel">
            <div className="sched-course-head">
              <h2>{t('Courses')}</h2>
              <span className="sched-course-total">
                {schedule.courses.length}
              </span>
              <button className="text-link" type="button" onClick={newCourse}>
                <Plus size={13} />
                {t('Add')}
              </button>
            </div>
            <Card className="sched-course-list">
              {schedule.courses.map((course) => {
                const count = weeklyCounts.get(course.id) ?? 0
                const code = course.code?.trim()
                return (
                  <div key={course.id} className="sched-course-row">
                    <span
                      className="sched-course-marker"
                      style={{ background: course.color }}
                    />
                    <button
                      className="sched-course-main"
                      type="button"
                      onClick={() => editCourse(course)}
                      aria-label={`${t('Edit course')}: ${course.name}`}
                      title={course.name}
                    >
                      <span className="sched-course-title">
                        <strong>{course.name}</strong>
                        {code && code !== course.name ? (
                          <span className="sched-course-code">{code}</span>
                        ) : null}
                      </span>
                      <span className="sched-course-meta">
                        {course.lecturer ? (
                          <span>
                            <UserRound size={11} />
                            {course.lecturer}
                          </span>
                        ) : null}
                        <span>
                          <Clock size={11} />
                          {count === 0
                            ? t('Not scheduled')
                            : t(
                                count === 1
                                  ? '{count} class / week'
                                  : '{count} classes / week',
                                { count }
                              )}
                        </span>
                      </span>
                    </button>
                    <div className="sched-course-actions">
                      <button
                        className="icon-button"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          editCourse(course)
                        }}
                        aria-label={t('Edit course')}
                        title={course.name}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className="icon-button danger"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setDeleteCourse(course)
                        }}
                        aria-label={t('Delete course')}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </Card>
          </aside>
        </div>
      )}

      <Modal
        open={Boolean(importPreview)}
        title={t('Import calendar')}
        subtitle={importPreview?.fileName}
        onClose={() => setImportPreview(null)}
        width={620}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setImportPreview(null)}
              disabled={importing}
            >
              {t('Cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => void applyImport()}
              disabled={
                importing ||
                !importPreview ||
                importPreview.slots.length +
                  importPreview.oneOffs.length ===
                  0
              }
            >
              <Upload size={15} />
              {importing ? t('Importing…') : t('Import classes')}
            </Button>
          </>
        }
      >
        {importPreview ? (
          <div className="import-preview">
            <div className="import-stats">
              <span>
                <strong>{importPreview.slots.length}</strong>{' '}
                {t('weekly classes')}
              </span>
              <span>
                <strong>{importPreview.oneOffs.length}</strong>{' '}
                {t('one-off changes')}
              </span>
              <span>
                <strong>
                  {importPreview.exceptions.filter((item) => item.canceled).length}
                </strong>{' '}
                {t('cancellations')}
              </span>
              <span>
                <strong>{importPreview.skipped}</strong> {t('skipped')}
              </span>
            </div>

            {importPreview.courses.length ? (
              <div className="import-courses">
                {importPreview.courses.map((course) => (
                  <span key={`${course.name}-${course.code ?? ''}`}>
                    {course.name}
                    {course.code ? <small>{course.code}</small> : null}
                  </span>
                ))}
              </div>
            ) : null}

            {importPreview.conflicts.length ? (
              <div className="banner banner-warn">
                <AlertTriangle size={16} />
                <span>
                  {t(
                    importPreview.conflicts.length === 1
                      ? '{count} time conflict with your current timetable.'
                      : '{count} time conflicts with your current timetable.',
                    { count: importPreview.conflicts.length }
                  )}
                  <small className="import-conflict-list">
                    {importPreview.conflicts.slice(0, 4).join('; ')}
                  </small>
                </span>
              </div>
            ) : null}

            {importPreview.conflicts.length ? (
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={skipImportConflicts}
                  onChange={(event) =>
                    setSkipImportConflicts(event.target.checked)
                  }
                />
                <span>
                  <strong>{t('Skip conflicting classes')}</strong>
                  <small>
                    {t(
                      'Leave this off to add both classes and resolve the overlap in the timetable.'
                    )}
                  </small>
                </span>
              </label>
            ) : null}

            {importPreview.warnings.length ? (
              <div className="import-warnings">
                {importPreview.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(courseForm)}
        title={t(courseForm?.name ? 'Edit course' : 'New course')}
        subtitle={t(
          'The glossary helps Whisper spell names and technical terms correctly.'
        )}
        onClose={() => setCourseForm(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCourseForm(null)} disabled={saving}>
              {t('Cancel')}
            </Button>
            <Button variant="primary" onClick={() => void saveCourse()} disabled={saving}>
              {saving ? t('Saving…') : t('Save course')}
            </Button>
          </>
        }
      >
        {courseForm ? (
          <div className="form-grid">
            <Field label={t('Course name')}>
              <input
                autoFocus
                value={courseForm.name}
                onChange={(event) =>
                  setCourseForm({ ...courseForm, name: event.target.value })
                }
                placeholder={t('e.g. Cálculo I')}
              />
            </Field>
            <div className="form-row">
              <Field label={t('Code')} hint={t('Optional')}>
                <input
                  value={courseForm.code}
                  onChange={(event) =>
                    setCourseForm({ ...courseForm, code: event.target.value })
                  }
                  placeholder="CALC1"
                />
              </Field>
              <Field label={t('Lecturer')} hint={t('Optional')}>
                <input
                  value={courseForm.lecturer}
                  onChange={(event) =>
                    setCourseForm({ ...courseForm, lecturer: event.target.value })
                  }
                  placeholder="Prof. Silva"
                />
              </Field>
            </div>
            <Field label={t('Colour')}>
              <div className="color-row">
                {COURSE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`color-swatch ${courseForm.color === color ? 'active' : ''}`}
                    style={{ background: color }}
                    onClick={() => setCourseForm({ ...courseForm, color })}
                    aria-label={color}
                  />
                ))}
              </div>
            </Field>
            <Field
              label={t('Glossary')}
              hint={t('Comma-separated names, acronyms, or terms the lecturer uses.')}
            >
              <textarea
                value={courseForm.glossary}
                onChange={(event) =>
                  setCourseForm({ ...courseForm, glossary: event.target.value })
                }
                placeholder="derivada, integral, teorema fundamental, Lagrange"
                rows={3}
              />
            </Field>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(slotForm)}
        title={t(editingSlot ? 'Edit class' : 'Add class')}
        subtitle={t('Pick a course and a weekly time slot.')}
        onClose={() => setSlotForm(null)}
        footer={
          <>
            {editingSlot ? (
              <Button
                variant="ghost"
                className="sched-delete-slot"
                onClick={() => void removeSlot()}
                disabled={saving}
              >
                <Trash2 size={15} />
                {t('Delete class')}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setSlotForm(null)} disabled={saving}>
              {t('Cancel')}
            </Button>
            <Button variant="primary" onClick={() => void saveSlot()} disabled={saving}>
              {saving ? t('Saving…') : t('Save class')}
            </Button>
          </>
        }
      >
        {slotForm ? (
          <div className="form-grid">
            <Field label={t('Course')}>
              <select
                value={slotForm.courseId}
                onChange={(event) =>
                  setSlotForm({ ...slotForm, courseId: event.target.value })
                }
              >
                {schedule.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-row">
              <Field label={t('Day')}>
                <select
                  value={slotForm.weekday}
                  onChange={(event) =>
                    setSlotForm({ ...slotForm, weekday: Number(event.target.value) })
                  }
                >
                  {WEEKDAYS.map((day) => (
                    <option key={day.value} value={day.value}>
                      {weekdayLong(day.value)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('Room')} hint={t('Optional')}>
                <input
                  value={slotForm.room}
                  onChange={(event) =>
                    setSlotForm({ ...slotForm, room: event.target.value })
                  }
                  placeholder="B2.14"
                />
              </Field>
            </div>
            <div className="form-row">
              <Field label={t('Starts')}>
                <input
                  type="time"
                  value={slotForm.startTime}
                  onChange={(event) =>
                    setSlotForm({ ...slotForm, startTime: event.target.value })
                  }
                />
              </Field>
              <Field label={t('Ends')}>
                <input
                  type="time"
                  value={slotForm.endTime}
                  onChange={(event) =>
                    setSlotForm({ ...slotForm, endTime: event.target.value })
                  }
                />
              </Field>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(deleteCourse)}
        title={t('Remove this course?')}
        subtitle={t('Its weekly classes will also be removed from the timetable.')}
        onClose={() => setDeleteCourse(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteCourse(null)} disabled={saving}>
              {t('Cancel')}
            </Button>
            <Button variant="danger" onClick={() => void removeCourse()} disabled={saving}>
              <Trash2 size={15} />
              {saving ? t('Removing…') : t('Remove course')}
            </Button>
          </>
        }
      >
        <p className="modal-text">
          <strong>{deleteCourse?.name}</strong>{' '}
          {t('will be removed. Existing notes are not affected.')}
        </p>
      </Modal>
    </div>
  )
}
