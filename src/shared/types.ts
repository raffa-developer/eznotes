export type Theme = 'dark' | 'light' | 'system'
export type UiLanguage = 'en' | 'pt'

export type LlmProvider =
  | 'opencode-go'
  | 'opencode-console'
  | 'groq'
  | 'ollama'
  | 'custom'
export type SttProvider = 'groq'

export interface Settings {
  stt: {
    provider: SttProvider
    model: string
    language: string
    liveTranscript: boolean
    speakerLabels: boolean
  }
  llm: {
    provider: LlmProvider
    baseURL: string
    model: string
  }
  notesDir: string
  obsidianVault: string
  microphoneId: string | null
  retentionDays: number
  theme: Theme
  uiLanguage: UiLanguage
  notifyBeforeMinutes: number
  autoStartRecording: boolean
  globalHotkey: boolean
  globalHotkeyKey: string
}

export interface SettingsStatus {
  settings: Settings
  hasGroqKey: boolean
  hasLlmKey: boolean
  notesDir: string
  appVersion: string
  recordingsDir: string
  demoMode: boolean
  diarization: DiarizationStatus
}

export interface DiarizationStatus {
  runtimeReady: boolean
  modelsReady: boolean
  modelsSizeMb: number
}

export type SecretKey = 'groqApiKey' | 'llmApiKey'

export interface Course {
  id: string
  name: string
  code?: string
  lecturer?: string
  color: string
  glossary: string[]
}

export interface ClassSlot {
  id: string
  courseId: string
  weekday: number // 1 = Monday ... 7 = Sunday
  startTime: string // HH:mm
  endTime: string // HH:mm
  room?: string
}

export interface Schedule {
  courses: Course[]
  slots: ClassSlot[]
}

export interface UpcomingClass {
  slot: ClassSlot
  course: Course
  startsAt: string
  endsAt: string
  isNow: boolean
}

export interface NoteMeta {
  id: string
  title: string
  courseId: string | null
  courseName: string
  date: string
  durationSec: number
  path: string
  recordingId: string | null
  hasAudio: boolean
  tags: string[]
  summary: string
  wordCount: number
}

export interface TranscriptSegment {
  id: string
  start: number
  end: number
  text: string
  speaker?: string
}

export interface NoteDetail extends NoteMeta {
  markdown: string
  transcript: TranscriptSegment[]
}

export type NoteExportFormat = 'markdown' | 'pdf' | 'obsidian' | 'clipboard' | 'notion'

export interface NoteExportResult {
  canceled: boolean
  path?: string
  message: string
}

export type RecordingStatus =
  | 'idle'
  | 'recording'
  | 'paused'
  | 'stopped'
  | 'processing'
  | 'done'
  | 'error'

export interface RecordingSnapshot {
  id: string
  courseId: string | null
  courseName: string
  title: string
  startedAt: string
  elapsedSec: number
  status: RecordingStatus
  error?: string
}

export interface LiveTranscriptSegment {
  id: string
  text: string
  start: number
  end: number
  final: boolean
}

export interface LiveOutline {
  bullets: string[]
  updatedAt: number
}

export interface RecordingLiveState {
  snapshot: RecordingSnapshot | null
  segments: LiveTranscriptSegment[]
  outline: string[]
  processing: { step: string; progress: number } | null
}

export interface RecoverableRecording {
  id: string
  title: string
  courseName: string
  courseId: string | null
  startedAt: string
  durationSec: number
  hasTranscript: boolean
}

export type RecordingEvent =
  | { type: 'state'; snapshot: RecordingSnapshot | null }
  | { type: 'transcript'; segment: LiveTranscriptSegment }
  | { type: 'outline'; outline: LiveOutline }
  | { type: 'level'; level: number }
  | { type: 'notice'; message: string; level: 'info' | 'warn' | 'error' }
  | { type: 'processing'; step: string; progress: number }

export interface StartRecordingInput {
  courseId: string | null
  courseName: string
  title?: string
  glossary?: string[]
}

export interface StoppedRecording {
  id: string
  startedAt: string
  durationSec: number
  audioPath: string
}

export interface FinalizeRecordingInput {
  id: string
  keepAudio: boolean
  courseId: string | null
  courseName: string
  title: string
  glossary: string[]
  transcriptOnly?: boolean
}

export interface FinalizeRecordingResult {
  note: NoteDetail
  audioKept: boolean
  warnings: string[]
}

export interface TestResult {
  ok: boolean
  message: string
}

export interface AppInfo {
  version: string
  platform: string
  notesDir: string
  recordingsDir: string
  demoMode: boolean
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface EzNotesApi {
  app: {
    info: () => Promise<AppInfo>
    openExternal: (url: string) => Promise<void>
    openMainWindow: () => Promise<void>
    openNote: (id: string) => Promise<void>
    hideIsland: () => Promise<void>
    setIslandExpanded: (expanded: boolean, height?: number) => Promise<void>
    onOpenNote: (callback: (noteId: string) => void) => () => void
    onOpenLive: (callback: () => void) => () => void
  }
  settings: {
    get: () => Promise<SettingsStatus>
    update: (patch: Partial<Settings>) => Promise<SettingsStatus>
    setSecret: (key: SecretKey, value: string) => Promise<SettingsStatus>
    clearSecret: (key: SecretKey) => Promise<SettingsStatus>
    chooseNotesDir: () => Promise<SettingsStatus>
    chooseObsidianVault: () => Promise<SettingsStatus>
    testLlm: () => Promise<TestResult>
    testStt: () => Promise<TestResult>
    downloadDiarizationModels: () => Promise<TestResult>
  }
  schedule: {
    get: () => Promise<Schedule>
    save: (schedule: Schedule) => Promise<Schedule>
    upcoming: () => Promise<UpcomingClass[]>
  }
  notes: {
    list: () => Promise<NoteMeta[]>
    get: (id: string) => Promise<NoteDetail | null>
    delete: (id: string) => Promise<void>
    deleteAudio: (id: string) => Promise<NoteDetail | null>
    copy: (id: string) => Promise<NoteExportResult>
    export: (id: string, format: NoteExportFormat) => Promise<NoteExportResult>
    reveal: (id: string) => Promise<void>
    openFolder: () => Promise<void>
    regenerate: (id: string) => Promise<NoteDetail>
  }
  recording: {
    start: (input: StartRecordingInput) => Promise<RecordingSnapshot>
    pause: () => Promise<RecordingSnapshot>
    resume: () => Promise<RecordingSnapshot>
    stop: () => Promise<StoppedRecording>
    finalize: (input: FinalizeRecordingInput) => Promise<FinalizeRecordingResult>
    discard: (id: string) => Promise<void>
    state: () => Promise<RecordingSnapshot | null>
    live: () => Promise<RecordingLiveState>
    recoverable: () => Promise<RecoverableRecording[]>
    recover: (id: string) => Promise<RecordingSnapshot>
    sendAudio: (chunk: ArrayBuffer) => void
    saveWebm: (id: string, data: ArrayBuffer) => void
    onEvent: (callback: (event: RecordingEvent) => void) => () => void
  }
}
