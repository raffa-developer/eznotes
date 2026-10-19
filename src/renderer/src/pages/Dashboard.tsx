import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  KeyRound,
  Mic,
  Sparkles,
  UserRound
} from 'lucide-react'
import { useApp } from '../state/AppContext'
import { useNow } from '../hooks/useNow'
import StartRecordingDialog from '../components/StartRecordingDialog'
import { Badge, Button, Card, EmptyState } from '../components/ui'
import {
  countdown,
  formatDuration,
  formatTime,
  greeting,
  isSameDay,
  weekdayLong
} from '../lib/format'

export default function Dashboard(): React.JSX.Element {
  const {
    settings,
    schedule,
    upcoming,
    notes,
    recording,
    nextClass,
    loading
  } = useApp()
  const [startOpen, setStartOpen] = useState(false)
  const now = useNow()
  const navigate = useNavigate()
  const activeRecording =
    recording &&
    ['recording', 'paused', 'processing', 'error'].includes(recording.status)

  const todayClasses = upcoming.filter((item) =>
    isSameDay(new Date(item.startsAt), now)
  )
  const totalHours = useMemo(
    () => notes.reduce((sum, note) => sum + note.durationSec, 0),
    [notes]
  )
  const recent = notes.slice(0, 3)
  const needsGroq = settings ? !settings.hasGroqKey && !settings.demoMode : false
  const needsLlm = settings ? !settings.hasLlmKey && !settings.demoMode : false
  const needsCourses = schedule.courses.length === 0
  const setupComplete = !needsGroq && !needsLlm && !needsCourses

  if (loading) {
    return (
      <div className="page loading-page">
        <div className="loading-mark" />
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">
            {new Intl.DateTimeFormat('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long'
            }).format(now)}
          </p>
          <h1>{greeting(now)}.</h1>
          <p className="page-sub">
            {nextClass
              ? `${nextClass.course.name} ${countdown(nextClass.startsAt, now)}.`
              : 'Nothing on the timetable right now. Ready when you are.'}
          </p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" onClick={() => navigate('/library')}>
            <BookOpen size={16} />
            Library
          </Button>
          {activeRecording ? (
            <Button variant="primary" onClick={() => navigate('/live')}>
              <Mic size={16} />
              Open live lecture
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setStartOpen(true)}>
              <Mic size={16} />
              Record lecture
            </Button>
          )}
        </div>
      </header>

      {settings?.demoMode ? (
        <div className="banner banner-warn" style={{ marginBottom: 22 }}>
          <AlertTriangle size={17} />
          <span>
            Demo mode is on. Transcription and note writing return canned Portuguese
            content, so you can test the full flow without API keys.
          </span>
        </div>
      ) : null}

      {!setupComplete ? (
        <Card className="setup-card">
          <div className="setup-copy">
            <Badge tone="accent">
              <Sparkles size={13} />
              Setup
            </Badge>
            <h2>
              {settings?.demoMode
                ? 'One small step before the first lecture.'
                : 'Three small steps before the first lecture.'}
            </h2>
            <p>
              {settings?.demoMode
                ? 'Demo mode is on, so the two API steps are simulated. Add your timetable to try a full lecture.'
                : 'Keys stay on this PC, encrypted with Windows DPAPI. Notes are plain Markdown files.'}
            </p>
          </div>
          <div className="setup-steps">
            <button
              className={`setup-step ${needsCourses ? '' : 'done'}`}
              onClick={() => navigate('/schedule')}
            >
              <span className="setup-icon">
                {needsCourses ? <CalendarDays size={18} /> : <CheckCircle2 size={18} />}
              </span>
              <span>
                <strong>Add your timetable</strong>
                <small>{needsCourses ? 'Courses and weekly slots' : 'Timetable ready'}</small>
              </span>
              <ArrowRight size={15} />
            </button>
            {!settings?.demoMode ? (
              <>
                <button
                  className={`setup-step ${needsGroq ? '' : 'done'}`}
                  onClick={() => navigate('/settings')}
                >
                  <span className="setup-icon">
                    {needsGroq ? <KeyRound size={18} /> : <CheckCircle2 size={18} />}
                  </span>
                  <span>
                    <strong>Groq key for listening</strong>
                    <small>{needsGroq ? 'Whisper transcription' : 'Connected'}</small>
                  </span>
                  <ArrowRight size={15} />
                </button>
                <button
                  className={`setup-step ${needsLlm ? '' : 'done'}`}
                  onClick={() => navigate('/settings')}
                >
                  <span className="setup-icon">
                    {needsLlm ? <KeyRound size={18} /> : <CheckCircle2 size={18} />}
                  </span>
                  <span>
                    <strong>OpenCode key for notes</strong>
                    <small>{needsLlm ? 'Live outline and structure' : 'Connected'}</small>
                  </span>
                  <ArrowRight size={15} />
                </button>
              </>
            ) : null}
          </div>
        </Card>
      ) : null}

      <div className="dashboard-grid">
        <Card
          className="next-class-card"
          style={
            nextClass
              ? ({ '--course-color': nextClass.course.color } as React.CSSProperties)
              : undefined
          }
        >
          {nextClass ? (
            <>
              <div className="next-class-top">
                <span className="course-line" style={{ background: nextClass.course.color }} />
                <div>
                  <p className="eyebrow">
                    {nextClass.isNow ? 'In progress' : 'Next lecture'}
                  </p>
                  <h2>{nextClass.course.name}</h2>
                  <p className="next-class-meta">
                    {nextClass.course.code ? `${nextClass.course.code} · ` : ''}
                    {weekdayLong(nextClass.slot.weekday)}, {formatTime(nextClass.slot.startTime)}–
                    {formatTime(nextClass.slot.endTime)}
                    {nextClass.slot.room ? ` · ${nextClass.slot.room}` : ''}
                  </p>
                </div>
                <Badge tone={nextClass.isNow ? 'accent' : 'neutral'}>
                  {nextClass.isNow ? 'Live now' : countdown(nextClass.startsAt, now)}
                </Badge>
              </div>

              <div className="next-class-bottom">
                <div className="next-class-facts">
                  {nextClass.course.lecturer ? (
                    <span>
                      <UserRound size={14} />
                      {nextClass.course.lecturer}
                    </span>
                  ) : null}
                  <span>
                    <Clock size={14} />
                    {formatDuration(
                      (new Date(nextClass.endsAt).getTime() -
                        new Date(nextClass.startsAt).getTime()) /
                        1000
                    )}
                  </span>
                  {nextClass.course.glossary.length ? (
                    <span>
                      <BookOpen size={14} />
                      {nextClass.course.glossary.length} glossary terms
                    </span>
                  ) : null}
                </div>
                <Button
                  variant="primary"
                  onClick={() =>
                    activeRecording ? navigate('/live') : setStartOpen(true)
                  }
                >
                  <Mic size={16} />
                  {activeRecording ? 'Open live lecture' : 'Record this class'}
                </Button>
              </div>
            </>
          ) : (
            <EmptyState
              icon={<CalendarDays size={24} />}
              title="No upcoming classes"
              body="Add your weekly timetable and Aula will always show the next lecture here."
              action={
                <Button variant="outline" onClick={() => navigate('/schedule')}>
                  Open schedule
                </Button>
              }
            />
          )}
        </Card>

        <div className="stat-stack">
          <Card className="stat-card">
            <span className="stat-icon">
              <BookOpen size={17} />
            </span>
            <div>
              <strong>{notes.length}</strong>
              <small>notes written</small>
            </div>
          </Card>
          <Card className="stat-card">
            <span className="stat-icon">
              <Clock size={17} />
            </span>
            <div>
              <strong>{formatDuration(totalHours)}</strong>
              <small>lectures captured</small>
            </div>
          </Card>
          <Card className="stat-card">
            <span className="stat-icon">
              <CalendarDays size={17} />
            </span>
            <div>
              <strong>{schedule.courses.length}</strong>
              <small>courses this term</small>
            </div>
          </Card>
        </div>
      </div>

      <div className="two-col">
        <section>
          <div className="section-head">
            <h2>Today</h2>
            <Link to="/schedule" className="text-link">
              Full week <ArrowRight size={14} />
            </Link>
          </div>
          {todayClasses.length ? (
            <div className="today-list">
              {todayClasses.map((item) => (
                <Card key={`${item.slot.id}-${item.startsAt}`} className="today-row">
                  <span className="today-time">
                    {formatTime(item.slot.startTime)}
                    <small>{formatTime(item.slot.endTime)}</small>
                  </span>
                  <span
                    className="today-color"
                    style={{ background: item.course.color }}
                  />
                  <span className="today-main">
                    <strong>{item.course.name}</strong>
                    <small>
                      {item.slot.room || 'No room'}
                      {item.course.lecturer ? ` · ${item.course.lecturer}` : ''}
                    </small>
                  </span>
                  <Badge tone={item.isNow ? 'accent' : 'neutral'}>
                    {item.isNow ? 'Now' : countdown(item.startsAt, now)}
                  </Badge>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="quiet-card">
              <p>No classes today. A good day to revisit your notes.</p>
            </Card>
          )}
        </section>

        <section>
          <div className="section-head">
            <h2>Recent notes</h2>
            <Link to="/library" className="text-link">
              All notes <ArrowRight size={14} />
            </Link>
          </div>
          {recent.length ? (
            <div className="recent-list">
              {recent.map((note) => (
                <button
                  key={note.id}
                  className="recent-note"
                  onClick={() => navigate(`/notes/${note.id}`)}
                >
                  <span className="recent-date">
                    {new Intl.DateTimeFormat('en-GB', {
                      day: '2-digit',
                      month: 'short'
                    }).format(new Date(note.date))}
                  </span>
                  <span className="recent-main">
                    <strong>{note.title}</strong>
                    <small>
                      {note.courseName} · {formatDuration(note.durationSec)}
                    </small>
                    {note.summary ? <em>{note.summary}</em> : null}
                  </span>
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          ) : (
            <Card className="quiet-card">
              <p>Your first structured note will appear here after a lecture.</p>
            </Card>
          )}
        </section>
      </div>

      <p className="footnote">
        Recording a lecture may require permission. Aula shows a recording indicator;
        you are responsible for informing the lecturer and following your institution's rules.
      </p>

      <StartRecordingDialog
        open={startOpen}
        onClose={() => setStartOpen(false)}
        defaultCourseId={nextClass?.course.id}
      />
    </div>
  )
}
