import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type {
  DiarizationStatus,
  TestResult,
  TranscriptSegment
} from '../shared/types'
import { log } from './log'

const SEGMENTATION_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2'
const EMBEDDING_URL =
  'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/nemo_en_titanet_small.onnx'
const SEGMENTATION_DIR = 'sherpa-onnx-pyannote-segmentation-3-0'
const THRESHOLD = 0.8
const MODELS_SIZE_MB = 45
const RUN_TIMEOUT_MS = 10 * 60 * 1000
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000

const activeProcesses = new Set<ChildProcess>()

export interface DiarizationTurn {
  start: number
  end: number
  speaker: number
}

let downloadPromise: Promise<TestResult> | null = null

export function modelsDir(): string {
  return path.join(app.getPath('userData'), 'models', 'sherpa')
}

export function segmentationPath(): string {
  return path.join(modelsDir(), 'segmentation.onnx')
}

export function embeddingPath(): string {
  return path.join(modelsDir(), 'titanet.onnx')
}

export function diarizationStatus(): DiarizationStatus {
  return {
    runtimeReady: fs.existsSync(nodeExePath()),
    modelsReady: diarizationModelsReady(),
    modelsSizeMb: MODELS_SIZE_MB
  }
}

export function diarizationModelsReady(): boolean {
  return (
    fs.existsSync(segmentationPath()) && fs.existsSync(embeddingPath())
  )
}

/**
 * Stop any diarization worker that is still running. Without this, quitting the
 * app leaves the native worker behind, and the next launch starts a second one.
 */
export function cancelDiarization(): void {
  if (!activeProcesses.size) return
  const count = activeProcesses.size
  for (const child of activeProcesses) {
    try {
      child.kill()
    } catch {
      // The process may already be gone.
    }
  }
  activeProcesses.clear()
  log('diarization', 'cancelled', { processes: count })
}

export function downloadDiarizationModels(): Promise<TestResult> {
  if (!downloadPromise) {
    downloadPromise = doDownloadModels().finally(() => {
      downloadPromise = null
    })
  }
  return downloadPromise
}

async function doDownloadModels(): Promise<TestResult> {
  if (!fs.existsSync(nodeExePath())) {
    return {
      ok: false,
      message:
        'The offline speaker-detection runtime is missing. Reinstall ezNotes or run npm run fetch:node in development.'
    }
  }

  try {
    fs.mkdirSync(modelsDir(), { recursive: true })
    log('diarization', 'downloading speaker models')
    await downloadSegmentationModel()
    await downloadEmbeddingModel()
    log('diarization', 'speaker models ready')
    return { ok: true, message: 'Speaker models downloaded. Speaker detection is ready.' }
  } catch (error) {
    log('diarization', 'model download failed', {
      message: errorMessage(error)
    })
    return {
      ok: false,
      message: `Could not download the speaker models: ${errorMessage(error)}`
    }
  }
}

