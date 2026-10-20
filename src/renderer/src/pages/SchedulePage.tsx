import { useMemo, useState } from 'react'
import {
  CalendarDays,
  Clock,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  UserRound
} from 'lucide-react'
import type { ClassSlot, Course } from '../../../shared/types'
import { useApp } from '../state/AppContext'
import { Badge, Button, Card, EmptyState, Field, Modal } from '../components/ui'
import { uid, weekdayLong, WEEKDAYS } from '../lib/format'
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
}

const EMPTY_COURSE: CourseForm = {
  id: '',
  name: '',
  code: '',
  lecturer: '',
  color: COURSE_COLORS[0],
  glossary: ''
}

export default function SchedulePage(): React.JSX.Element {
  const { schedule, refreshSchedule, refreshUpcoming, toast } = useApp()
  const [courseForm, setCourseForm] = useState<CourseForm | null>(null)
  const [slotForm, setSlotForm] = useState<SlotForm | null>(null)
  const [deleteCourse, setDeleteCourse] = useState<Course | null>(null)
  const [saving, setSaving] = useState(false)
  const todayWeekday = ((new Date().getDay() + 6) % 7) + 1

  const slotsByDay = useMemo(() => {
    const map = new Map<number, ClassSlot[]>()
    for (const day of WEEKDAYS) map.set(day.value, [])
    for (const slot of schedule.slots) {
      map.get(slot.weekday)?.push(slot)
    }
    for (const slots of map.values()) {
      slots.sort((a, b) => a.startTime.localeCompare(b.startTime))
    }
    return map
  }, [schedule.slots])

  function courseById(id: string): Course | undefined {
    return schedule.courses.find((course) => course.id === id)
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

  async function saveCourse(): Promise<void> {
    if (!courseForm) return
    if (!courseForm.name.trim()) {
      toast('Give the course a name.', 'warn')
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
    toast(exists ? 'Course updated.' : 'Course added.', 'success')
  }

  async function saveSlot(): Promise<void> {
    if (!slotForm) return
    if (!slotForm.courseId) {
      toast('Choose a course.', 'warn')
      return
    }
    if (slotForm.endTime <= slotForm.startTime) {
      toast('The end time must be after the start time.', 'warn')
      return
    }
    const slot: ClassSlot = {
      id: slotForm.id || uid('slot_'),
      courseId: slotForm.courseId,
      weekday: slotForm.weekday,
      startTime: slotForm.startTime,
      endTime: slotForm.endTime,
      room: slotForm.room.trim() || undefined
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
    toast(exists ? 'Class updated.' : 'Class added.', 'success')
  }

  async function removeCourse(): Promise<void> {
    if (!deleteCourse) return
    const next = {
      courses: schedule.courses.filter((course) => course.id !== deleteCourse.id),
      slots: schedule.slots.filter((slot) => slot.courseId !== deleteCourse.id)
    }
    await persist(next)
    setDeleteCourse(null)
    toast('Course removed.', 'success')
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
      room: slot.room ?? ''
    })
  }

  function newSlot(weekday: number): void {
    if (!schedule.courses.length) {
      toast('Add a course first, then place it on the timetable.', 'warn')
      newCourse()
      return
    }
    setSlotForm({
      id: uid('slot_'),
      courseId: schedule.courses[0].id,
      weekday,
      startTime: '09:00',
      endTime: '10:30',
      room: ''
    })
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Timetable</p>
          <h1>Your week</h1>
          <p className="page-sub">
            ezNotes uses this to know which course a lecture belongs to and what to put
            in the note header.
          </p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" onClick={newCourse} disabled={saving}>
            <Plus size={16} />
            New course
          </Button>
          <Button
            variant="primary"
            onClick={() => newSlot(1)}
            disabled={saving}
          >
            <CalendarDays size={16} />
            Add class
          </Button>
        </div>
      </header>

      {schedule.courses.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDays size={24} />}
            title="Start with a course"
            body="Add the course name, lecturer, and any technical terms the transcription should recognise."
            action={
              <Button variant="primary" onClick={newCourse}>
                <Plus size={16} />
                Add your first course
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="schedule-grid">
          <Card className="week-card">
            <div className="panel-head">
              <div>
                <h2>Weekly timetable</h2>
                <p>{schedule.slots.length} classes scheduled</p>
              </div>
              <CalendarDays size={20} className="panel-icon" />
            </div>

            <div className="week-overview">
              {WEEKDAYS.map((day) => {
                const count = slotsByDay.get(day.value)?.length ?? 0
                return (
                  <button
                    key={day.value}
                    className={day.value === todayWeekday ? 'today' : ''}
                    aria-label={`Jump to ${day.long}`}
                    onClick={() =>
                      document
                        .getElementById(`week-day-${day.value}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                  >
                    <span>{day.short}</span>
                    <strong>{count || '–'}</strong>
                  </button>
                )
              })}
            </div>

            <div className="week-list">
              {WEEKDAYS.map((day) => {
                const slots = slotsByDay.get(day.value) ?? []
                return (
                  <div key={day.value} className="week-day" id={`week-day-${day.value}`}>
                    <div className="week-day-head">
                      <span>{day.long}</span>
                      <button
                        className="week-add"
                        onClick={() => newSlot(day.value)}
                        aria-label={`Add class on ${day.long}`}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    {slots.length ? (
                      slots.map((slot) => {
                        const course = courseById(slot.courseId)
                        if (!course) return null
                        return (
                          <button
                            key={slot.id}
                            className="slot-row"
                            onClick={() => editSlot(slot)}
                          >
                            <span
                              className="slot-color"
                              style={{ background: course.color }}
                            />
                            <span className="slot-time">
                              {slot.startTime}
                              <small>{slot.endTime}</small>
                            </span>
                            <span className="slot-main">
                              <strong>{course.name}</strong>
                              <small>
                                {slot.room ? <MapPin size={12} /> : null}
                                {slot.room || 'No room'}
                              </small>
                            </span>
                            <Pencil size={14} className="slot-edit" />
                          </button>
                        )
                      })
                    ) : (
                      <button className="slot-empty" onClick={() => newSlot(day.value)}>
                        No classes — add one
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>

          <div className="course-column">
            <div className="section-head">
              <h2>Courses</h2>
              <button className="text-link" onClick={newCourse}>
                <Plus size={14} /> Add
              </button>
            </div>
            {schedule.courses.map((course) => (
              <Card key={course.id} className="course-card">
                <div className="course-card-top">
                  <span
                    className="course-swatch"
                    style={{ background: course.color }}
                  />
                  <div className="course-card-title">
                    <h3>{course.name}</h3>
                    {course.code && course.code !== course.name ? (
                      <Badge tone="neutral">{course.code}</Badge>
                    ) : null}
                  </div>
                  <div className="course-card-actions">
                    <button
                      className="icon-button"
                      onClick={() => editCourse(course)}
                      aria-label="Edit course"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="icon-button danger"
                      onClick={() => setDeleteCourse(course)}
                      aria-label="Delete course"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="course-card-meta">
                  {course.lecturer ? (
                    <span>
                      <UserRound size={13} /> {course.lecturer}
                    </span>
                  ) : null}
                  <span>
                    <Clock size={13} />{' '}
                    {schedule.slots.filter((slot) => slot.courseId === course.id).length}{' '}
                    {schedule.slots.filter((slot) => slot.courseId === course.id).length === 1
                      ? 'class'
                      : 'classes'}{' '}
                    / week
                  </span>
                </div>
                {course.glossary.length ? (
                  <div className="tag-row">
                    {course.glossary.slice(0, 6).map((term) => (
                      <span key={term} className="tag">
                        {term}
                      </span>
                    ))}
                    {course.glossary.length > 6 ? (
                      <span className="tag">+{course.glossary.length - 6}</span>
                    ) : null}
                  </div>
                ) : (
                  <p className="course-glossary-hint">No glossary terms yet.</p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      <Modal
        open={Boolean(courseForm)}
        title={courseForm?.name ? 'Edit course' : 'New course'}
        subtitle="The glossary helps Whisper spell names and technical terms correctly."
        onClose={() => setCourseForm(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCourseForm(null)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void saveCourse()} disabled={saving}>
              {saving ? 'Saving…' : 'Save course'}
            </Button>
          </>
        }
      >
        {courseForm ? (
          <div className="form-grid">
            <Field label="Course name">
              <input
                autoFocus
                value={courseForm.name}
                onChange={(event) =>
                  setCourseForm({ ...courseForm, name: event.target.value })
                }
                placeholder="e.g. Cálculo I"
              />
            </Field>
            <div className="form-row">
              <Field label="Code" hint="Optional">
                <input
                  value={courseForm.code}
                  onChange={(event) =>
                    setCourseForm({ ...courseForm, code: event.target.value })
                  }
                  placeholder="CALC1"
                />
              </Field>
              <Field label="Lecturer" hint="Optional">
                <input
                  value={courseForm.lecturer}
                  onChange={(event) =>
                    setCourseForm({ ...courseForm, lecturer: event.target.value })
                  }
                  placeholder="Prof. Silva"
                />
              </Field>
            </div>
            <Field label="Colour">
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
              label="Glossary"
              hint="Comma-separated names, acronyms, or terms the lecturer uses."
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
        title={slotForm?.id && schedule.slots.some((slot) => slot.id === slotForm.id) ? 'Edit class' : 'Add class'}
        subtitle="Pick a course and a weekly time slot."
        onClose={() => setSlotForm(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSlotForm(null)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void saveSlot()} disabled={saving}>
              {saving ? 'Saving…' : 'Save class'}
            </Button>
          </>
        }
      >
        {slotForm ? (
          <div className="form-grid">
            <Field label="Course">
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
              <Field label="Day">
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
              <Field label="Room" hint="Optional">
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
              <Field label="Starts">
                <input
                  type="time"
                  value={slotForm.startTime}
                  onChange={(event) =>
                    setSlotForm({ ...slotForm, startTime: event.target.value })
                  }
                />
              </Field>
              <Field label="Ends">
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
        title="Remove this course?"
        subtitle="Its weekly classes will also be removed from the timetable."
        onClose={() => setDeleteCourse(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteCourse(null)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void removeCourse()} disabled={saving}>
              <Trash2 size={15} />
              {saving ? 'Removing…' : 'Remove course'}
            </Button>
          </>
        }
      >
        <p className="modal-text">
          <strong>{deleteCourse?.name}</strong> will be removed. Existing notes are
          not affected.
        </p>
      </Modal>
    </div>
  )
}
