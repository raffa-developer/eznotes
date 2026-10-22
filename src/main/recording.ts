import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  FinalizeRecordingInput,
  FinalizeRecordingResult,
  LiveTranscriptSegment,
  RecordingEvent,
  RecordingLiveState,
  RecordingSnapshot,
  RecoverableRecording,
  StartRecordingInput,
  StoppedRecording,
  TranscriptSegment
} from '../shared/types'
import {
  getSecret,
  loadSettings,
  readJson,
  recordingsDir,
  writeJson
} from './store'
import { loadSchedule, ensureNotesDir } from './schedule'
import {
  analyzeSpeech,
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
  listNotes,
  noteTranscriptPath,
  saveNote,
  writeNoteTranscript
} from './notes'
import { readWavInfo, wavHeader } from './wav'
import { isWebmShorterThanWav, readWebmDurationSec } from './webm'
import { demoMode } from './mock'
import { log } from './log'
import {
  assignSpeakers,
  diarizationStatus,
  runDiarization
} from './diarization'

const SAMPLE_RATE = 16000
const LIVE_INTERVAL_MS = 8_000
const LIVE_CHUNK_SECONDS = 12
const LIVE_MIN_VOICED_MS = 1_200
const LIVE_MIN_RECENT_VOICED_MS = 800
const LIVE_MIN_VOICED_RATIO = 0.12
const ROLLING_SECONDS = 30
const CHECKPOINT_INTERVAL_MS = 30_000
const MANIFEST_FILE = 'session.json'
const LIVE_TRANSCRIPT_FILE = 'live-transcript.json'

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
  headerTimer: NodeJS.Timeout | null
  liveTimer: NodeJS.Timeout | null
  outlineTimer: NodeJS.Timeout | null
  liveBusy: boolean
  outlineBusy: boolean
  liveSegments: LiveTranscriptSegment[]
  liveRawTail: string
  liveText: string
  outline: string[]
  lastOutlineText: string
  lastLevelSent: number
  lastNoticeAt: number
  error?: string
}

type EventSender = (event: RecordingEvent) => void

export interface RecordingManifest {
  id: string
  startedAt: string
  courseId: string | null
  courseName: string
  title: string
  glossary: string[]
  dataBytes: number
  totalSamples: number
  sampleRate: number
  status: RecordingSnapshot['status']
  updatedAt: string
}

