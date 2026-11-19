import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { app } from 'electron'
import type {
  NoteDetail,
  NoteMeta,
  NoteSearchResult,
  NoteVersionMeta,
  TranscriptSegment
} from '../shared/types'
import { writeJson } from './store'
import { extractSummary, extractTitle } from './llm'
import { readCachedTranscript } from './stt'
import { formatTimestamp } from './stt'
import { log } from './log'

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
  clearSearchCache()
}

export function readNoteTranscript(
  notesDir: string,
  noteId: string,
  recordingId: string | null
): TranscriptSegment[] {
  try {
    const raw = fs
      .readFileSync(noteTranscriptPath(notesDir, noteId), 'utf8')
      .replace(/^\uFEFF/, '')
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

interface NotesCache {
  dir: string
  notes: NoteMeta[]
}

interface SearchTextEntry {
  mtimeMs: number
  body: string
  transcript: TranscriptSegment[]
}

const WATCH_DEBOUNCE_MS = 350
const SEARCH_MIN_LENGTH = 2
const SEARCH_LIMIT = 40

let notesCache: NotesCache | null = null
let notesWatcher: fs.FSWatcher | null = null
let notesWatchRoot: string | null = null
let notesWatchTimer: NodeJS.Timeout | null = null
let notesWatchListener: (() => void) | null = null
let notesWatchPaths = new Set<string>()
const searchTextCache = new Map<string, SearchTextEntry>()

export function listNotes(notesDir: string): NoteMeta[] {
  return [...ensureNotesCache(notesDir)]
}

function ensureNotesCache(notesDir: string): NoteMeta[] {
  if (notesCache?.dir === notesDir) return notesCache.notes
  return commitNotes(notesDir, scanNotes(notesDir))
}

function scanNotes(notesDir: string): NoteMeta[] {
  return sortNotes(findMarkdownFiles(notesDir).map(metaFromFile))
}

function commitNotes(notesDir: string, notes: NoteMeta[]): NoteMeta[] {
  const sorted = sortNotes(notes)
  notesCache = { dir: notesDir, notes: sorted }
  writeJson(indexFile(notesDir), { notes: sorted })
  clearSearchCache()
  return sorted
}

export function rebuildNotesIndex(notesDir: string): NoteMeta[] {
  return commitNotes(notesDir, scanNotes(notesDir))
}

/** Explicit recovery path for changes made outside the running app. */
export function rescanNotes(notesDir: string): NoteMeta[] {
  return commitNotes(notesDir, scanNotes(notesDir))
}

function sortNotes(notes: NoteMeta[]): NoteMeta[] {
  return [...notes].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )
}

/**
 * Apply a batch of watched paths without walking the whole notes folder.
 * Unknown or directory-sized changes fall back to a full rescan.
 */
export function refreshNotesFromPaths(
  notesDir: string,
  changedPaths: string[]
): NoteMeta[] {
  const current = ensureNotesCache(notesDir)
  let notes = current
  const dirtyDirs = new Set<string>()

  for (const relative of changedPaths) {
    if (!relative || !relative.toLowerCase().endsWith('.md')) {
      return rescanNotes(notesDir)
    }

    const target = path.resolve(notesDir, relative)
    if (!isInside(notesDir, target)) continue

    if (fs.existsSync(target) && fs.statSync(target).isFile()) {
      const meta = metaFromFile(target)
      notes = notes.filter(
        (note) => note.path !== target && note.id !== meta.id
      )
      notes = [...notes, meta]
    } else {
      notes = notes.filter((note) => note.path !== target)
    }
    dirtyDirs.add(path.dirname(target))
  }

  for (const dir of dirtyDirs) {
    const existing = new Set(
      findMarkdownFilesIn(dir).map((file) => path.resolve(file))
    )
    notes = notes.filter(
      (note) =>
        path.dirname(note.path) !== dir || existing.has(note.path)
    )
    const known = new Set(notes.map((note) => note.path))
    for (const file of existing) {
      if (!known.has(file)) notes = [...notes, metaFromFile(file)]
    }
  }

  return commitNotes(notesDir, notes)
}

export function startNotesWatcher(
  notesDir: string,
  onChange: () => void
): void {
  const root = path.resolve(notesDir)
  if (notesWatchRoot === root && notesWatcher) {
    notesWatchListener = onChange
    return
  }
  stopNotesWatcher()
  ensureNotesCache(notesDir)
  notesWatchRoot = root
  notesWatchListener = onChange

  try {
    notesWatcher = fs.watch(root, { recursive: true }, (_event, filename) => {
      const relative = filename ? filename.toString() : ''
      if (relative && isIgnoredWatchPath(relative)) return
      if (relative) notesWatchPaths.add(relative)
      else notesWatchPaths.add('')
      if (notesWatchTimer) clearTimeout(notesWatchTimer)
      notesWatchTimer = setTimeout(() => {
        notesWatchTimer = null
        const paths = [...notesWatchPaths]
        notesWatchPaths = new Set()
        if (!paths.length) return
        try {
          refreshNotesFromPaths(notesDir, paths)
          notesWatchListener?.()
        } catch (error) {
          log('notes', 'could not refresh watched notes', {
            message: error instanceof Error ? error.message : String(error)
          })
        }
      }, WATCH_DEBOUNCE_MS)
    })
    notesWatcher.on('error', (error) => {
      log('notes', 'notes watcher stopped', {
        message: error instanceof Error ? error.message : String(error)
      })
    })
  } catch (error) {
    notesWatchRoot = null
    log('notes', 'could not watch notes folder', {
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

export function stopNotesWatcher(): void {
  if (notesWatchTimer) clearTimeout(notesWatchTimer)
  notesWatchTimer = null
  notesWatchPaths = new Set()
  notesWatchListener = null
  notesWatchRoot = null
  notesWatcher?.close()
  notesWatcher = null
}

function isIgnoredWatchPath(relative: string): boolean {
  return relative
    .split(/[\\/]/)
    .some((part) => part.startsWith('.'))
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), target)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export function searchNotes(
  notesDir: string,
  query: string,
  limit = SEARCH_LIMIT
): NoteSearchResult[] {
  const term = query.trim().toLocaleLowerCase()
  if (term.length < SEARCH_MIN_LENGTH) return []

  const results: NoteSearchResult[] = []
  for (const note of listNotes(notesDir)) {
    const metadata = [note.title, note.courseName, note.summary, ...note.tags]
      .join(' ')
      .toLocaleLowerCase()
    if (metadata.includes(term)) {
      results.push({
        note,
        kind: 'note',
        excerpt: note.summary || note.title
      })
    } else {
      const entry = noteSearchEntry(notesDir, note)
      if (!entry) continue
      const body = entry.body.toLocaleLowerCase()
      const bodyIndex = body.indexOf(term)
      if (bodyIndex >= 0) {
        results.push({
          note,
          kind: 'note',
          excerpt: excerptAround(entry.body, bodyIndex)
        })
      } else {
        const segment = entry.transcript.find((item) =>
          item.text.toLocaleLowerCase().includes(term)
        )
        if (segment) {
          results.push({
            note,
            kind: 'transcript',
            excerpt: excerptAround(segment.text, segment.text.toLocaleLowerCase().indexOf(term)),
            timestamp: segment.start
          })
        }
      }
    }
    if (results.length >= Math.max(1, limit)) break
  }

  return results
}

function noteSearchEntry(
  notesDir: string,
  note: NoteMeta
): SearchTextEntry | null {
  try {
    const stat = fs.statSync(note.path)
    const cached = searchTextCache.get(note.path)
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached

    const raw = fs.readFileSync(note.path, 'utf8')
    const entry: SearchTextEntry = {
      mtimeMs: stat.mtimeMs,
      body: splitFrontmatter(raw).body,
      transcript: readNoteTranscript(notesDir, note.id, note.recordingId)
    }
    searchTextCache.set(note.path, entry)
    return entry
  } catch {
    return null
  }
}

function excerptAround(text: string, index: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  const start = Math.max(0, index - 70)
  const end = Math.min(clean.length, index + 130)
  return `${start > 0 ? '…' : ''}${clean.slice(start, end).trim()}${
    end < clean.length ? '…' : ''
  }`
}

function clearSearchCache(): void {
  searchTextCache.clear()
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

function findMarkdownFilesIn(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(
        (entry) =>
          !entry.name.startsWith('.') &&
          entry.isFile() &&
          entry.name.toLowerCase().endsWith('.md')
      )
      .map((entry) => path.join(dir, entry.name))
  } catch {
    return []
  }
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
  const userEdited =
    typeof attributes.editedAt === 'string' && attributes.editedAt.length > 0

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
    wordCount: body.split(/\s+/).filter(Boolean).length,
    userEdited
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

interface StoredNoteVersion extends NoteVersionMeta {
  markdown: string
  transcript: TranscriptSegment[]
}

const NOTE_HISTORY_LIMIT = 30

function noteHistoryDir(notesDir: string, noteId: string): string {
  return path.join(
    notesMetaDir(notesDir),
    'history',
    createHash('sha1').update(noteId).digest('hex')
  )
}

/**
 * Store the current note before a user edit or regeneration. History is capped
 * per note and kept outside the Markdown folder.
 */
export function snapshotNoteVersion(
  notesDir: string,
  noteId: string,
  reason: string
): NoteVersionMeta | null {
  const note = getNote(notesDir, noteId)
  if (!note) return null

  const versionId = `ver_${Date.now()}_${randomUUID().slice(0, 8)}`
  const version: StoredNoteVersion = {
    id: versionId,
    createdAt: new Date().toISOString(),
    reason,
    title: note.title,
    wordCount: note.wordCount,
    markdown: note.markdown,
    transcript: note.transcript
  }
  const dir = noteHistoryDir(notesDir, noteId)
  writeJson(path.join(dir, `${versionId}.json`), version)
  pruneNoteHistory(dir)
  return {
    id: version.id,
    createdAt: version.createdAt,
    reason: version.reason,
    title: version.title,
    wordCount: version.wordCount
  }
}

export function listNoteVersions(
  notesDir: string,
  noteId: string
): NoteVersionMeta[] {
  const dir = noteHistoryDir(notesDir, noteId)
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        try {
          const version = JSON.parse(
            fs.readFileSync(path.join(dir, name), 'utf8')
          ) as StoredNoteVersion
          return {
            id: version.id,
            createdAt: version.createdAt,
            reason: version.reason,
            title: version.title,
            wordCount: version.wordCount
          }
        } catch {
          return null
        }
      })
      .filter((version): version is NoteVersionMeta => Boolean(version))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
  } catch {
    return []
  }
}

export function restoreNoteVersion(
  notesDir: string,
  noteId: string,
  versionId: string
): NoteMeta {
  if (!/^ver_[A-Za-z0-9_-]+$/.test(versionId)) {
    throw new Error('Invalid note version.')
  }
  const current = getNote(notesDir, noteId)
  if (!current) throw new Error('Note not found.')

  const file = path.join(noteHistoryDir(notesDir, noteId), `${versionId}.json`)
  let version: StoredNoteVersion
  try {
    version = JSON.parse(fs.readFileSync(file, 'utf8')) as StoredNoteVersion
  } catch {
    throw new Error('That note version is no longer available.')
  }
  if (
    typeof version.markdown !== 'string' ||
    !Array.isArray(version.transcript)
  ) {
    throw new Error('That note version is no longer available.')
  }
  const transcript = normalizeTranscriptSegments(version.transcript)

  snapshotNoteVersion(notesDir, noteId, 'Before restore')
  const meta = updateNoteMarkdown(notesDir, noteId, version.markdown, {
    snapshot: false,
    markEdited: true
  })
  writeNoteTranscript(notesDir, noteId, transcript)
  return meta
}

function pruneNoteHistory(dir: string): void {
  try {
    const files = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .reverse()
    for (const file of files.slice(NOTE_HISTORY_LIMIT)) {
      fs.rmSync(path.join(dir, file), { force: true })
    }
  } catch {
    // History is best effort and must never block saving a note.
  }
}

function writeNoteDocument(
  file: string,
  attributes: Record<string, string | string[] | number | null>,
  markdown: string
): void {
  const headerLines = ['---']
  for (const [key, value] of Object.entries(attributes)) {
    headerLines.push(`${key}: ${JSON.stringify(value)}`)
  }
  headerLines.push('---', '')
  fs.writeFileSync(file, `${headerLines.join('\n')}${markdown}\n`, 'utf8')
}

function markNoteEdited(notesDir: string, id: string): NoteMeta {
  const index = ensureNotesCache(notesDir)
  const meta = index.find((note) => note.id === id)
  if (!meta) throw new Error('Note not found.')

  const raw = fs.readFileSync(meta.path, 'utf8')
  const { attributes, body } = splitFrontmatter(raw)
  attributes.editedAt = new Date().toISOString()
  writeNoteDocument(meta.path, attributes, body.trim())

  const next: NoteMeta = { ...meta, userEdited: true }
  commitNotes(
    notesDir,
    index.map((note) => (note.id === id ? next : note))
  )
  return next
}

export function normalizeTranscriptSegments(
  input: TranscriptSegment[]
): TranscriptSegment[] {
  if (!Array.isArray(input) || input.length > 20_000) {
    throw new Error('Invalid transcript.')
  }
  return input.map((segment, index) => {
    if (!segment || typeof segment !== 'object') {
      throw new Error('Invalid transcript segment.')
    }
    const start = Number(segment.start)
    const end = Number(segment.end)
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      throw new Error('Transcript timestamps are invalid.')
    }
    const safeStart = Math.max(0, start)
    const safeEnd = Math.max(safeStart, end)
    const id =
      typeof segment.id === 'string' && segment.id.trim()
        ? segment.id.trim().slice(0, 120)
        : `seg_${index}`
    const text =
      typeof segment.text === 'string' ? segment.text.slice(0, 20_000) : ''
    const speaker =
      typeof segment.speaker === 'string' && segment.speaker.trim()
        ? segment.speaker.trim().slice(0, 80)
        : undefined
    return {
      id,
      start: safeStart,
      end: safeEnd,
      text,
      ...(speaker ? { speaker } : {})
    }
  })
}

export function updateNoteTranscript(
  notesDir: string,
  id: string,
  segments: TranscriptSegment[]
): NoteMeta {
  const index = ensureNotesCache(notesDir)
  const meta = index.find((note) => note.id === id)
  if (!meta) throw new Error('Note not found.')

  snapshotNoteVersion(notesDir, id, 'Edit transcript')
  writeNoteTranscript(notesDir, id, normalizeTranscriptSegments(segments))
  return markNoteEdited(notesDir, id)
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
    wordCount,
    userEdited: false
  }

  const index = ensureNotesCache(input.notesDir)
  commitNotes(input.notesDir, [
    meta,
    ...index.filter((note) => note.id !== meta.id)
  ])
  return meta
}

