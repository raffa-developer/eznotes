import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mic } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { Button, Field, Modal } from './ui'

export default function StartRecordingDialog({
  open,
  onClose,
  defaultCourseId
}: {
  open: boolean
  onClose: () => void
  defaultCourseId?: string | null
}): React.JSX.Element {
  const { schedule, nextClass, refreshUpcoming, toast } = useApp()
  const navigate = useNavigate()
  const fallbackCourse = defaultCourseId ?? nextClass?.course.id ?? schedule.courses[0]?.id ?? ''
  const [courseId, setCourseId] = useState(fallbackCourse)
  const [title, setTitle] = useState('')
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (open && !courseId) setCourseId(fallbackCourse)
  }, [open, fallbackCourse, courseId])

  const course = schedule.courses.find((item) => item.id === courseId)

  async function start(): Promise<void> {
    if (!course) {
      toast('Add a course to your schedule first.', 'warn')
      return
    }
    setStarting(true)
    try {
      await window.aula.recording.start({
        courseId: course.id,
        courseName: course.name,
        title: title.trim() || undefined,
        glossary: course.glossary
      })
      await refreshUpcoming()
      onClose()
      navigate('/live')
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setStarting(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Start a lecture"
      subtitle="Aula will listen, transcribe, and write the notes."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={starting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void start()} disabled={starting || !course}>
            <Mic size={16} />
            {starting ? 'Starting…' : 'Start recording'}
          </Button>
        </>
      }
    >
      {schedule.courses.length === 0 ? (
        <div className="inline-empty">
          <p>You need at least one course before recording.</p>
          <Button variant="outline" onClick={() => navigate('/schedule')}>
            Set up your schedule
          </Button>
        </div>
      ) : (
        <div className="form-grid">
          <Field label="Course">
            <select
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
            >
              {schedule.courses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.code ? ` · ${item.code}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Lecture title"
            hint="Optional. The model will write a better title from the content."
          >
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Introdução às derivadas"
              onKeyDown={(event) => {
                if (event.key === 'Enter') void start()
              }}
            />
          </Field>
          <div className="dialog-note">
            <span className="pulse-dot" />
            Recording uses your microphone. Aula asks about keeping the audio after class.
          </div>
        </div>
      )}
    </Modal>
  )
}
