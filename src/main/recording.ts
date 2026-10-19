import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  FinalizeRecordingInput,
  FinalizeRecordingResult,
  LiveTranscriptSegment,
  RecordingEvent,
  RecordingSnapshot,
  StartRecordingInput,
  StoppedRecording,
  TranscriptSegment
} from '../shared/types'
import {
  getSecret,
  loadSettings,
  recordingsDir
} from './store'
import { loadSchedule, ensureNotesDir } from './schedule'
import {
  formatTimestamp,
  readCachedTranscript,
  transcribeAudioFile,
  transcribePcm,
  transcriptToText,
  trimOverlap,
  writeCachedTranscript
} from './stt'
import { generateNotes, generateOutline, extractTitle } from './llm'
import {
  getNote,
  noteTranscriptPath,
  saveNote,
  writeNoteTranscript
} from './notes'
import { readWavInfo, wavHeader } from './wav'
import { demoMode } from './mock'

const SAMPLE_RATE = 16000
const LIVE_INTERVAL_MS = 5_000
const LIVE_CHUNK_SECONDS = 7.5
const OUTLINE_INTERVAL_MS = 90_000
const ROLLING_SECONDS = 30

interface Session {
  id: string
  startedAt: Date
  status: RecordingSnapshot['status']
  title: string
  courseId: string | null
  courseName: string
  glossary: string[]
  dir: string
  audioPath: string
  fd: number
  dataBytes: number
  totalSamples: number
  rolling: Buffer
  pausedAt: number | null
  pausedTotalMs: number
  liveTimer: NodeJS.Timeout | null
  outlineTimer: NodeJS.Timeout | null
  liveBusy: boolean
  outlineBusy: boolean
  liveSegments: LiveTranscriptSegment[]
  liveRawTail: string
  liveText: string
  outline: string[]
  lastLevelSent: number
  lastNoticeAt: number
  error?: string
}

type EventSender = (event: RecordingEvent) => void

export class RecordingManager {
  private session: Session | null = null
  private readonly send: EventSender

  constructor(send: EventSender) {
    this.send = send
  }

  async start(input: StartRecordingInput): Promise<RecordingSnapshot> {
    if (this.session) {
      throw new Error('Finish or discard the current recording first.')
    }

    const settings = loadSettings()
    const id = `rec_${Date.now()}_${randomUUID().slice(0, 8)}`
    const dir = path.join(recordingsDir(), id)
    fs.mkdirSync(dir, { recursive: true })
    const audioPath = path.join(dir, 'audio.wav')
    const fd = fs.openSync(audioPath, 'w')
    fs.writeSync(fd, wavHeader(0))

    const session: Session = {
      id,
      startedAt: new Date(),
      status: 'recording',
      title: input.title?.trim() || input.courseName || 'Aula',
      courseId: input.courseId,
      courseName: input.courseName || 'Geral',
      glossary: input.glossary ?? [],
      dir,
      audioPath,
      fd,
      dataBytes: 0,
      totalSamples: 0,
      rolling: Buffer.alloc(0),
      pausedAt: null,
      pausedTotalMs: 0,
      liveTimer: null,
      outlineTimer: null,
      liveBusy: false,
      outlineBusy: false,
      liveSegments: [],
      liveRawTail: '',
      liveText: '',
      outline: [],
      lastLevelSent: 0,
      lastNoticeAt: 0
    }

    this.session = session
    this.emitState()

    if (!getSecret('groqApiKey')) {
      if (!demoMode) {
        this.notice(
          'Add a Groq API key in Settings to see the live transcript.',
          'warn'
        )
      }
    }

    session.liveTimer = setInterval(() => {
      void this.tickLive()
    }, LIVE_INTERVAL_MS)
    session.outlineTimer = setInterval(() => {
      void this.tickOutline()
    }, OUTLINE_INTERVAL_MS)

    return this.snapshot()
  }