async function downloadSegmentationModel(): Promise<void> {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eznotes-sherpa-'))
  try {
    const archive = path.join(temp, 'segmentation.tar.bz2')
    await downloadFile(SEGMENTATION_URL, archive)
    await runProcess(tarExecutable(), ['-xjf', archive, '-C', temp], 120_000)

    const model = path.join(temp, SEGMENTATION_DIR, 'model.onnx')
    if (!fs.existsSync(model)) {
      throw new Error('The segmentation model was missing from the archive.')
    }
    copyAtomic(model, segmentationPath())
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

async function downloadEmbeddingModel(): Promise<void> {
  const temp = `${embeddingPath()}.download`
  await downloadFile(EMBEDDING_URL, temp)
  fs.rmSync(embeddingPath(), { force: true })
  fs.renameSync(temp, embeddingPath())
}

async function downloadFile(url: string, destination: string): Promise<void> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
  })
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}).`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  fs.writeFileSync(destination, buffer)
}

function copyAtomic(source: string, destination: string): void {
  const temp = `${destination}.download`
  fs.copyFileSync(source, temp)
  fs.rmSync(destination, { force: true })
  fs.renameSync(temp, destination)
}

export async function runDiarization(audioPath: string): Promise<DiarizationTurn[]> {
  const node = nodeExePath()
  const worker = workerPath()

  if (!fs.existsSync(node)) {
    throw new Error('The offline speaker-detection runtime is missing.')
  }
  if (!fs.existsSync(worker)) {
    throw new Error('The offline speaker-detection worker is missing.')
  }
  if (!diarizationModelsReady()) {
    throw new Error('The speaker models are not downloaded.')
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eznotes-diarize-'))
  const output = path.join(temp, 'turns.json')
  const started = Date.now()
  log('diarization', 'started', {
    audioPath,
    bytes: fs.existsSync(audioPath) ? fs.statSync(audioPath).size : 0
  })

  try {
    await runProcess(
      node,
      [
        worker,
        audioPath,
        segmentationPath(),
        embeddingPath(),
        output,
        String(THRESHOLD)
      ],
      RUN_TIMEOUT_MS
    )

    const parsed = JSON.parse(fs.readFileSync(output, 'utf8')) as {
      ok?: boolean
      segments?: DiarizationTurn[]
      error?: string
    }
    if (!parsed.ok || !Array.isArray(parsed.segments)) {
      throw new Error(parsed.error || 'Speaker detection failed.')
    }

    log('diarization', 'finished', {
      turns: parsed.segments.length,
      elapsedMs: Date.now() - started
    })
    return parsed.segments
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

/**
 * Assigns a speaker label to each transcript segment by maximum time overlap.
 * Labels are numbered in order of first appearance in the transcript.
 */
export function assignSpeakers(
  segments: TranscriptSegment[],
  turns: DiarizationTurn[]
): TranscriptSegment[] {
  if (!turns.length) return segments

  const labels = new Map<number, string>()
  const labelFor = (speaker: number): string => {
    let label = labels.get(speaker)
    if (!label) {
      label = `Speaker ${labels.size + 1}`
      labels.set(speaker, label)
    }
    return label
  }

  return segments.map((segment) => {
    const overlaps = new Map<number, number>()
    for (const turn of turns) {
      const overlap =
        Math.min(segment.end, turn.end) - Math.max(segment.start, turn.start)
      if (overlap > 0) {
        overlaps.set(turn.speaker, (overlaps.get(turn.speaker) ?? 0) + overlap)
      }
    }

    let best: number | null = null
    let bestOverlap = 0
    for (const [speaker, overlap] of overlaps) {
      if (overlap > bestOverlap) {
        best = speaker
        bestOverlap = overlap
      }
    }

    return best === null ? segment : { ...segment, speaker: labelFor(best) }
  })
}

function nodeExePath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'node', 'node.exe')
    : path.join(app.getAppPath(), 'vendor', 'node', 'node.exe')
}

function workerPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'diarizer', 'diarization-worker.cjs')
    : path.join(
        app.getAppPath(),
        'src',
        'main',
        'diarizer',
        'diarization-worker.cjs'
      )
}

function tarExecutable(): string {
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  const candidate = path.join(systemRoot, 'System32', 'tar.exe')
  return fs.existsSync(candidate) ? candidate : 'tar'
}

function runProcess(
  command: string,
  args: string[],
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true })
    activeProcesses.add(child)
    let stderr = ''
    let settled = false

    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      activeProcesses.delete(child)
      if (error) reject(error)
      else resolve()
    }

    const timer = setTimeout(() => {
      child.kill()
      finish(new Error('The process took too long and was stopped.'))
    }, timeoutMs)

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => finish(error))
    child.on('close', (code) => {
      if (code === 0) finish()
      else finish(new Error(stderr.trim() || `Process exited with code ${code}.`))
    })
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
