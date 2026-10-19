import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  AudioLines,
  Check,
  Clock,
  Loader2,
  Pause,
  Play,
  Settings as SettingsIcon,
  Square,
  Trash2,
  Waves
} from 'lucide-react'
import type { LiveTranscriptSegment, StoppedRecording } from '../../../shared/types'
import { useApp } from '../state/AppContext'
import { Badge, Button, Card, Modal } from '../components/ui'
import {
  formatDuration,
  formatTimer,
  formatTimestamp
} from '../lib/format'

export default function Live(): React.JSX.Element {
  const {
    recording,
    settings,
    schedule,
    level,
    setRecording,
    refreshNotes,
    toast
  } = useApp()
  const navigate = useNavigate()

  const [segments, setSegments] = useState<LiveTranscriptSegment[]>([])
  const [outline, setOutline] = useState<string[]>([])
  const [elapsed, setElapsed] = useState(recording?.elapsedSec ?? 0)
  const [stopConfirm, setStopConfirm] = useState(false)
  const [stopped, setStopped] = useState<StoppedRecording | null>(null)
  const [keepChoice, setKeepChoice] = useState<boolean | null>(null)
  const [finalizing, setFinalizing] = useState(false)
  const [processing, setProcessing] = useState<{ step: string; progress: number } | null>(
    null
  )
  const [finalizeError, setFinalizeError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const course = schedule.courses.find((item) => item.id === recording?.courseId)
  const retentionDays = settings?.settings.retentionDays ?? 30
  const isRecording = recording?.status === 'recording'
  const isPaused = recording?.status === 'paused'
  const isProcessing = recording?.status === 'processing' || finalizing
  const hasGroq = (settings?.hasGroqKey ?? false) || (settings?.demoMode ?? false)
  const hasLlm = (settings?.hasLlmKey ?? false) || (settings?.demoMode ?? false)
  const needsFinalize =
    !stopped && !isProcessing && ['stopped', 'error'].includes(recording?.status ?? '')

  useEffect(() => {
    if (!recording) return
    setElapsed((current) => Math.max(current, recording.elapsedSec))
  }, [recording?.elapsedSec])

  useEffect(() => {
    if (!isRecording) return
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [isRecording])

  useEffect(() => {
    let cancelled = false
    const unsubscribe = window.ezNotes.recording.onEvent((event) => {
      if (event.type === 'transcript') {
        setSegments((current) => {
          if (current.some((item) => item.id === event.segment.id)) return current
          return [...current, event.segment]
        })
      }
      if (event.type === 'outline') {
        setOutline(event.outline.bullets)
      }
      if (event.type === 'processing') {
        setProcessing({ step: event.step, progress: event.progress })
      }
      if (event.type === 'state' && event.snapshot?.status === 'done') {
        setProcessing(null)
      }
    })

    void window.ezNotes.recording
      .live()
      .then((state) => {
        if (cancelled) return
        setRecording(state.snapshot)
        if (state.snapshot) {
          setElapsed((current) => Math.max(current, state.snapshot!.elapsedSec))
        }
        if (state.segments.length) {
          setSegments((current) => mergeLiveSegments(state.segments, current))
        }
        if (state.outline.length) {
          setOutline(state.outline)
        }
        if (state.processing) {
          setProcessing(state.processing)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          toast(
            `Could not restore the live view: ${error instanceof Error ? error.message : String(error)}`,
            'warn'
          )
        }
      })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [setRecording, toast])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [segments.length])

  useEffect(() => {
    if (!recording) {
      setSegments([])
      setOutline([])
    }
  }, [recording])

  async function stopRecording(): Promise<void> {
    setStopConfirm(false)
    try {
      const result = await window.ezNotes.recording.stop()
      setStopped(result)
      setElapsed(result.durationSec)
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  async function finalize(keepAudio: boolean): Promise<void> {
    if (!stopped || !recording) return
    setKeepChoice(keepAudio)
    setFinalizing(true)
    setFinalizeError(null)
    setProcessing({ step: 'Preparing the lecture', progress: 0.02 })
    try {
      const result = await window.ezNotes.recording.finalize({
        id: stopped.id,
        keepAudio,
        courseId: recording.courseId,
        courseName: recording.courseName,
        title: recording.title,
        glossary: course?.glossary ?? []
      })
      setProcessing(null)
      setStopped(null)
      setRecording(null)
      setFinalizing(false)
      await refreshNotes()
      result.warnings.forEach((warning) => toast(warning, 'warn'))
      toast(
        result.audioKept
          ? `Notes written. Audio will be removed after ${retentionDays} days.`
          : 'Notes written. Audio deleted.',
        'success'
      )
      navigate(`/notes/${result.note.id}`)
    } catch (error) {
      setProcessing(null)
      setFinalizeError(error instanceof Error ? error.message : String(error))
      setFinalizing(false)
    }
  }

  async function discard(): Promise<void> {
    if (stopped) await window.ezNotes.recording.discard(stopped.id)
    else if (recording) await window.ezNotes.recording.discard(recording.id)
    setStopped(null)
    setProcessing(null)
    setRecording(null)
    navigate('/')
  }

  if (!recording) {
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <Link to="/" className="back-link">
              <ArrowLeft size={15} /> Home
            </Link>
            <h1>No active lecture.</h1>
            <p className="page-sub">Start a recording from the home screen.</p>
          </div>
        </header>
      </div>
    )
  }

  return (
    <div className="page live-page">
      <header className="live-head">
        <div>
          <div className="live-course-line">
            <span
              className="course-line"
              style={{ background: course?.color ?? '#d8ff6a' }}
            />
            <span>{recording.courseName}</span>
            <Badge tone={isRecording ? 'danger' : isPaused ? 'warn' : 'neutral'}>
              <span className={`rec-dot ${recording.status}`} />
              {isProcessing
                ? 'Writing notes'
                : isPaused
                  ? 'Paused'
                  : isRecording
                    ? 'Recording'
                    : recording.status}
            </Badge>
          </div>
          <h1>{recording.title}</h1>
          <p className="page-sub">
            Started{' '}
            {new Intl.DateTimeFormat('en-GB', {
              hour: '2-digit',
              minute: '2-digit'
            }).format(new Date(recording.startedAt))}
            {course?.lecturer ? ` · ${course.lecturer}` : ''}
          </p>
        </div>
        <div className="live-timer">
          <span>{formatTimer(elapsed)}</span>
          <small>{formatDuration(elapsed)} captured</small>
        </div>
      </header>

      {!hasGroq && !isProcessing ? (
        <div className="banner banner-warn">
          <AlertTriangle size={17} />
          <span>
            Live transcription needs a Groq API key.{' '}
            <Link to="/settings">Add it in Settings</Link>.
          </span>
        </div>
      ) : null}

      {needsFinalize && recording ? (
        <div className={`banner ${recording.status === 'error' ? 'banner-error' : 'banner-warn'}`}>
          <AlertTriangle size={17} />
          <span>
            {recording.status === 'error'
              ? recording.error ?? 'The last processing step failed.'
              : 'This recording is stopped and waiting for notes.'}{' '}
            <button
              className="inline-link"
              onClick={() =>
                setStopped({
                  id: recording.id,
                  startedAt: recording.startedAt,
                  durationSec: recording.elapsedSec,
                  audioPath: ''
                })
              }
            >
              {recording.status === 'error' ? 'Try again' : 'Continue'}
            </button>{' '}
            or{' '}
            <button className="inline-link" onClick={() => void discard()}>
              delete this recording
            </button>
            .
          </span>
        </div>
      ) : null}

      <div className="live-grid">
        <Card className="transcript-card">
          <div className="panel-head">
            <div>
              <h2>Transcript</h2>
              <p>
                {segments.length
                  ? `${segments.length} segments · Portuguese`
                  : 'Listening for speech…'}
              </p>
            </div>
            <Waves size={20} className={isRecording ? 'wave-icon active' : 'wave-icon'} />
          </div>

          <div className="transcript-scroll">
            {segments.length ? (
              <>
                {segments.map((segment) => (
                  <div key={segment.id} className="transcript-line">
                    <button
                      className="transcript-time"
                      onClick={() => {
                        const audio = document.querySelector<HTMLAudioElement>(
                          'audio[data-eznotes-audio]'
                        )
                        if (audio) audio.currentTime = segment.start
                      }}
                    >
                      {formatTimestamp(segment.start)}
                    </button>
                    <p>{segment.text}</p>
                  </div>
                ))}
                <div ref={bottomRef} />
              </>
            ) : (
              <div className="listening-state">
                <span className="listening-orb">
                  <AudioLines size={26} />
                </span>
                <h3>{hasGroq ? 'The microphone is open.' : 'Recording audio locally.'}</h3>
                <p>
                  {hasGroq
                    ? 'The first words will appear a few seconds after someone starts speaking.'
                    : 'Add a Groq key to turn this audio into a live transcript. The recording is still being saved.'}
                </p>
              </div>
            )}
          </div>

          <div className="transcript-foot">
            <span className="level-meter" aria-label="Microphone level">
              {Array.from({ length: 18 }).map((_, index) => (
                <i
                  key={index}
                  style={{
                    height: `${6 + level * 26 * (0.35 + Math.abs(Math.sin(index * 1.7)))}px`,
                    opacity: level > 0.02 ? 0.45 + level * 0.55 : 0.2
                  }}
                />
              ))}
            </span>
            <span className="transcript-mic">
              {settings?.settings.microphoneId ? 'Selected microphone' : 'Default microphone'}
            </span>
          </div>
        </Card>

        <div className="live-side">
          <Card className="outline-card">
            <div className="panel-head">
              <div>
                <h2>Live outline</h2>
                <p>Updates every ~90 seconds</p>
              </div>
              <SparkIcon />
            </div>
            {outline.length ? (
              <ul className="outline-list">
                {outline.map((bullet, index) => (
                  <li key={`${bullet}-${index}`}>
                    <span className="outline-index">{String(index + 1).padStart(2, '0')}</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="outline-empty">
                <p>
                  {hasLlm
                    ? 'The outline will appear once there is enough academic content.'
                    : 'Add an OpenCode key in Settings to get a live outline.'}
                </p>
                {!hasLlm ? (
                  <Link to="/settings" className="text-link">
                    <SettingsIcon size={14} /> Open settings
                  </Link>
                ) : null}
              </div>
            )}
          </Card>

          <Card className="session-card">
            <div className="session-row">
              <Clock size={16} />
              <span>
                <small>Duration</small>
                <strong>{formatDuration(elapsed)}</strong>
              </span>
            </div>
            <div className="session-row">
              <AudioLines size={16} />
              <span>
                <small>Source</small>
                <strong>{settings?.settings.microphoneId ? 'Chosen mic' : 'System default'}</strong>
              </span>
            </div>
            <div className="session-row">
              <Trash2 size={16} />
              <span>
                <small>Audio policy</small>
                <strong>Ask after class</strong>
              </span>
            </div>
            <p className="session-note">
              If you keep the audio, it is deleted automatically after {retentionDays} days.
            </p>
          </Card>
        </div>
      </div>

      <div className="control-dock">
        <div className="dock-status">
          <span className={`rec-dot ${recording.status}`} />
          <span>{isPaused ? 'Paused' : isRecording ? 'Listening' : 'Stopped'}</span>
          <small>{formatTimer(elapsed)}</small>
        </div>
        <div className="dock-actions">
          {isPaused ? (
            <Button
              variant="soft"
              onClick={() => void window.ezNotes.recording.resume()}
              disabled={isProcessing}
            >
              <Play size={16} />
              Resume
            </Button>
          ) : (
            <Button
              variant="soft"
              onClick={() => void window.ezNotes.recording.pause()}
              disabled={!isRecording || isProcessing}
            >
              <Pause size={16} />
              Pause
            </Button>
          )}
          <Button
            variant="danger"
            onClick={() => setStopConfirm(true)}
            disabled={!isRecording && !isPaused}
          >
            <Square size={15} />
            Stop & write notes
          </Button>
        </div>
      </div>

      <Modal
        open={stopConfirm}
        title="Finish this lecture?"
        subtitle="ezNotes will transcribe the full recording and write structured notes."
        onClose={() => setStopConfirm(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setStopConfirm(false)}>
              Keep recording
            </Button>
            <Button variant="primary" onClick={() => void stopRecording()}>
              <Check size={16} />
              Stop & continue
            </Button>
          </>
        }
      >
        <p className="modal-text">
          You have captured <strong>{formatDuration(elapsed)}</strong>. The final pass
          re-transcribes the audio for better accuracy than the live transcript.
        </p>
      </Modal>

      <Modal
        open={Boolean(stopped) && !isProcessing}
        title="What should happen to the audio?"
        subtitle="The transcript and notes are kept either way."
        onClose={() => undefined}
        footer={
          finalizeError ? (
            <>
              <Button variant="ghost" onClick={() => void discard()}>
                Delete recording
              </Button>
              <Button
                variant="primary"
                onClick={() => void finalize(keepChoice ?? true)}
              >
                Retry
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => void finalize(false)}
                disabled={finalizing}
              >
                <Trash2 size={15} />
                Delete audio now
              </Button>
              <Button
                variant="primary"
                onClick={() => void finalize(true)}
                disabled={finalizing}
              >
                <Check size={15} />
                Keep for {retentionDays} days
              </Button>
            </>
          )
        }
      >
        <div className="retention-options">
          <div className="retention-row">
            <span className="retention-icon">
              <Check size={18} />
            </span>
            <div>
              <strong>Keep the recording for {retentionDays} days</strong>
              <p>You can replay it, jump to timestamps, or regenerate notes later.</p>
            </div>
          </div>
          <div className="retention-row">
            <span className="retention-icon muted">
              <Trash2 size={18} />
            </span>
            <div>
              <strong>Delete the audio now</strong>
              <p>The transcript and Markdown note stay in your library.</p>
            </div>
          </div>
        </div>
        {finalizeError ? (
          <div className="banner banner-error">
            <AlertTriangle size={16} />
            <span>{finalizeError}</span>
          </div>
        ) : null}
      </Modal>

      {isProcessing ? (
        <div className="processing-overlay">
          <div className="processing-card">
            <span className="processing-icon">
              <Loader2 size={26} className="spin" />
            </span>
            <h2>Writing your notes</h2>
            <p>{processing?.step ?? 'Working through the lecture…'}</p>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${Math.round((processing?.progress ?? 0.05) * 100)}%` }}
              />
            </div>
            <small>
              {processing ? `${Math.round(processing.progress * 100)}%` : 'This can take a minute.'}
            </small>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function mergeLiveSegments(
  primary: LiveTranscriptSegment[],
  extra: LiveTranscriptSegment[]
): LiveTranscriptSegment[] {
  const byId = new Map(primary.map((segment) => [segment.id, segment]))
  for (const segment of extra) byId.set(segment.id, segment)
  return [...byId.values()].sort((a, b) => a.start - b.start)
}

function SparkIcon(): React.JSX.Element {
  return (
    <span className="spark-icon">
      <Waves size={18} />
    </span>
  )
}
