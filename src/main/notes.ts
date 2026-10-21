import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { app } from 'electron'
import type { NoteDetail, NoteMeta, TranscriptSegment } from '../shared/types'
import { readJson, writeJson } from './store'
import { extractSummary, extractTitle } from './llm'
import { readCachedTranscript } from './stt'
import { formatTimestamp } from './stt'

interface NotesIndex {
  notes: NoteMeta[]
}

function notesMetaDir(notesDir: string): string {
  const current = path.join(notesDir, '.eznotes')
  const legacy = path.join(notesDir, '.aula')
  if (!fs.existsSync(current) && fs.existsSync(legacy)) {
    try {
      fs.renameSync(legacy, current)
    } catch {
      // Keep using the legacy folder if it is locked.
    }
  }
  return fs.existsSync(legacy) && !fs.existsSync(current) ? legacy : current
}

function indexFile(notesDir: string): string {
  return path.join(notesMetaDir(notesDir), 'index.json')
}

export function noteRecordingDir(recordingId: string): string {
  return path.join(app.getPath('userData'), 'recordings', recordingId)
}

export function noteTranscriptDir(notesDir: string): string {
  return path.join(notesMetaDir(notesDir), 'transcripts')
}

export function noteTranscriptPath(notesDir: string, noteId: string): string {
  return path.join(noteTranscriptDir(notesDir), `${noteId}.json`)
}

export function writeNoteTranscript(
  notesDir: string,
  noteId: string,
  segments: TranscriptSegment[]
): void {
  fs.mkdirSync(noteTranscriptDir(notesDir), { recursive: true })
  fs.writeFileSync(noteTranscriptPath(notesDir, noteId), JSON.stringify(segments, null, 2))
}

export function readNoteTranscript(
  notesDir: string,
  noteId: string,
  recordingId: string | null
): TranscriptSegment[] {
  try {
    const raw = fs.readFileSync(noteTranscriptPath(notesDir, noteId), 'utf8')
    return JSON.parse(raw) as TranscriptSegment[]
  } catch {
    if (!recordingId) return []
    return readCachedTranscript(noteRecordingDir(recordingId)) ?? []
  }
}

export function noteAudioPath(recordingId: string | null): string | null {
  if (!recordingId) return null
  const dir = noteRecordingDir(recordingId)
  for (const name of ['audio.webm', 'audio.wav']) {
    const file = path.join(dir, name)
    if (fs.existsSync(file)) return file
  }
  return null
}

export function listNotes(notesDir: string): NoteMeta[] {
  const index = readJson<NotesIndex>(indexFile(notesDir), { notes: [] })
  const existing = index.notes.filter((note) => fs.existsSync(note.path))

  if (existing.length !== index.notes.length) {
    writeJson(indexFile(notesDir), { notes: existing })
  }

  if (!existing.length) {
    const rebuilt = rebuildNotesIndex(notesDir)
    if (rebuilt.length) return sortNotes(rebuilt)
  } else {
    const known = new Set(existing.map((note) => path.resolve(note.path)))
    const discovered = findMarkdownFiles(notesDir).filter(
      (file) => !known.has(path.resolve(file))
    )
    if (discovered.length) {
      const merged = [...existing, ...discovered.map(metaFromFile)]
      writeJson(indexFile(notesDir), { notes: merged })
      return sortNotes(merged)
    }
  }

  return sortNotes(
    existing.map((note) => ({
      ...note,
      hasAudio: Boolean(noteAudioPath(note.recordingId))
    }))
  )
}

export function rebuildNotesIndex(notesDir: string): NoteMeta[] {
  const notes = findMarkdownFiles(notesDir)
    .map(metaFromFile)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  writeJson(indexFile(notesDir), { notes })
  return notes
}

