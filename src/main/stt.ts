import fs from 'node:fs'
import path from 'node:path'
import type { TestResult, TranscriptSegment } from '../shared/types'
import { pcmToWav, readPcmRange, readWavInfo, SAMPLE_RATE, wavHeader } from './wav'
import { demoMode, mockFileTranscript, mockLiveTranscript } from './mock'
import { userAgent } from './appVersion'

const GROQ_BASE =
  process.env.EZNOTES_GROQ_BASE_URL ??
  process.env.AULA_GROQ_BASE_URL ??
  'https://api.groq.com/openai/v1'
const MAX_CHUNK_BYTES = 15 * 1024 * 1024

export interface SttOptions {
  apiKey: string
  model: string
  language: string
  glossary?: string[]
}

interface GroqSegment {
  id?: number
  start: number
  end: number
  text: string
  avg_logprob?: number
  no_speech_prob?: number
  compression_ratio?: number
}

interface GroqResponse {
  text?: string
  segments?: GroqSegment[]
  duration?: number
}

export interface TranscriptionQuality {
  text: string
  avg_logprob?: number
  no_speech_prob?: number
  compression_ratio?: number
}

export interface SpeechWindow {
  pcm: Buffer
  startByte: number
  endByte: number
  durationMs: number
  voicedMs: number
  recentVoicedMs: number
}

const FRAME_MS = 20
const VOICE_PADDING_MS = 160

function promptFor(glossary: string[] | undefined): string | undefined {
  const base = 'Aula universitária em português europeu (pt-PT).'
  if (!glossary?.length) return base
  return `${base} Vocabulário da aula: ${glossary.slice(0, 20).join(', ')}.`
}

/**
 * Whisper hallucinates confidently on silence, so trim the quiet edges and
 * report how much of the window actually contains speech. The caller decides
 * whether there is enough material to transcribe.
 */
export function analyzeSpeech(
  pcm: Buffer,
  sampleRate = SAMPLE_RATE,
  recentMs = 0
): SpeechWindow | null {
  const frameSamples = Math.max(1, Math.round((sampleRate * FRAME_MS) / 1000))
  const frameBytes = frameSamples * 2
  const frameCount = Math.floor(pcm.length / frameBytes)
  if (!frameCount) return null

  const frameRms = new Float64Array(frameCount)
  for (let frame = 0; frame < frameCount; frame++) {
    let sum = 0
    const offset = frame * frameBytes
    for (let sample = 0; sample < frameSamples; sample++) {
      const value = pcm.readInt16LE(offset + sample * 2) / 32768
      sum += value * value
    }
    frameRms[frame] = Math.sqrt(sum / frameSamples)
  }

  const sorted = Float64Array.from(frameRms).sort()
  const noiseFloor = sorted[Math.floor((frameCount - 1) * 0.2)] ?? 0
  const loud = sorted[Math.floor((frameCount - 1) * 0.9)] ?? 0
  if (loud > 0 && noiseFloor / loud > 0.8) return null
  const threshold = Math.max(0.004, Math.min(0.02, noiseFloor * 1.6))

  let first = -1
  let last = -1
  let voicedFrames = 0
  const voiced = new Uint8Array(frameCount)
  for (let frame = 0; frame < frameCount; frame++) {
    if (frameRms[frame] < threshold) continue
    voiced[frame] = 1
    if (first < 0) first = frame
    last = frame
    voicedFrames += 1
  }
  if (first < 0 || last < first) return null

  const paddingFrames = Math.ceil(VOICE_PADDING_MS / FRAME_MS)
  const startFrame = Math.max(0, first - paddingFrames)
  const endFrame = Math.min(frameCount, last + 1 + paddingFrames)
  const startByte = startFrame * frameBytes
  const endByte = Math.min(pcm.length, endFrame * frameBytes)

  let recentVoicedMs = voicedFrames * FRAME_MS
  if (recentMs > 0) {
    const recentFrames = Math.min(frameCount, Math.ceil(recentMs / FRAME_MS))
    let recentVoiced = 0
    for (let frame = frameCount - recentFrames; frame < frameCount; frame++) {
      if (voiced[frame]) recentVoiced += 1
    }
    recentVoicedMs = recentVoiced * FRAME_MS
  }

  return {
    pcm: pcm.subarray(startByte, endByte),
    startByte,
    endByte,
    durationMs: frameCount * FRAME_MS,
    voicedMs: voicedFrames * FRAME_MS,
    recentVoicedMs
  }
}

