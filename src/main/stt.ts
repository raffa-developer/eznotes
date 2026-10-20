import fs from 'node:fs'
import path from 'node:path'
import type { TestResult, TranscriptSegment } from '../shared/types'
import { pcmToWav, readPcmRange, readWavInfo, SAMPLE_RATE, wavHeader } from './wav'
import { demoMode, mockFileTranscript, mockLiveTranscript } from './mock'

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
}

interface GroqResponse {
  text?: string
  segments?: GroqSegment[]
  duration?: number
}

function promptFor(glossary: string[] | undefined): string | undefined {
  const base = 'Transcrição em português europeu (pt-PT).'
  if (!glossary?.length) return base
  return `${base} Vocabulário da aula: ${glossary.slice(0, 30).join(', ')}.`
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
        'User-Agent': 'ezNotes/0.3.3'
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
  const segments: TranscriptSegment[] = []

  if (Array.isArray(result.segments) && result.segments.length) {
    for (const [index, segment] of result.segments.entries()) {
      const text = cleanText(segment.text)
      if (!text) continue
      segments.push({
        id: `seg_${Date.now()}_${index}`,
        start: Number(segment.start) || 0,
        end: Number(segment.end) || 0,
        text
      })
    }
  }

  if (!segments.length && result.text?.trim()) {
    const text = cleanText(result.text)
    if (text) {
      segments.push({
        id: `seg_${Date.now()}_0`,
        start: 0,
        end: Number(result.duration) || 0,
        text
      })
    }
  }

  return segments
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
    const chunkWav = Buffer.concat([wavHeader(pcm.length, info.sampleRate), pcm])
    const relativeStart = offset / bytesPerSecond

    onProgress?.(
      Math.min(0.95, (offset / Math.max(1, total)) * 0.9 + 0.05),
      `Transcribing part ${index + 1}`
    )

    const result = await requestTranscription(
      chunkWav,
      `lecture-${index + 1}.wav`,
      options
    )

    if (Array.isArray(result.segments) && result.segments.length) {
      for (const [segmentIndex, segment] of result.segments.entries()) {
        const text = cleanText(segment.text)
        if (!text) continue
        segments.push({
          id: `seg_${index}_${segmentIndex}`,
          start: round(relativeStart + (Number(segment.start) || 0)),
          end: round(relativeStart + (Number(segment.end) || 0)),
          text
        })
      }
    } else if (result.text?.trim()) {
      const text = cleanText(result.text)
      if (text) {
        segments.push({
          id: `seg_${index}_0`,
          start: round(relativeStart),
          end: round(relativeStart + Number(result.duration || 0)),
          text
        })
      }
    }

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
        'User-Agent': 'ezNotes/0.3.3'
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

  const max = Math.min(14, prevWords.length, nextWords.length)
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
    .map((segment) => `[${formatTimestamp(segment.start)}] ${segment.text}`)
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