function sortNotes(notes: NoteMeta[]): NoteMeta[] {
  return notes
    .map((note) => ({
      ...note,
      hasAudio: Boolean(noteAudioPath(note.recordingId))
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

function findMarkdownFiles(dir: string): string[] {
  const files: string[] = []
  if (!fs.existsSync(dir)) return files

  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(full)
    }
  }

  walk(dir)
  return files
}

function metaFromFile(file: string): NoteMeta {
  const raw = fs.readFileSync(file, 'utf8')
  const { attributes, body } = splitFrontmatter(raw)
  const stat = fs.statSync(file)
  const fallbackTitle = path.basename(file, '.md').replace(/^\d{4}-\d{2}-\d{2} - /, '')
  const id =
    typeof attributes.id === 'string'
      ? attributes.id
      : `note_${createHash('sha1').update(path.resolve(file)).digest('hex').slice(0, 16)}`
  const parsedDate =
    typeof attributes.date === 'string' ? new Date(attributes.date) : stat.mtime
  const date = Number.isNaN(parsedDate.getTime())
    ? stat.mtime.toISOString()
    : parsedDate.toISOString()
  const duration =
    typeof attributes.duration === 'number' ? attributes.duration : 0
  const recordingId =
    typeof attributes.recordingId === 'string' ? attributes.recordingId : null
  const tags = Array.isArray(attributes.tags)
    ? attributes.tags.filter((tag): tag is string => typeof tag === 'string')
    : []

  return {
    id,
    title: extractTitle(body, typeof attributes.title === 'string' ? attributes.title : fallbackTitle),
    courseId: typeof attributes.courseId === 'string' ? attributes.courseId : null,
    courseName:
      typeof attributes.course === 'string'
        ? attributes.course
        : path.basename(path.dirname(file)),
    date,
    durationSec: duration,
    path: file,
    recordingId,
    hasAudio: Boolean(noteAudioPath(recordingId)),
    tags,
    summary: extractSummary(body),
    wordCount: body.split(/\s+/).filter(Boolean).length
  }
}

export function getNote(notesDir: string, id: string): NoteDetail | null {
  const meta = listNotes(notesDir).find((note) => note.id === id)
  if (!meta) return null

  let raw = ''
  try {
    raw = fs.readFileSync(meta.path, 'utf8')
  } catch {
    return null
  }

  const { body } = splitFrontmatter(raw)
  const transcript = readNoteTranscript(notesDir, meta.id, meta.recordingId)

  return {
    ...meta,
    markdown: body,
    transcript,
    hasAudio: Boolean(noteAudioPath(meta.recordingId))
  }
}

export interface SaveNoteInput {
  id: string
  title: string
  courseId: string | null
  courseName: string
  date: string
  durationSec: number
  recordingId: string | null
  language: string
  tags: string[]
  markdown: string
  notesDir: string
}

export function saveNote(input: SaveNoteInput): NoteMeta {
  const title = input.title.trim() || 'Apontamentos'
  const date = new Date(input.date)
  const folder = path.join(input.notesDir, sanitizeFilename(input.courseName || 'Geral'))
  fs.mkdirSync(folder, { recursive: true })

  const baseName = `${formatDateForFilename(date)} - ${sanitizeFilename(title)}`
  const file = uniquePath(folder, baseName, '.md')
  const cleanMarkdown = input.markdown.trim()
  if (!cleanMarkdown) {
    throw new Error('Refusing to save an empty note.')
  }
  const finalTitle = extractTitle(cleanMarkdown, title)
  const summary = extractSummary(cleanMarkdown)
  const wordCount = cleanMarkdown.split(/\s+/).filter(Boolean).length

  const frontmatter = [
    '---',
    `id: ${JSON.stringify(input.id)}`,
    `title: ${JSON.stringify(finalTitle)}`,
    `course: ${JSON.stringify(input.courseName)}`,
    `courseId: ${JSON.stringify(input.courseId)}`,
    `date: ${JSON.stringify(date.toISOString())}`,
    `duration: ${Math.round(input.durationSec)}`,
    `recordingId: ${JSON.stringify(input.recordingId)}`,
    `language: ${JSON.stringify(input.language)}`,
    `tags: ${JSON.stringify(input.tags)}`,
    '---',
    ''
  ].join('\n')

  fs.writeFileSync(file, `${frontmatter}${cleanMarkdown}\n`, 'utf8')

  const meta: NoteMeta = {
    id: input.id,
    title: finalTitle,
    courseId: input.courseId,
    courseName: input.courseName,
    date: date.toISOString(),
    durationSec: Math.round(input.durationSec),
    path: file,
    recordingId: input.recordingId,
    hasAudio: Boolean(noteAudioPath(input.recordingId)),
    tags: input.tags,
    summary,
    wordCount
  }

  const index = readJson<NotesIndex>(indexFile(input.notesDir), { notes: [] })
  index.notes = [meta, ...index.notes.filter((note) => note.id !== meta.id)]
  writeJson(indexFile(input.notesDir), index)
  return meta
}

export function updateNoteMarkdown(
  notesDir: string,
  id: string,
  markdown: string
): NoteMeta {
  const index = readJson<NotesIndex>(indexFile(notesDir), { notes: [] })
  const meta = index.notes.find((note) => note.id === id)
  if (!meta) throw new Error('Note not found.')

  const raw = fs.readFileSync(meta.path, 'utf8')
  const { attributes } = splitFrontmatter(raw)
  const cleanMarkdown = markdown.trim()
  const nextTitle = extractTitle(cleanMarkdown, meta.title)
  attributes.title = nextTitle
  const headerLines = ['---']
  for (const [key, value] of Object.entries(attributes)) {
    headerLines.push(`${key}: ${JSON.stringify(value)}`)
  }
  headerLines.push('---', '')

  fs.writeFileSync(meta.path, `${headerLines.join('\n')}${cleanMarkdown}\n`, 'utf8')

  const next: NoteMeta = {
    ...meta,
    title: nextTitle,
    summary: extractSummary(cleanMarkdown),
    wordCount: cleanMarkdown.split(/\s+/).filter(Boolean).length
  }
  index.notes = index.notes.map((note) => (note.id === id ? next : note))
  writeJson(indexFile(notesDir), index)
  return next
}

export function removeNoteAudio(notesDir: string, id: string): NoteMeta {
  const index = readJson<NotesIndex>(indexFile(notesDir), { notes: [] })
  const meta = index.notes.find((note) => note.id === id)
  if (!meta) throw new Error('Note not found.')

  if (meta.recordingId) {
    fs.rmSync(noteRecordingDir(meta.recordingId), { recursive: true, force: true })
  }
  const next: NoteMeta = { ...meta, hasAudio: false }
  index.notes = index.notes.map((note) => (note.id === id ? next : note))
  writeJson(indexFile(notesDir), index)
  return next
}

export function deleteNote(notesDir: string, id: string, deleteAudio = true): void {
  const index = readJson<NotesIndex>(indexFile(notesDir), { notes: [] })
  const meta = index.notes.find((note) => note.id === id)
  if (!meta) return

  try {
    fs.rmSync(meta.path, { force: true })
  } catch {
    // Ignore a locked file; the index is still updated below.
  }

  if (deleteAudio && meta.recordingId) {
    fs.rmSync(noteRecordingDir(meta.recordingId), { recursive: true, force: true })
  }

  fs.rmSync(noteTranscriptPath(notesDir, id), { force: true })

  index.notes = index.notes.filter((note) => note.id !== id)
  writeJson(indexFile(notesDir), index)
}

export function transcriptWithOffsets(
  segments: TranscriptSegment[]
): Array<TranscriptSegment & { label: string }> {
  return segments.map((segment) => ({
    ...segment,
    label: formatTimestamp(segment.start)
  }))
}

export function splitFrontmatter(raw: string): {
  attributes: Record<string, string | string[] | number | null>
  body: string
} {
  if (!raw.startsWith('---\n')) return { attributes: {}, body: raw }
  const end = raw.indexOf('\n---', 4)
  if (end === -1) return { attributes: {}, body: raw }

  const header = raw.slice(4, end)
  const body = raw.slice(end + 4).replace(/^\r?\n/, '')
  const attributes: Record<string, string | string[] | number | null> = {}

  for (const line of header.split(/\r?\n/)) {
    const separator = line.indexOf(':')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    if (!key) continue
    attributes[key] = parseAttribute(value)
  }

  return { attributes, body }
}

function parseAttribute(value: string): string | string[] | number | null {
  if (value === 'null' || value === '') return null
  if (value.startsWith('[') || value.startsWith('"') || /^-?\d+(\.\d+)?$/.test(value)) {
    try {
      return JSON.parse(value) as string | string[] | number
    } catch {
      return value
    }
  }
  return value
}

export function sanitizeFilename(value: string): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 90)
  return cleaned || 'Geral'
}

function formatDateForFilename(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function uniquePath(folder: string, base: string, extension: string): string {
  let candidate = path.join(folder, `${base}${extension}`)
  let counter = 2
  while (fs.existsSync(candidate)) {
    candidate = path.join(folder, `${base} (${counter})${extension}`)
    counter += 1
  }
  return candidate
}