  appendAudio(arrayBuffer: ArrayBuffer): void {
    const session = this.session
    if (!session || session.status !== 'recording') return

    const input = Buffer.from(arrayBuffer)
    if (input.length < 4) return
    const sampleCount = Math.floor(input.length / 4)
    const pcm = Buffer.allocUnsafe(sampleCount * 2)
    let sum = 0

    for (let i = 0; i < sampleCount; i++) {
      const value = input.readFloatLE(i * 4)
      const clamped = Math.max(-1, Math.min(1, value))
      sum += clamped * clamped
      pcm.writeInt16LE(Math.round(clamped * 32767), i * 2)
    }

    fs.writeSync(session.fd, pcm)
    session.dataBytes += pcm.length
    session.totalSamples += sampleCount

    session.rolling = Buffer.concat([session.rolling, pcm])
    const maxRollingBytes = ROLLING_SECONDS * SAMPLE_RATE * 2
    if (session.rolling.length > maxRollingBytes) {
      session.rolling = session.rolling.subarray(
        session.rolling.length - maxRollingBytes
      )
    }

    const now = Date.now()
    if (now - session.lastLevelSent > 90) {
      session.lastLevelSent = now
      const rms = Math.sqrt(sum / Math.max(1, sampleCount))
      this.send({ type: 'level', level: Math.min(1, rms * 6) })
    }
  }

  async pause(): Promise<RecordingSnapshot> {
    const session = this.requireSession()
    if (session.status !== 'recording') return this.snapshot()
    session.status = 'paused'
    session.pausedAt = Date.now()
    this.emitState()
    return this.snapshot()
  }

  async resume(): Promise<RecordingSnapshot> {
    const session = this.requireSession()
    if (session.status !== 'paused') return this.snapshot()
    if (session.pausedAt) {
      session.pausedTotalMs += Date.now() - session.pausedAt
      session.pausedAt = null
    }
    session.status = 'recording'
    this.emitState()
    return this.snapshot()
  }

  async stop(): Promise<StoppedRecording> {
    const session = this.requireSession()
    if (!['recording', 'paused', 'error'].includes(session.status)) {
      throw new Error('There is no active recording to stop.')
    }

    this.clearTimers(session)
    session.status = 'stopped'
    session.pausedAt = null

    try {
      fs.writeSync(session.fd, wavHeader(session.dataBytes), 0, 44, 0)
      fs.closeSync(session.fd)
    } catch {
      // The file may already be closed after a failed finalize.
    }

    this.emitState()
    return {
      id: session.id,
      startedAt: session.startedAt.toISOString(),
      durationSec: Math.round(session.totalSamples / SAMPLE_RATE),
      audioPath: session.audioPath
    }
  }