const STRONG_HALLUCINATIONS = [
  /^obrigad[oa] por assistir\b/,
  /^legendas? (pela|da) comunidade\b/,
  /^(por favor )?(se )?inscreva se no canal\b/,
  /^(aula universitaria|transcricao) em portugues\b/,
  /^(subtitles|subs) by\b/,
  /^thanks for watching\b/
]

const WEAK_HALLUCINATIONS = [
  /^ate (a )?proxima\b/,
  /^(tchau|adeus|xau)\b/,
  /^(musica|aplausos|risadas|silencio)\b/
]

/**
 * Groq returns per-segment confidence metadata with verbose_json. Use it to
 * discard segments Whisper itself considers silent, repeated, or unreliable.
 */
export function isLikelyHallucination(segment: TranscriptionQuality): boolean {
  const noSpeech = finiteNumber(segment.no_speech_prob)
  const logprob = finiteNumber(segment.avg_logprob)
  const compression = finiteNumber(segment.compression_ratio)

  if (compression !== undefined && compression > 2.4) return true
  if (noSpeech !== undefined && noSpeech > 0.8) return true
  if (logprob !== undefined && logprob < -1.1) return true
  if (
    noSpeech !== undefined &&
    logprob !== undefined &&
    noSpeech > 0.5 &&
    logprob < -0.6
  ) {
    return true
  }

  const words = normalizeWords(segment.text)
  if (!words.length) return true
  const text = words.join(' ')

  if (STRONG_HALLUCINATIONS.some((pattern) => pattern.test(text))) return true

  const uncertain =
    (noSpeech !== undefined && noSpeech > 0.35) ||
    (logprob !== undefined && logprob < -0.5) ||
    (compression !== undefined && compression > 2)
  return (
    uncertain &&
    words.length <= 12 &&
    WEAK_HALLUCINATIONS.some((pattern) => pattern.test(text))
  )
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function mimeFor(fileName: string): string {
  return fileName.endsWith('.wav') ? 'audio/wav' : 'application/octet-stream'
}

async function requestTranscription(
  wav: Buffer,
  fileName: string,
  options: SttOptions,
  attempt = 0
): Promise<GroqResponse> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(wav)], { type: mimeFor(fileName) }), fileName)
  form.append('model', options.model)
  form.append('language', options.language)
  form.append('response_format', 'verbose_json')
  form.append('temperature', '0')
  const prompt = promptFor(options.glossary)
  if (prompt) form.append('prompt', prompt)

  let response: Response
  try {
    response = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'User-Agent': userAgent()
      },
      body: form,
      signal: AbortSignal.timeout(300_000)
    })
  } catch (error) {
    if (attempt < 2) {
      await delay(1200 * (attempt + 1))
      return requestTranscription(wav, fileName, options, attempt + 1)
    }
    throw new Error(`Groq connection failed: ${errorMessage(error)}`)
  }

  if (!response.ok) {
    const body = await response.text()
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      const retryAfter = Number(response.headers.get('retry-after'))
      await delay(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 1500 * (attempt + 1)
      )
      return requestTranscription(wav, fileName, options, attempt + 1)
    }
    throw new Error(`Groq transcription failed (${response.status}): ${compact(body)}`)
  }

  return (await response.json()) as GroqResponse
}