export interface UpdateNoteOptions {
  snapshot?: boolean
  reason?: string
  markEdited?: boolean
}

export function updateNoteMarkdown(
  notesDir: string,
  id: string,
  markdown: string,
  options: UpdateNoteOptions = {}
): NoteMeta {
  const index = ensureNotesCache(notesDir)
  const meta = index.find((note) => note.id === id)
  if (!meta) throw new Error('Note not found.')

  if (options.snapshot !== false) {
    snapshotNoteVersion(notesDir, id, options.reason ?? 'Edit')
  }

  const raw = fs.readFileSync(meta.path, 'utf8')
  const { attributes } = splitFrontmatter(raw)
  const cleanMarkdown = markdown.trim()
  const nextTitle = extractTitle(cleanMarkdown, meta.title)
  attributes.title = nextTitle
  const markEdited = options.markEdited !== false
  if (markEdited) {
    attributes.editedAt = new Date().toISOString()
  } else {
    delete attributes.editedAt
  }
  writeNoteDocument(meta.path, attributes, cleanMarkdown)

  const next: NoteMeta = {
    ...meta,
    title: nextTitle,
    summary: extractSummary(cleanMarkdown),
    wordCount: cleanMarkdown.split(/\s+/).filter(Boolean).length,
    userEdited: markEdited
  }
  commitNotes(
    notesDir,
    index.map((note) => (note.id === id ? next : note))
  )
  return next
}

export function removeNoteAudio(notesDir: string, id: string): NoteMeta {
  const index = ensureNotesCache(notesDir)
  const meta = index.find((note) => note.id === id)
  if (!meta) throw new Error('Note not found.')

  if (meta.recordingId) {
    fs.rmSync(noteRecordingDir(meta.recordingId), { recursive: true, force: true })
  }
  const next: NoteMeta = { ...meta, hasAudio: false }
  commitNotes(
    notesDir,
    index.map((note) => (note.id === id ? next : note))
  )
  return next
}

export function deleteNote(notesDir: string, id: string, deleteAudio = true): void {
  const index = ensureNotesCache(notesDir)
  const meta = index.find((note) => note.id === id)
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
  fs.rmSync(noteHistoryDir(notesDir, id), { recursive: true, force: true })

  commitNotes(
    notesDir,
    index.filter((note) => note.id !== id)
  )
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
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) return { attributes: {}, body: normalized }
  const end = normalized.indexOf('\n---', 4)
  if (end === -1) return { attributes: {}, body: normalized }

  const header = normalized.slice(4, end)
  const body = normalized.slice(end + 4).replace(/^\r?\n/, '')
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