  async finalize(input: FinalizeRecordingInput): Promise<FinalizeRecordingResult> {
    const session = this.session
    if (!session || session.id !== input.id) {
      throw new Error('Recording not found.')
    }

    const audioExists = fs.existsSync(session.audioPath)
    if (!audioExists) throw new Error('The recording file is missing.')

    const settings = loadSettings()
    const warnings: string[] = []
    session.status = 'processing'
    session.error = undefined
    this.emitState()

    try {
      const groqKey = getSecret('groqApiKey')
      if (!groqKey && !demoMode) {
        throw new Error('Add a Groq API key in Settings before generating notes.')
      }

      let segments = readCachedTranscript(session.dir)
      if (!segments || !segments.length) {
        this.progress('Transcribing the lecture', 0.05)
        const result = await transcribeAudioFile(
          session.audioPath,
          {
            apiKey: groqKey ?? 'demo',
            model: settings.stt.model,
            language: settings.stt.language,
            glossary: session.glossary
          },
          (progress, message) => this.progress(message, progress)
        )
        segments = result.segments
        writeCachedTranscript(session.dir, segments)
      }

      if (!segments.length) {
        throw new Error('No speech was detected in the recording.')
      }

      ensureNotesDir(settings.notesDir)
      const noteId = `note_${Date.now()}_${randomUUID().slice(0, 8)}`
      writeNoteTranscript(settings.notesDir, noteId, segments)

      this.progress('Structuring the notes', 0.9)
      const schedule = loadSchedule()
      const course = session.courseId
        ? schedule.courses.find((item) => item.id === session.courseId)
        : undefined
      const durationSec = Math.max(
        session.totalSamples / SAMPLE_RATE,
        readWavInfo(session.audioPath).durationSec
      )

      let markdown: string
      const llmKey = getSecret('llmApiKey')
      if (!llmKey && !demoMode) {
        warnings.push(
          'The notes model key is missing, so a transcript-only note was saved.'
        )
        markdown = fallbackMarkdown(session, segments, durationSec, 'Falta a chave do modelo de apontamentos.')
      } else {
        try {
          markdown = await generateNotes(
            {
              courseName: session.courseName,
              lecturer: course?.lecturer,
              date: new Date(session.startedAt).toLocaleString('pt-PT', {
                dateStyle: 'long',
                timeStyle: 'short'
              }),
              durationSec,
              glossary: session.glossary.length
                ? session.glossary
                : course?.glossary ?? [],
              segments
            },
            {
              apiKey: llmKey ?? 'demo',
              baseURL: settings.llm.baseURL,
              model: settings.llm.model,
              sessionId: session.id,
              maxTokens: 7000
            }
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          warnings.push(
            `The notes model failed, so a transcript-only note was saved: ${message}`
          )
          markdown = fallbackMarkdown(session, segments, durationSec, message)
        }
      }

      const title = extractTitle(markdown, session.title)
      const meta = saveNote({
        id: noteId,
        title,
        courseId: session.courseId,
        courseName: session.courseName,
        date: session.startedAt.toISOString(),
        durationSec,
        recordingId: session.id,
        language: settings.stt.language,
        tags: course?.code ? [course.code] : [],
        markdown,
        notesDir: settings.notesDir
      })

      if (!input.keepAudio) {
        fs.rmSync(session.dir, { recursive: true, force: true })
      } else {
        touch(session.dir)
      }

      session.status = 'done'
      this.emitState()

      const note = getNote(settings.notesDir, meta.id)
      if (!note) throw new Error('The note was saved but could not be read back.')

      this.session = null

      return {
        note,
        audioKept: input.keepAudio,
        warnings
      }
    } catch (error) {
      session.status = 'error'
      session.error = error instanceof Error ? error.message : String(error)
      this.emitState()
      this.notice(session.error, 'error')
      throw error
    }
  }

  async discard(id: string): Promise<void> {
    const session = this.session
    if (session?.id !== id) return
    this.clearTimers(session)
    try {
      fs.closeSync(session.fd)
    } catch {
      // Already closed.
    }
    fs.rmSync(session.dir, { recursive: true, force: true })
    this.session = null
    this.send({ type: 'state', snapshot: null })
  }

  state(): RecordingSnapshot | null {
    if (!this.session || this.session.status === 'done') return null
    return this.snapshot()
  }

  cleanupExpiredRecordings(): string[] {
    const settings = loadSettings()
    const cutoff = Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000
    const removed: string[] = []
    const root = recordingsDir()

    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (this.session && entry.name === this.session.id) continue
      const dir = path.join(root, entry.name)
      try {
        const stat = fs.statSync(dir)
        if (stat.mtimeMs < cutoff && fs.existsSync(path.join(dir, 'audio.wav'))) {
          fs.rmSync(dir, { recursive: true, force: true })
          removed.push(entry.name)
        }
      } catch {
        // Ignore files that disappear while cleaning.
      }
    }

    return removed
  }

  private async tickLive(): Promise<void> {
    const session = this.session
    if (!session || session.status !== 'recording' || session.liveBusy) return

    const settings = loadSettings()
    const apiKey = getSecret('groqApiKey')
    if (!apiKey && !demoMode) return

    const chunkBytes = Math.floor(LIVE_CHUNK_SECONDS * SAMPLE_RATE * 2)
    if (session.rolling.length < SAMPLE_RATE * 2 * 2) return
    const pcm = session.rolling.subarray(
      Math.max(0, session.rolling.length - chunkBytes)
    )
    if (rmsOf(pcm) < 0.0015) return

    session.liveBusy = true
    const chunkSamples = Math.floor(pcm.length / 2)
    const start = Math.max(0, (session.totalSamples - chunkSamples) / SAMPLE_RATE)

    try {
      const segments = await transcribePcm(
        pcm,
        {
          apiKey: apiKey ?? 'demo',
          model: settings.stt.model,
          language: settings.stt.language,
          glossary: session.glossary
        },
        `live-${session.id}-${Date.now()}.wav`
      )
      if (!segments.length || session.status !== 'recording') return

      const raw = segments.map((segment) => segment.text).join(' ')
      const text = trimOverlap(session.liveRawTail, raw)
      session.liveRawTail = raw.slice(-400)

      if (!text) return
      const segment: LiveTranscriptSegment = {
        id: `live_${Date.now()}`,
        text,
        start: round(start),
        end: round(start + LIVE_CHUNK_SECONDS),
        final: true
      }
      session.liveSegments.push(segment)
      session.liveText = `${session.liveText} ${text}`.slice(-30_000)
      this.send({ type: 'transcript', segment })
    } catch (error) {
      this.maybeNotice(
        `Live transcription paused: ${error instanceof Error ? error.message : String(error)}`,
        'warn'
      )
    } finally {
      session.liveBusy = false
    }
  }