function segmentsFromResult(
  result: GroqResponse,
  idPrefix: string,
  offsetSec = 0
): TranscriptSegment[] {
  const rawSegments = Array.isArray(result.segments) ? result.segments : []
  const segments: TranscriptSegment[] = []

  if (rawSegments.length) {
    for (const [index, segment] of rawSegments.entries()) {
      const text = cleanText(segment.text)
      if (!text || isLikelyHallucination({ ...segment, text })) continue
      segments.push({
        id: `${idPrefix}_${index}`,
        start: round(offsetSec + (Number(segment.start) || 0)),
        end: round(offsetSec + (Number(segment.end) || 0)),
        text
      })
    }
    // If the API returned segments, do not fall back to the raw full text:
    // filtered segments mean the audio was silence or too unreliable.
    return segments
  }

  if (result.text?.trim()) {
    const text = cleanText(result.text)
    const end = Number(result.duration) || 0
    if (text && !isLikelyHallucination({ text })) {
      segments.push({
        id: `${idPrefix}_0`,
        start: round(offsetSec),
        end: round(offsetSec + end),
        text
      })
    }
  }

  return segments
}

export async function transcribePcm(
  pcm: Buffer,
  options: SttOptions,
  fileName = 'live.wav'
): Promise<TranscriptSegment[]> {
  if (demoMode) {
    const duration = pcm.length / 2 / SAMPLE_RATE
    return [
      {
        id: `mock_live_${Date.now()}`,
        start: 0,
        end: Math.round(duration * 10) / 10,
        text: mockLiveTranscript()
      }
    ]
  }

  const wav = pcmToWav(pcm, SAMPLE_RATE)
  const result = await requestTranscription(wav, fileName, options)
  return segmentsFromResult(result, `seg_${Date.now()}`)
}

export interface FileTranscriptionResult {
  segments: TranscriptSegment[]
  language: string
  durationSec: number
}

export async function transcribeAudioFile(
  audioPath: string,
  options: SttOptions,
  onProgress?: (progress: number, message: string) => void
): Promise<FileTranscriptionResult> {
  const info = readWavInfo(audioPath)

  if (demoMode) {
    onProgress?.(0.5, 'Transcribing the lecture (demo)')
    await delay(600)
    onProgress?.(1, 'Transcript ready (demo)')
    return {
      segments: mockFileTranscript(info.durationSec),
      language: options.language,
      durationSec: info.durationSec
    }
  }

  const bytesPerSecond = info.sampleRate * info.channels * (info.bitsPerSample / 8)
  let offset = 0
  let index = 0
  const segments: TranscriptSegment[] = []
  const total = info.dataLength

  while (offset < total) {
    const remaining = total - offset
    let targetLength = Math.min(MAX_CHUNK_BYTES, remaining)

    if (remaining > targetLength) {
      const targetSample = Math.floor((offset + targetLength) / 2)
      const sampleOffset = Math.floor(targetSample / 2) * 2
      const cut = findQuietCut(audioPath, info, sampleOffset, bytesPerSecond)
      if (cut > offset + bytesPerSecond * 30) {
        targetLength = cut - offset
      }
    }

    const pcm = readPcmRange(audioPath, info, offset, targetLength)
    let chunkPcm = pcm
    let chunkOffset = 0

    if (info.bitsPerSample === 16 && info.channels === 1) {
      const speech = analyzeSpeech(pcm, info.sampleRate)
      if (!speech) {
        offset += targetLength
        index += 1
        continue
      }
      chunkPcm = speech.pcm
      chunkOffset = speech.startByte
    }

    const chunkWav = Buffer.concat([wavHeader(chunkPcm.length, info.sampleRate), chunkPcm])
    const relativeStart = (offset + chunkOffset) / bytesPerSecond

    onProgress?.(
      Math.min(0.95, (offset / Math.max(1, total)) * 0.9 + 0.05),
      `Transcribing part ${index + 1}`
    )

    const result = await requestTranscription(
      chunkWav,
      `lecture-${index + 1}.wav`,
      options
    )

    segments.push(...segmentsFromResult(result, `seg_${index}`, relativeStart))

    offset += targetLength
    index += 1
  }

  onProgress?.(1, 'Transcript ready')
  return {
    segments: dedupeSegments(segments),
    language: options.language,
    durationSec: info.durationSec
  }
}