export class RecordingManager {
  private session: Session | null = null
  private processing: { step: string; progress: number } | null = null
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
      title: input.title?.trim() || input.courseName || 'Apontamentos',
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
      headerTimer: null,
      liveTimer: null,
      outlineTimer: null,
      liveBusy: false,
      outlineBusy: false,
      liveSegments: [],
      liveRawTail: '',
      liveText: '',
      outline: [],
      lastOutlineText: '',
      lastLevelSent: 0,
      lastNoticeAt: 0
    }

    this.session = session
    this.processing = null
    this.emitState()

    this.writeManifest(session)
    session.headerTimer = setInterval(
      () => this.checkpoint(session),
      CHECKPOINT_INTERVAL_MS
    )

    const liveEnabled = settings.stt.liveTranscript
    if (!liveEnabled) {
      this.notice(
        'Live transcript is off. The lecture is still being recorded and will be transcribed after class.',
        'info'
      )
    } else if (!getSecret('groqApiKey') && !demoMode) {
      this.notice(
        'Add a Groq API key in Settings to see the live transcript.',
        'warn'
      )
    }

    if (liveEnabled) {
      session.liveTimer = setInterval(() => {
        void this.tickLive()
      }, LIVE_INTERVAL_MS)
      session.outlineTimer = setInterval(
        () => {
          void this.tickOutline()
        },
        settings.stt.liveOutlineSeconds * 1000
      )
    }

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

  saveWebm(id: string, data: ArrayBuffer): void {
    const session = this.session
    if (!session || session.id !== id) return

    try {
      const target = path.join(session.dir, 'audio.webm')
      const temp = `${target}.tmp`
      fs.writeFileSync(temp, Buffer.from(data))
      fs.renameSync(temp, target)
      log('recording', 'compressed audio saved', { bytes: data.byteLength })
    } catch (error) {
      log('recording', 'could not save compressed audio', {
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  async pause(): Promise<RecordingSnapshot> {
    const session = this.requireSession()
    if (session.status !== 'recording') return this.snapshot()
    session.status = 'paused'
    session.pausedAt = Date.now()
    this.checkpoint(session)
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
    this.checkpoint(session)
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
      fs.fsyncSync(session.fd)
      fs.closeSync(session.fd)
    } catch {
      // The file may already be closed after a failed finalize.
    }

    this.writeManifest(session)
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
    this.processing = { step: 'Preparing the lecture', progress: 0.02 }
    this.writeManifest(session)
    this.emitState()
    log('recording', 'finalize started', {
      id: session.id,
      course: session.courseName,
      keepAudio: input.keepAudio
    })

    try {
      const groqKey = getSecret('groqApiKey')
      let segments = readCachedTranscript(session.dir) ?? []

      if (input.transcriptOnly) {
        this.progress('Saving the transcript', 0.2)
        if (!segments.length) segments = readLiveTranscript(session)
        if (!segments.length) {
          throw new Error(
            'There is no transcript to save yet. Try transcribing again instead.'
          )
        }
      } else {
        if (!groqKey && !demoMode) {
          throw new Error('Add a Groq API key in Settings before generating notes.')
        }

        if (!segments.length) {
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
      }

      log('recording', 'transcript ready', {
        id: session.id,
        segments: segments.length
      })

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
      const directKey = getSecret('llmApiKey')
      const llmKey =
        settings.llm.provider === 'groq' ? groqKey ?? '' : directKey ?? ''
      const keyless = settings.llm.provider === 'ollama'
      if (input.transcriptOnly) {
        markdown = fallbackMarkdown(
          session,
          segments,
          durationSec,
          'Guardaste apenas a transcrição desta aula.',
          true
        )
      } else if (!llmKey && !keyless && !demoMode) {
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
              apiKey: llmKey || (keyless ? '' : 'demo'),
              baseURL: settings.llm.baseURL,
              model: settings.llm.model,
              provider: settings.llm.provider,
              sessionId: session.id,
              maxTokens: 16_000
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
      log('recording', 'notes generated', {
        id: session.id,
        characters: markdown.length
      })
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

      let speakersInBackground = false
      if (
        !input.transcriptOnly &&
        settings.stt.speakerLabels &&
        !segments.some((segment) => segment.speaker)
      ) {
        if (!input.keepAudio) {
          warnings.push(
            'Speaker detection was skipped because the audio is being deleted.'
          )
        } else {
          const status = diarizationStatus()
          if (status.runtimeReady && status.modelsReady) {
            speakersInBackground = true
            warnings.push(
              'Speaker labels are being added in the background. Press Regenerate on the note after they finish to include them.'
            )
          } else {
            warnings.push(
              'Speaker detection is on, but its models are not downloaded. Continuing without speaker labels.'
            )
          }
        }
      }

      session.status = 'done'
      log('recording', 'note saved', {
        id: session.id,
        noteId: meta.id,
        path: meta.path,
        audioKept: input.keepAudio
      })
      this.emitState()

      const note = getNote(settings.notesDir, meta.id)
      if (!note) throw new Error('The note was saved but could not be read back.')

      this.processing = null
      this.session = null

      if (speakersInBackground) {
        void this.detectSpeakersInBackground(
          session.dir,
          session.audioPath,
          meta.id,
          settings.notesDir,
          segments,
          input.keepAudio
        )
      } else {
        await this.finishAudio(session.dir, input.keepAudio)
      }

      return {
        note,
        audioKept: input.keepAudio,
        warnings
      }
    } catch (error) {
      session.status = 'error'
      session.error = error instanceof Error ? error.message : String(error)
      this.processing = null
      this.writeManifest(session)
      log('recording', 'finalize failed', {
        id: session.id,
        message: session.error
      })
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
    this.processing = null
    this.send({ type: 'state', snapshot: null })
  }

  state(): RecordingSnapshot | null {
    if (!this.session || this.session.status === 'done') return null
    return this.snapshot()
  }

  liveState(): RecordingLiveState {
    if (!this.session) {
      return {
        snapshot: null,
        segments: [],
        outline: [],
        processing: null
      }
    }
    return {
      snapshot: this.snapshot(),
      segments: [...this.session.liveSegments],
      outline: [...this.session.outline],
      processing: this.processing
    }
  }

  listRecoverable(notesDir: string): RecoverableRecording[] {
    const root = recordingsDir()
    const linked = new Set(
      listNotes(notesDir)
        .map((note) => note.recordingId)
        .filter((id): id is string => Boolean(id))
    )
    const activeId = this.session?.id ?? null
    const found: RecoverableRecording[] = []

    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('rec_')) continue
      if (entry.name === activeId || linked.has(entry.name)) continue

      const dir = path.join(root, entry.name)
      const audioPath = path.join(dir, 'audio.wav')
      try {
        if (!fs.existsSync(audioPath)) continue
        const dataBytes = wavDataBytes(fs.statSync(audioPath).size)
        if (dataBytes < 2) continue

        const manifest = readJson<Partial<RecordingManifest>>(
          path.join(dir, MANIFEST_FILE),
          {}
        )
        found.push({
          id: entry.name,
          title: manifest.title?.trim() || 'Apontamentos',
          courseName: manifest.courseName || 'Geral',
          courseId: manifest.courseId ?? null,
          startedAt: validIsoDate(manifest.startedAt) ?? startedAtFromId(entry.name),
          durationSec: Math.round(dataBytes / 2 / SAMPLE_RATE),
          hasTranscript:
            fs.existsSync(path.join(dir, 'transcript.json')) ||
            fs.existsSync(path.join(dir, LIVE_TRANSCRIPT_FILE))
        })
      } catch {
        // Skip folders that disappear or cannot be read.
      }
    }

    return found.sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    )
  }

  recover(id: string): RecordingSnapshot {
    if (this.session) {
      throw new Error('Finish or discard the current recording first.')
    }
    if (!/^rec_[A-Za-z0-9_-]+$/.test(id)) {
      throw new Error('Invalid recording id.')
    }

    const dir = path.join(recordingsDir(), id)
    const audioPath = path.join(dir, 'audio.wav')
    if (!fs.existsSync(audioPath)) {
      throw new Error('The recording audio is missing.')
    }

    const manifest = readJson<Partial<RecordingManifest>>(
      path.join(dir, MANIFEST_FILE),
      {}
    )
    const dataBytes = repairWavHeader(audioPath)
    if (dataBytes < 2) throw new Error('The recording is empty.')

    const storedLive = readJson<LiveTranscriptSegment[]>(
      path.join(dir, LIVE_TRANSCRIPT_FILE),
      []
    )
    const liveSegments = Array.isArray(storedLive) ? storedLive : []

    const session: Session = {
      id,
      startedAt: new Date(validIsoDate(manifest.startedAt) ?? startedAtFromId(id)),
      status: 'stopped',
      title: manifest.title?.trim() || manifest.courseName || 'Apontamentos',
      courseId: manifest.courseId ?? null,
      courseName: manifest.courseName || 'Geral',
      glossary: Array.isArray(manifest.glossary) ? manifest.glossary : [],
      dir,
      audioPath,
      fd: -1,
      dataBytes,
      totalSamples: Math.floor(dataBytes / 2),
      rolling: Buffer.alloc(0),
      pausedAt: null,
      pausedTotalMs: 0,
      headerTimer: null,
      liveTimer: null,
      outlineTimer: null,
      liveBusy: false,
      outlineBusy: false,
      liveSegments,
      liveRawTail: '',
      liveText: liveSegments
        .map((segment) => segment.text)
        .join(' ')
        .slice(-30_000),
      outline: [],
      lastOutlineText: '',
      lastLevelSent: 0,
      lastNoticeAt: 0
    }

    this.session = session
    this.processing = null
    this.writeManifest(session)
    this.emitState()
    log('recording', 'recovered interrupted recording', { id, dataBytes })
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
        const hasAudio =
          fs.existsSync(path.join(dir, 'audio.webm')) ||
          fs.existsSync(path.join(dir, 'audio.wav'))
        if (stat.mtimeMs < cutoff && hasAudio) {
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
    if (!settings.stt.liveTranscript) return
    const apiKey = getSecret('groqApiKey')
    if (!apiKey && !demoMode) return

    const chunkBytes = Math.floor(LIVE_CHUNK_SECONDS * SAMPLE_RATE * 2)
    if (session.rolling.length < SAMPLE_RATE * 2 * 2) return
    const rawChunk = session.rolling.subarray(
      Math.max(0, session.rolling.length - chunkBytes)
    )
    const speech = analyzeSpeech(rawChunk, SAMPLE_RATE, LIVE_INTERVAL_MS)
    if (
      !speech ||
      speech.voicedMs < LIVE_MIN_VOICED_MS ||
      speech.recentVoicedMs < LIVE_MIN_RECENT_VOICED_MS ||
      speech.voicedMs / Math.max(1, speech.durationMs) < LIVE_MIN_VOICED_RATIO
    ) {
      return
    }

    session.liveBusy = true
    const rawSamples = Math.floor(rawChunk.length / 2)
    const chunkStart = Math.max(
      0,
      (session.totalSamples - rawSamples) / SAMPLE_RATE
    )
    const start = chunkStart + speech.startByte / 2 / SAMPLE_RATE
    const end = chunkStart + speech.endByte / 2 / SAMPLE_RATE

    try {
      const segments = await transcribePcm(
        speech.pcm,
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
        end: round(end),
        final: true
      }
      session.liveSegments.push(segment)
      session.liveText = `${session.liveText} ${text}`.slice(-30_000)
      this.persistLiveTranscript(session)
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
    if (session.liveText === session.lastOutlineText) return

    const settings = loadSettings()
    if (!settings.stt.liveTranscript) return
    const groqKey = getSecret('groqApiKey')
    const apiKey =
      settings.llm.provider === 'groq'
        ? groqKey ?? ''
        : getSecret('llmApiKey') ?? ''
    const keyless = settings.llm.provider === 'ollama'
    if (!apiKey && !keyless && !demoMode) return

    session.outlineBusy = true
    try {
      const bullets = await generateOutline(session.outline, session.liveText, {
        apiKey: apiKey || (keyless ? '' : 'demo'),
        baseURL: settings.llm.baseURL,
        model: settings.llm.model,
        provider: settings.llm.provider,
        sessionId: session.id
      })
      session.lastOutlineText = session.liveText
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

  /**
   * Speaker labels are useful but expensive. Never make the note wait for
   * them: save the note first, then enrich the transcript in the background.
   */
  private async detectSpeakersInBackground(
    dir: string,
    audioPath: string,
    noteId: string,
    notesDir: string,
    segments: TranscriptSegment[],
    keepAudio: boolean
  ): Promise<void> {
    const started = Date.now()
    try {
      const turns = await runDiarization(audioPath)
      const labeled = assignSpeakers(segments, turns)

      if (!turns.length || !labeled.some((segment) => segment.speaker)) {
        log('diarization', 'no speakers found', {
          turns: turns.length,
          elapsedMs: Date.now() - started
        })
        this.notice(
          'Speaker detection found no speakers in this recording. The note keeps the transcript without labels.',
          'warn'
        )
        return
      }

      writeCachedTranscript(dir, labeled)
      writeNoteTranscript(notesDir, noteId, labeled)
      log('recording', 'speakers assigned in background', {
        segments: labeled.length,
        turns: turns.length,
        elapsedMs: Date.now() - started
      })
      this.notice(
        'Speaker labels added to the transcript. Open the note and press Regenerate to include them.',
        'info'
      )
    } catch (error) {
      log('diarization', 'failed', {
        message: errorMessage(error),
        elapsedMs: Date.now() - started
      })
      this.notice(
        `Speaker detection failed, so the note has no speaker labels: ${errorMessage(error)}`,
        'warn'
      )
    } finally {
      await this.finishAudio(dir, keepAudio)
    }
  }

  private async finishAudio(dir: string, keepAudio: boolean): Promise<void> {
    try {
      if (!keepAudio) {
        fs.rmSync(dir, { recursive: true, force: true })
        return
      }
      const result = await keepBestAudio(dir)
      if (result.keptWav && result.reason && result.reason !== 'missing') {
        log('recording', 'kept full WAV because compressed audio was incomplete', {
          dir,
          wavSec: result.wavSec,
          webmSec: result.webmSec,
          reason: result.reason
        })
        this.notice(
          'The compressed audio was incomplete, so the full WAV was kept for playback.',
          'warn'
        )
      }
      fs.rmSync(path.join(dir, MANIFEST_FILE), { force: true })
      touch(dir)
    } catch (error) {
      log('recording', 'audio cleanup failed', {
        dir,
        message: errorMessage(error)
      })
    }
  }

  private progress(step: string, progress: number): void {
    const next = {
      step,
      progress: Math.min(1, Math.max(0, progress))
    }
    this.processing = next
    this.send({ type: 'processing', ...next })
  }

  private notice(message: string, level: 'info' | 'warn' | 'error'): void {
    try {
      this.send({ type: 'notice', message, level })
    } catch {
      // The window may already be closing, e.g. while a background task ends.
    }
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
    if (session.headerTimer) clearInterval(session.headerTimer)
    if (session.liveTimer) clearInterval(session.liveTimer)
    if (session.outlineTimer) clearInterval(session.outlineTimer)
    session.headerTimer = null
    session.liveTimer = null
    session.outlineTimer = null
  }

  private checkpoint(session: Session): void {
    if (this.session !== session) return
    if (session.status !== 'recording' && session.status !== 'paused') return

    try {
      fs.writeSync(session.fd, wavHeader(session.dataBytes), 0, 44, 0)
      fs.fsyncSync(session.fd)
    } catch (error) {
      log('recording', 'wav checkpoint failed', {
        id: session.id,
        message: error instanceof Error ? error.message : String(error)
      })
    }

    this.writeManifest(session)
  }

  private persistLiveTranscript(session: Session): void {
    try {
      writeJson(
        path.join(session.dir, LIVE_TRANSCRIPT_FILE),
        session.liveSegments
      )
    } catch {
      // Best effort: the final transcription pass is still authoritative.
    }
  }

  private writeManifest(session: Session): void {
    const manifest: RecordingManifest = {
      id: session.id,
      startedAt: session.startedAt.toISOString(),
      courseId: session.courseId,
      courseName: session.courseName,
      title: session.title,
      glossary: session.glossary,
      dataBytes: session.dataBytes,
      totalSamples: session.totalSamples,
      sampleRate: SAMPLE_RATE,
      status: session.status,
      updatedAt: new Date().toISOString()
    }
    try {
      writeJson(path.join(session.dir, MANIFEST_FILE), manifest)
    } catch (error) {
      log('recording', 'could not write session manifest', {
        id: session.id,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }
}

function fallbackMarkdown(
  session: Session,
  segments: TranscriptSegment[],
  durationSec: number,
  reason: string,
  transcriptOnly = false
): string {
  const date = new Date(session.startedAt).toLocaleString('pt-PT', {
    dateStyle: 'long',
    timeStyle: 'short'
  })
  const transcript = transcriptToText(segments)
  return `# ${session.courseName} — ${new Date(session.startedAt).toLocaleDateString('pt-PT')}

**Disciplina:** ${session.courseName}
**Data:** ${date}
**Duração:** ${formatNoteDuration(durationSec)}

## Resumo
${
  transcriptOnly
    ? 'Esta nota contém apenas a transcrição da aula, sem estruturação por IA.'
    : `Não foi possível gerar os apontamentos estruturados: ${reason}

Usa **Regenerar** no topo da nota para tentar outra vez.`
}

## Transcrição
${transcript}
`
}

function formatNoteDuration(durationSec: number): string {
  if (durationSec < 60) return 'menos de 1 minuto'
  return `${Math.round(durationSec / 60)} minutos`
}

interface KeepAudioResult {
  keptWav: boolean
  wavSec?: number
  webmSec?: number | null
  reason?: 'missing' | 'unreadable' | 'short'
}

async function keepBestAudio(dir: string): Promise<KeepAudioResult> {
  const webm = path.join(dir, 'audio.webm')
  const wav = path.join(dir, 'audio.wav')

  if (!fs.existsSync(webm)) {
    for (let attempt = 0; attempt < 20 && !fs.existsSync(webm); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  if (!fs.existsSync(webm)) return { keptWav: true, reason: 'missing' }
  if (!fs.existsSync(wav)) return { keptWav: false }

  try {
    const wavInfo = readWavInfo(wav)
    if (wavInfo.durationSec <= 0) return { keptWav: false }

    const webmSec = readWebmDurationSec(webm)
    if (isWebmShorterThanWav(wavInfo.durationSec, webmSec)) {
      fs.rmSync(webm, { force: true })
      return {
        keptWav: true,
        wavSec: wavInfo.durationSec,
        webmSec,
        reason: webmSec === null ? 'unreadable' : 'short'
      }
    }

    fs.rmSync(wav, { force: true })
    return {
      keptWav: false,
      wavSec: wavInfo.durationSec,
      webmSec
    }
  } catch {
    // If the WAV cannot be read, do not delete anything.
    return { keptWav: true, reason: 'unreadable' }
  }
}

function touch(dir: string): void {
  const now = new Date()
  try {
    fs.utimesSync(dir, now, now)
  } catch {
    // Best effort.
  }
}

function wavDataBytes(fileSize: number): number {
  return Math.max(0, Math.floor((fileSize - 44) / 2) * 2)
}

function readLiveTranscript(session: Session): TranscriptSegment[] {
  const stored = readJson<LiveTranscriptSegment[]>(
    path.join(session.dir, LIVE_TRANSCRIPT_FILE),
    []
  )
  const source =
    Array.isArray(stored) && stored.length ? stored : session.liveSegments
  return source.map((segment) => ({
    id: segment.id,
    start: segment.start,
    end: segment.end,
    text: segment.text
  }))
}

function repairWavHeader(audioPath: string): number {
  const dataBytes = wavDataBytes(fs.statSync(audioPath).size)
  if (dataBytes < 2) return dataBytes

  const fd = fs.openSync(audioPath, 'r+')
  try {
    fs.writeSync(fd, wavHeader(dataBytes), 0, 44, 0)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  return dataBytes
}

function startedAtFromId(id: string): string {
  const match = /^rec_(\d+)_/.exec(id)
  const milliseconds = match ? Number(match[1]) : 0
  return Number.isFinite(milliseconds) && milliseconds > 0
    ? new Date(milliseconds).toISOString()
    : new Date().toISOString()
}

function validIsoDate(value: string | undefined): string | null {
  if (!value) return null
  const milliseconds = Date.parse(value)
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : null
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
