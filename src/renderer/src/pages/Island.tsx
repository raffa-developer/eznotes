import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Loader2,
  Maximize2,
  Pause,
  Play,
  Square,
  Trash2,
  X
} from 'lucide-react'
import type {
  LiveTranscriptSegment,
  RecordingSnapshot,
  Schedule,
  StoppedRecording
} from '../../../shared/types'
import { formatTimer, formatTimestamp } from '../lib/format'

type Phase = 'recording' | 'stopped' | 'processing' | 'done' | 'error'

const COLLAPSED_HEIGHT = 54
const PANEL_HEIGHTS: Record<Phase, number> = {
  recording: 144,
  stopped: 128,
  processing: 120,
  done: 128,
  error: 144
}

export default function Island(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<RecordingSnapshot | null>(null)
  const [segments, setSegments] = useState<LiveTranscriptSegment[]>([])
  const [outline, setOutline] = useState<string[]>([])
  const [level, setLevel] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [phase, setPhase] = useState<Phase>('recording')
  const [stopped, setStopped] = useState<StoppedRecording | null>(null)
  const [processing, setProcessing] = useState<{
    step: string
    progress: number
  } | null>(null)
  const [noteId, setNoteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [panelClosing, setPanelClosing] = useState(false)
  const [retentionDays, setRetentionDays] = useState(30)
  const [liveTranscript, setLiveTranscript] = useState(true)
  const scheduleRef = useRef<Schedule>({ courses: [], slots: [] })
  const closeTimer = useRef<number | null>(null)
  const previousPhase = useRef<Phase>('recording')

  useEffect(() => {
    let mounted = true
    Promise.all([
      window.ezNotes.recording.live(),
      window.ezNotes.settings.get(),
      window.ezNotes.schedule.get()
    ])
      .then(([live, settings, schedule]) => {
        if (!mounted) return
        setSnapshot(live.snapshot)
        setSegments(live.segments)
        setOutline(live.outline)
        setProcessing(live.processing)
        setRetentionDays(settings.settings.retentionDays)
        setLiveTranscript(settings.settings.stt.liveTranscript)
        scheduleRef.current = schedule
        if (live.snapshot) applySnapshot(live.snapshot)
        if (live.processing) setPhase('processing')
      })
      .catch((reason) => {
        if (mounted) {
          setError(reason instanceof Error ? reason.message : String(reason))
          setPhase('error')
        }
      })

    const unsubscribe = window.ezNotes.recording.onEvent((event) => {
      if (!mounted) return
      if (event.type === 'state') {
        setSnapshot(event.snapshot)
        if (event.snapshot) applySnapshot(event.snapshot)
      }
      if (event.type === 'transcript') {
        setSegments((current) => {
          if (current.some((segment) => segment.id === event.segment.id)) return current
          return [...current, event.segment].slice(-60)
        })
      }
      if (event.type === 'outline') setOutline(event.outline.bullets)
      if (event.type === 'level') setLevel(event.level)
      if (event.type === 'processing') {
        setProcessing({ step: event.step, progress: event.progress })
        setPhase('processing')
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!snapshot) return
    setElapsed((current) => Math.max(current, snapshot.elapsedSec))
  }, [snapshot?.elapsedSec])

  useEffect(() => {
    if (snapshot?.status !== 'recording') return
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [snapshot?.status])

  const showPanel = expanded || phase !== 'recording' || panelClosing
  const panelHeight = showPanel ? PANEL_HEIGHTS[phase] : COLLAPSED_HEIGHT

  useEffect(() => {
    void window.ezNotes.app.setIslandExpanded(showPanel, panelHeight)
  }, [showPanel, panelHeight])

  useEffect(() => {
    if (phase === 'recording' && previousPhase.current !== 'recording') {
      setExpanded(false)
      setPanelClosing(false)
    }
    previousPhase.current = phase
  }, [phase])

  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    }
  }, [])

  function toggleExpanded(): void {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    if (expanded) {
      setExpanded(false)
      if (phase === 'recording') {
        setPanelClosing(true)
        closeTimer.current = window.setTimeout(() => {
          setPanelClosing(false)
          closeTimer.current = null
        }, 170)
      }
      return
    }
    setPanelClosing(false)
    setExpanded(true)
  }

  function applySnapshot(next: RecordingSnapshot): void {
    setElapsed(next.elapsedSec)
    if (next.status === 'stopped') setPhase('stopped')
    else if (next.status === 'processing') setPhase('processing')
    else if (next.status === 'error') {
      setError(next.error ?? 'The last processing step failed.')
      setPhase('error')
    } else if (next.status === 'done') setPhase('done')
    else setPhase('recording')
  }

  async function pauseOrResume(): Promise<void> {
    if (!snapshot || busy) return
    setBusy(true)
    try {
      if (snapshot.status === 'paused') await window.ezNotes.recording.resume()
      else await window.ezNotes.recording.pause()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  async function stop(): Promise<void> {
    if (busy || !snapshot) return
    setBusy(true)
    try {
      const result = await window.ezNotes.recording.stop()
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
        closeTimer.current = null
      }
      setPanelClosing(false)
      setStopped(result)
      setElapsed(result.durationSec)
      setPhase('stopped')
      setExpanded(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setPhase('error')
    } finally {
      setBusy(false)
    }
  }

  async function finalize(keepAudio: boolean): Promise<void> {
    const id = stopped?.id ?? snapshot?.id
    if (!id || !snapshot) return

    setBusy(true)
    setPhase('processing')
    setProcessing({ step: 'Preparing the lecture', progress: 0.02 })
    setError(null)

    try {
      const schedule = scheduleRef.current.courses.length
        ? scheduleRef.current
        : await window.ezNotes.schedule.get()
      const course = snapshot.courseId
        ? schedule.courses.find((item) => item.id === snapshot.courseId)
        : undefined
      const result = await window.ezNotes.recording.finalize({
        id,
        keepAudio,
        courseId: snapshot.courseId,
        courseName: snapshot.courseName,
        title: snapshot.title,
        glossary: course?.glossary ?? []
      })
      setNoteId(result.note.id)
      setProcessing(null)
      setPhase('done')
    } catch (reason) {
      setProcessing(null)
      setError(reason instanceof Error ? reason.message : String(reason))
      setPhase('error')
    } finally {
      setBusy(false)
    }
  }

  function openApp(): void {
    void window.ezNotes.app.openMainWindow()
  }

  function openNote(): void {
    if (noteId) void window.ezNotes.app.openNote(noteId)
    else openApp()
  }

  const isPaused = snapshot?.status === 'paused'
  const courseName = snapshot?.courseName ?? 'Lecture'
  const recentSegments = segments.slice(-1)
  const recentOutline = outline.slice(0, 3)

  return (
    <div className="island-root">
      <div className={`island ${showPanel ? 'expanded' : ''}`}>
        <div className="island-bar">
          <span className={`island-dot ${snapshot?.status ?? 'recording'}`} />
          <span className="island-course">{courseName}</span>
          <span className="island-timer">{formatTimer(elapsed)}</span>

          <span className="island-level" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, index) => (
              <i
                key={index}
                style={{
                  height: `${3 + level * 11 * (0.4 + Math.abs(Math.sin(index * 1.7)))}px`,
                  opacity: level > 0.02 ? 0.5 + level * 0.5 : 0.25
                }}
              />
            ))}
          </span>

          {phase === 'recording' ? (
            <>
              <button
                className="island-icon-button"
                onClick={() => void pauseOrResume()}
                disabled={busy}
                title={isPaused ? 'Resume recording' : 'Pause recording'}
                aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
              >
                {isPaused ? <Play size={13} /> : <Pause size={13} />}
              </button>
              <button
                className="island-icon-button danger"
                onClick={() => void stop()}
                disabled={busy}
                title="Stop and write notes"
                aria-label="Stop and write notes"
              >
                <Square size={11} />
              </button>
            </>
          ) : null}

          {phase === 'processing' ? (
            <span className="island-phase">
              <Loader2 size={12} className="spin" />
              Writing
            </span>
          ) : null}

          {phase === 'done' ? (
            <span className="island-phase success">
              <Check size={12} />
              Ready
            </span>
          ) : null}

          {phase === 'error' ? (
            <span className="island-phase error">
              <AlertTriangle size={12} />
              Error
            </span>
          ) : null}

          {phase === 'recording' ? (
            <button
              className="island-icon-button"
              onClick={toggleExpanded}
              title={expanded ? 'Collapse' : 'Expand'}
              aria-label={expanded ? 'Collapse' : 'Expand'}
              aria-expanded={expanded}
            >
              <ChevronDown
                size={13}
                className={`island-chevron ${expanded ? 'open' : ''}`}
              />
            </button>
          ) : null}
          <button
            className="island-icon-button"
            onClick={openApp}
            title="Open ezNotes"
            aria-label="Open ezNotes"
          >
            <Maximize2 size={12} />
          </button>
        </div>

        {showPanel ? (
          <div className={`island-panel ${panelClosing ? 'closing' : ''}`}>
            {phase === 'recording' ? (
              liveTranscript ? (
                <>
                  {recentSegments.length ? (
                    <div className="island-transcript">
                      {recentSegments.map((segment) => (
                        <div key={segment.id} className="island-transcript-line">
                          <span>{formatTimestamp(segment.start)}</span>
                          <p>{segment.text}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="island-muted">Listening for the first words…</p>
                  )}
                  {recentOutline.length ? (
                    <div className="island-outline">
                      {recentOutline.map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="island-muted">
                  Live transcript is off. Final notes will be written after class.
                </p>
              )
            ) : null}

            {phase === 'stopped' ? (
              <div className="island-decision">
                <p>Keep the lecture audio?</p>
                <div className="island-actions">
                  <button
                    className="island-action danger"
                    onClick={() => void finalize(false)}
                    disabled={busy}
                  >
                    <Trash2 size={14} />
                    Delete audio
                  </button>
                  <button
                    className="island-action primary"
                    onClick={() => void finalize(true)}
                    disabled={busy}
                  >
                    <Check size={14} />
                    Keep {retentionDays} days
                  </button>
                </div>
              </div>
            ) : null}

            {phase === 'processing' ? (
              <div className="island-progress">
                <p>{processing?.step ?? 'Writing notes…'}</p>
                <div className="island-progress-track">
                  <div
                    style={{
                      width: `${Math.round((processing?.progress ?? 0.05) * 100)}%`
                    }}
                  />
                </div>
                <small>{Math.round((processing?.progress ?? 0.05) * 100)}%</small>
              </div>
            ) : null}

            {phase === 'done' ? (
              <div className="island-decision">
                <p className="island-ready">
                  <Check size={15} /> Notes ready.
                </p>
                <div className="island-actions">
                  <button className="island-action soft" onClick={() => void window.ezNotes.app.hideIsland()}>
                    <X size={14} />
                    Close
                  </button>
                  <button className="island-action primary" onClick={openNote}>
                    <Maximize2 size={14} />
                    Open note
                  </button>
                </div>
              </div>
            ) : null}

            {phase === 'error' ? (
              <div className="island-decision">
                <p className="island-error">
                  <AlertTriangle size={14} />
                  {error ?? 'The recording needs attention.'}
                </p>
                <div className="island-actions">
                  <button
                    className="island-action soft"
                    onClick={() => void window.ezNotes.app.hideIsland()}
                  >
                    <X size={14} />
                    Close
                  </button>
                  <button className="island-action primary" onClick={openApp}>
                    <Maximize2 size={14} />
                    Open app
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