function findQuietCut(
  file: string,
  info: ReturnType<typeof readWavInfo>,
  targetSampleByte: number,
  bytesPerSecond: number
): number {
  const windowBytes = Math.floor(bytesPerSecond * 0.04) * 2
  const searchBytes = Math.floor(bytesPerSecond * 6)
  const start = Math.max(0, targetSampleByte - searchBytes)
  const end = Math.min(info.dataLength, targetSampleByte + searchBytes)
  const search = readPcmRange(file, info, start, end - start)
  const sampleCount = Math.floor(search.length / 2)
  if (sampleCount < 4) return targetSampleByte

  let bestIndex = Math.max(0, Math.min(sampleCount - 1, Math.floor((targetSampleByte - start) / 2)))
  let bestScore = Number.POSITIVE_INFINITY
  const step = Math.max(1, Math.floor(windowBytes / 2 / 2))

  for (let sample = 0; sample + step < sampleCount; sample += step) {
    let sum = 0
    for (let i = 0; i < step; i++) {
      const value = search.readInt16LE((sample + i) * 2) / 32768
      sum += value * value
    }
    const score = sum / step
    if (score < bestScore) {
      bestScore = score
      bestIndex = sample
    }
  }

  return start + bestIndex * 2
}

export async function testGroqKey(apiKey: string): Promise<TestResult> {
  if (demoMode) {
    return { ok: true, message: 'Demo mode: Groq is simulated.' }
  }
  try {
    const response = await fetch(`${GROQ_BASE}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': userAgent()
      },
      signal: AbortSignal.timeout(30_000)
    })
    if (!response.ok) {
      return {
        ok: false,
        message: `Groq rejected the key (${response.status}).`
      }
    }
    const data = (await response.json()) as { data?: Array<{ id?: string }> }
    const whisper = data.data?.find((model) => model.id?.includes('whisper'))
    return {
      ok: true,
      message: whisper
        ? `Connected to Groq. ${whisper.id} is available.`
        : 'Connected to Groq.'
    }
  } catch (error) {
    return { ok: false, message: `Could not reach Groq: ${errorMessage(error)}` }
  }
}

export function cleanText(input: string): string {
  return input
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim()
}

export function dedupeSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  const result: TranscriptSegment[] = []
  let previous = ''
  for (const segment of segments) {
    if (!segment.text.trim()) continue
    const text = trimOverlap(previous, segment.text)
    if (!text) continue
    result.push({ ...segment, text })
    previous = `${previous} ${segment.text}`.trim().slice(-500)
  }
  return result
}

export function trimOverlap(previous: string, next: string): string {
  const prevWords = normalizeWords(previous)
  const nextWords = next.trim().split(/\s+/).filter(Boolean)
  if (!prevWords.length || !nextWords.length) return next.trim()

  const max = Math.min(20, prevWords.length, nextWords.length)
  for (let size = max; size >= 3; size--) {
    const prevTail = prevWords.slice(-size).join(' ')
    const nextHead = normalizeWords(nextWords.slice(0, size).join(' ')).join(' ')
    if (prevTail === nextHead) {
      return nextWords.slice(size).join(' ').trim()
    }
  }

  const normalizedNext = normalizeWords(next).join(' ')
  const normalizedPrev = prevWords.join(' ')
  if (normalizedNext && normalizedPrev.endsWith(normalizedNext)) return ''
  return next.trim()
}

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').slice(0, 260)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function transcriptToText(segments: TranscriptSegment[]): string {
  return segments
    .map((segment) => {
      const speaker = segment.speaker ? `${segment.speaker}: ` : ''
      return `[${formatTimestamp(segment.start)}] ${speaker}${segment.text}`
    })
    .join('\n')
}

export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

export function transcriptCachePath(recordingDir: string): string {
  return path.join(recordingDir, 'transcript.json')
}

export function readCachedTranscript(recordingDir: string): TranscriptSegment[] | null {
  try {
    const raw = fs.readFileSync(transcriptCachePath(recordingDir), 'utf8')
    const parsed = JSON.parse(raw) as TranscriptSegment[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeCachedTranscript(
  recordingDir: string,
  segments: TranscriptSegment[]
): void {
  fs.writeFileSync(transcriptCachePath(recordingDir), JSON.stringify(segments, null, 2))
}
