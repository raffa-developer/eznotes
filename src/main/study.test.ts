import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { deleteNote, saveNote } from './notes'
import {
  createStudySet,
  loadStudySet,
  rateStudyCard,
  studyMarkdown
} from './study'

const roots: string[] = []

function tempNotesDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eznotes-study-'))
  roots.push(dir)
  return dir
}

function noteIn(root: string) {
  return saveNote({
    id: 'note_study',
    title: 'Redes e protocolos',
    courseId: null,
    courseName: 'Redes',
    date: '2026-11-19T10:00:00.000Z',
    durationSec: 3600,
    recordingId: null,
    language: 'pt',
    tags: [],
    markdown: '# Redes\n\n## Protocolos\n\nTCP e UDP.',
    notesDir: root
  })
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('study sets', () => {
  it('creates, persists, and rates source-linked cards', () => {
    const root = tempNotesDir()
    const note = noteIn(root)
    const set = createStudySet(root, note, [
      {
        question: 'Qual é a diferença entre TCP e UDP?',
        answer: 'TCP é orientado à ligação; UDP não é.',
        heading: 'Protocolos',
        timestamp: 125,
        excerpt: 'TCP e UDP'
      }
    ])

    expect(set.cards).toHaveLength(1)
    expect(set.cards[0]).toMatchObject({
      confidence: 0,
      attempts: 0,
      lastReviewedAt: null,
      source: {
        heading: 'Protocolos',
        timestamp: 125,
        excerpt: 'TCP e UDP'
      }
    })

    const loaded = loadStudySet(root, note.id)
    expect(loaded?.cards[0].question).toContain('TCP')
    expect(loaded?.cards[0].source.timestamp).toBe(125)

    const rated = rateStudyCard(root, note.id, set.cards[0].id, 2)
    expect(rated.cards[0].confidence).toBe(2)
    expect(rated.cards[0].attempts).toBe(1)
    expect(rated.cards[0].lastReviewedAt).toBeTruthy()
    expect(loadStudySet(root, note.id)?.cards[0].confidence).toBe(2)
  })

  it('exports cards and source references as Markdown', () => {
    const root = tempNotesDir()
    const note = noteIn(root)
    const set = createStudySet(root, note, [
      {
        question: 'O que é TCP?',
        answer: 'Um protocolo orientado à ligação.',
        heading: 'Protocolos',
        timestamp: 65
      }
    ])
    const markdown = studyMarkdown(set)
    expect(markdown).toContain('# Conjunto de estudo — Redes')
    expect(markdown).toContain('## 1. O que é TCP?')
    expect(markdown).toContain('**Fonte:** Protocolos')
    expect(markdown).toContain('transcrição 1:05')
    expect(markdown).toContain('**Confiança:** Por rever')
  })

  it('rejects invalid ratings and removes study data with the note', () => {
    const root = tempNotesDir()
    const note = noteIn(root)
    createStudySet(root, note, [
      { question: 'Pergunta?', answer: 'Resposta.' }
    ])

    expect(() =>
      rateStudyCard(root, note.id, 'missing', 2)
    ).toThrow('Study card not found')
    expect(() =>
      rateStudyCard(root, note.id, 'missing', 0 as never)
    ).toThrow('Invalid confidence')

    deleteNote(root, note.id)
    expect(loadStudySet(root, note.id)).toBeNull()
  })
})
