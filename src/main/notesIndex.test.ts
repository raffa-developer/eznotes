import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  listNotes,
  refreshNotesFromPaths,
  rescanNotes,
  searchNotes,
  startNotesWatcher,
  stopNotesWatcher,
  writeNoteTranscript
} from './notes'

const roots: string[] = []

function tempNotesDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eznotes-index-'))
  roots.push(dir)
  return dir
}

function writeNote(
  root: string,
  relative: string,
  title: string,
  body: string,
  id = `note_${title.replace(/[^a-z0-9]+/gi, '_')}`
): string {
  const file = path.join(root, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    [
      '---',
      `id: ${JSON.stringify(id)}`,
      `title: ${JSON.stringify(title)}`,
      'course: "Redes"',
      'courseId: null',
      'date: "2026-11-10T10:00:00.000Z"',
      'duration: 3600',
      'recordingId: null',
      'language: "pt"',
      'tags: []',
      '---',
      `# ${title}`,
      '',
      body,
      ''
    ].join('\n'),
    'utf8'
  )
  return file
}

afterEach(() => {
  stopNotesWatcher()
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('notes index', () => {
  it('finds external additions, edits, renames, and deletions', () => {
    const root = tempNotesDir()
    const original = writeNote(root, 'Redes/Aula 1.md', 'Aula 1', 'Primeira aula.')
    expect(listNotes(root)).toHaveLength(1)

    const added = writeNote(root, 'Redes/Aula 2.md', 'Aula 2', 'Segunda aula.')
    refreshNotesFromPaths(root, ['Redes/Aula 2.md'])
    expect(listNotes(root)).toHaveLength(2)
    expect(listNotes(root).map((note) => note.title)).toEqual(
      expect.arrayContaining(['Aula 1', 'Aula 2'])
    )

    fs.writeFileSync(
      original,
      fs.readFileSync(original, 'utf8').replace('# Aula 1', '# Aula revista'),
      'utf8'
    )
    refreshNotesFromPaths(root, ['Redes/Aula 1.md'])
    expect(listNotes(root).find((note) => note.path === original)?.title).toBe(
      'Aula revista'
    )

    const renamed = path.join(root, 'Redes', 'Aula renomeada.md')
    fs.renameSync(added, renamed)
    refreshNotesFromPaths(root, ['Redes/Aula renomeada.md'])
    expect(listNotes(root).map((note) => note.path)).toContain(renamed)
    expect(listNotes(root).map((note) => note.path)).not.toContain(added)

    fs.rmSync(original)
    refreshNotesFromPaths(root, ['Redes/Aula 1.md'])
    expect(listNotes(root).map((note) => note.path)).not.toContain(original)
  })

  it('rescans nested additions explicitly', () => {
    const root = tempNotesDir()
    writeNote(root, 'Redes/Aula 1.md', 'Aula 1', 'Primeira aula.')
    expect(listNotes(root)).toHaveLength(1)

    writeNote(root, 'Novo curso/Aula extra.md', 'Aula extra', 'Conteúdo novo.')
    expect(rescanNotes(root)).toHaveLength(2)
    expect(listNotes(root).map((note) => note.title)).toContain('Aula extra')
  })

  it('persists the rebuilt index', () => {
    const root = tempNotesDir()
    writeNote(root, 'Redes/Aula 1.md', 'Aula 1', 'Primeira aula.')
    listNotes(root)

    const index = JSON.parse(
      fs.readFileSync(path.join(root, '.eznotes', 'index.json'), 'utf8')
    ) as { notes: Array<{ title: string }> }
    expect(index.notes.map((note) => note.title)).toEqual(['Aula 1'])
  })

  it('applies external file changes from the watcher', async () => {
    const root = tempNotesDir()
    listNotes(root)
    const changed = vi.fn()
    startNotesWatcher(root, changed)

    writeNote(root, 'Redes/Aula externa.md', 'Aula externa', 'Veio de fora.')

    await vi.waitFor(
      () => {
        expect(changed).toHaveBeenCalled()
        expect(listNotes(root).map((note) => note.title)).toContain(
          'Aula externa'
        )
      },
      { timeout: 4_000, interval: 100 }
    )
  })
})

describe('note search', () => {
  it('searches titles, note bodies, and transcripts', () => {
    const root = tempNotesDir()
    writeNote(
      root,
      'Redes/Aula 1.md',
      'Comutação',
      'A comutação de pacotes encaminha dados entre redes.',
      'note_comutasao'
    )
    const id = 'note_comutasao'
    writeNoteTranscript(root, id, [
      { id: 's1', start: 75, end: 90, text: 'Agora falámos de endereçamento IP.' }
    ])
    listNotes(root)
    expect(searchNotes(root, 'comutação')[0]?.kind).toBe('note')
    expect(searchNotes(root, 'encaminha')[0]?.excerpt).toContain('encaminha')
    expect(searchNotes(root, 'endereçamento')[0]).toMatchObject({
      kind: 'transcript',
      timestamp: 75
    })
    expect(searchNotes(root, 'x')).toEqual([])
    expect(searchNotes(root, 'inexistente')).toEqual([])
  })

  it('invalidates cached text when a note changes', () => {
    const root = tempNotesDir()
    writeNote(root, 'Redes/Aula 1.md', 'Aula 1', 'Conteúdo antigo.')
    listNotes(root)

    expect(searchNotes(root, 'antigo')).toHaveLength(1)
    fs.writeFileSync(
      path.join(root, 'Redes', 'Aula 1.md'),
      fs
        .readFileSync(path.join(root, 'Redes', 'Aula 1.md'), 'utf8')
        .replace('Conteúdo antigo.', 'Conteúdo atualizado.'),
      'utf8'
    )
    refreshNotesFromPaths(root, ['Redes/Aula 1.md'])

    expect(searchNotes(root, 'antigo')).toHaveLength(0)
    expect(searchNotes(root, 'atualizado')).toHaveLength(1)
  })
})
