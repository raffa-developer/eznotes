import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  deleteNote,
  getNote,
  listNoteVersions,
  normalizeTranscriptSegments,
  rescanNotes,
  restoreNoteVersion,
  saveNote,
  updateNoteMarkdown,
  updateNoteTranscript,
  writeNoteTranscript
} from './notes'

const roots: string[] = []

function tempNotesDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eznotes-history-'))
  roots.push(dir)
  return dir
}

function createNote(root: string, id = 'note_history'): void {
  saveNote({
    id,
    title: 'História',
    courseId: null,
    courseName: 'Redes',
    date: '2026-11-19T10:00:00.000Z',
    durationSec: 3600,
    recordingId: null,
    language: 'pt',
    tags: [],
    markdown: '# História\n\nVersão original.',
    notesDir: root
  })
  writeNoteTranscript(root, id, [
    {
      id: 'seg_1',
      start: 10,
      end: 20,
      text: 'Texto original.',
      speaker: 'Speaker 1'
    }
  ])
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('note history', () => {
  it('stores versions before edits and restores a prior version', () => {
    const root = tempNotesDir()
    createNote(root)

    const edited = updateNoteMarkdown(
      root,
      'note_history',
      '# História\n\nVersão editada.'
    )
    expect(edited.userEdited).toBe(true)
    expect(getNote(root, 'note_history')?.markdown).toContain('editada')

    const versions = listNoteVersions(root, 'note_history')
    expect(versions).toHaveLength(1)
    expect(versions[0].reason).toBe('Edit')
    expect(getNote(root, 'note_history')?.userEdited).toBe(true)

    restoreNoteVersion(root, 'note_history', versions[0].id)
    const restored = getNote(root, 'note_history')
    expect(restored?.markdown).toContain('Versão original.')
    expect(restored?.transcript[0].text).toBe('Texto original.')
    expect(listNoteVersions(root, 'note_history').length).toBeGreaterThan(1)
  })

  it('persists edits and history across an index rebuild', () => {
    const root = tempNotesDir()
    createNote(root)
    updateNoteTranscript(root, 'note_history', [
      {
        id: 'seg_1',
        start: 10,
        end: 20,
        text: 'Texto corrigido.',
        speaker: 'Professor'
      }
    ])

    rescanNotes(root)
    const reloaded = getNote(root, 'note_history')
    expect(reloaded?.transcript[0]).toMatchObject({
      text: 'Texto corrigido.',
      speaker: 'Professor',
      start: 10,
      end: 20
    })
    expect(reloaded?.userEdited).toBe(true)
    expect(listNoteVersions(root, 'note_history')[0].reason).toBe(
      'Edit transcript'
    )
  })

  it('removes history when a note is deleted', () => {
    const root = tempNotesDir()
    createNote(root)
    updateNoteMarkdown(root, 'note_history', '# História\n\nEditada.')
    expect(listNoteVersions(root, 'note_history')).toHaveLength(1)

    deleteNote(root, 'note_history')
    expect(listNoteVersions(root, 'note_history')).toEqual([])
  })
})

describe('normalizeTranscriptSegments', () => {
  it('preserves timestamps and speaker edits', () => {
    const segments = normalizeTranscriptSegments([
      {
        id: 'seg_1',
        start: 12.5,
        end: 18,
        text: 'Texto revisto.',
        speaker: '  Docente  '
      }
    ])
    expect(segments[0]).toEqual({
      id: 'seg_1',
      start: 12.5,
      end: 18,
      text: 'Texto revisto.',
      speaker: 'Docente'
    })
  })

  it('clamps negative timestamps and generates missing ids', () => {
    const segments = normalizeTranscriptSegments([
      { id: '', start: -5, end: -1, text: 'Olá' }
    ])
    expect(segments[0]).toMatchObject({
      id: 'seg_0',
      start: 0,
      end: 0,
      text: 'Olá'
    })
  })

  it('rejects malformed payloads', () => {
    expect(() =>
      normalizeTranscriptSegments([
        { start: Number.NaN, end: 1, text: '' } as never
      ])
    ).toThrow('timestamps')
    expect(() => normalizeTranscriptSegments(null as never)).toThrow(
      'Invalid transcript'
    )
  })
})