  private async tickOutline(): Promise<void> {
    const session = this.session
    if (!session || session.status !== 'recording' || session.outlineBusy) return
    if (session.liveText.trim().length < 350) return

    const settings = loadSettings()
    const apiKey = getSecret('llmApiKey')
    if (!apiKey && !demoMode) return

    session.outlineBusy = true
    try {
      const bullets = await generateOutline(session.outline, session.liveText, {
        apiKey: apiKey ?? 'demo',
        baseURL: settings.llm.baseURL,
        model: settings.llm.model,
        sessionId: session.id
      })
      if (bullets.length && bullets.join('|') !== session.outline.join('|')) {
        session.outline = bullets
        this.send({
          type: 'outline',
          outline: { bullets, updatedAt: Date.now() }
        })
      }
    } catch (error) {
      this.maybeNotice(
        `Live outline paused: ${error instanceof Error ? error.message : String(error)}`,
        'warn'
      )
    } finally {
      session.outlineBusy = false
    }
  }

  private snapshot(): RecordingSnapshot {
    const session = this.requireSession()
    return {
      id: session.id,
      courseId: session.courseId,
      courseName: session.courseName,
      title: session.title,
      startedAt: session.startedAt.toISOString(),
      elapsedSec: Math.round(session.totalSamples / SAMPLE_RATE),
      status: session.status,
      error: session.error
    }
  }

  private emitState(): void {
    if (!this.session) return
    this.send({ type: 'state', snapshot: this.snapshot() })
  }

  private progress(step: string, progress: number): void {
    this.send({ type: 'processing', step, progress: Math.min(1, Math.max(0, progress)) })
  }

  private notice(message: string, level: 'info' | 'warn' | 'error'): void {
    this.send({ type: 'notice', message, level })
  }

  private maybeNotice(message: string, level: 'info' | 'warn' | 'error'): void {
    const session = this.session
    if (!session) return
    const now = Date.now()
    if (now - session.lastNoticeAt < 30_000) return
    session.lastNoticeAt = now
    this.notice(message, level)
  }

  private requireSession(): Session {
    if (!this.session) throw new Error('No recording session is active.')
    return this.session
  }

  private clearTimers(session: Session): void {
    if (session.liveTimer) clearInterval(session.liveTimer)
    if (session.outlineTimer) clearInterval(session.outlineTimer)
    session.liveTimer = null
    session.outlineTimer = null
  }
}

function fallbackMarkdown(
  session: Session,
  segments: TranscriptSegment[],
  durationSec: number,
  reason: string
): string {
  const date = new Date(session.startedAt).toLocaleString('pt-PT', {
    dateStyle: 'long',
    timeStyle: 'short'
  })
  const transcript = transcriptToText(segments)
  return `# ${session.courseName} — ${new Date(session.startedAt).toLocaleDateString('pt-PT')}

**Disciplina:** ${session.courseName}
**Data:** ${date}
**Duração:** ${Math.round(durationSec / 60)} minutos

## Resumo
Não foi possível gerar os apontamentos estruturados: ${reason}

## Transcrição
${transcript}
`
}

function rmsOf(pcm: Buffer): number {
  const samples = Math.floor(pcm.length / 2)
  if (!samples) return 0
  let sum = 0
  const step = Math.max(1, Math.floor(samples / 4000))
  let count = 0
  for (let i = 0; i < samples; i += step) {
    const value = pcm.readInt16LE(i * 2) / 32768
    sum += value * value
    count += 1
  }
  return Math.sqrt(sum / Math.max(1, count))
}

function touch(dir: string): void {
  const now = new Date()
  try {
    fs.utimesSync(dir, now, now)
  } catch {
    // Best effort.
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

export function transcriptLabel(segment: TranscriptSegment): string {
  return formatTimestamp(segment.start)
}

export function cachedTranscriptExists(recordingId: string): boolean {
  return fs.existsSync(
    path.join(recordingsDir(), recordingId, 'transcript.json')
  )
}

export function transcriptPathForNote(notesDir: string, noteId: string): string {
  return noteTranscriptPath(notesDir, noteId)
}
