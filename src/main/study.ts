import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import type {
  NoteMeta,
  StudyCard,
  StudyConfidence,
  StudySet,
  StudySource
} from '../shared/types'
import { readJson, writeJson } from './store'
import { noteMetadataDir } from './notes'

export interface GeneratedStudyCard {
  question: string
  answer: string
  heading?: string
  timestamp?: number
  excerpt?: string
}

const STUDY_LIMIT = 30

function studyFilePath(notesDir: string, noteId: string): string {
  const name = createHash('sha1').update(noteId).digest('hex')
  return path.join(noteMetadataDir(notesDir), 'study', `${name}.json`)
}

export function loadStudySet(
  notesDir: string,
  noteId: string
): StudySet | null {
  const stored = readJson<StudySet | null>(studyFilePath(notesDir, noteId), null)
  if (
    !stored ||
    stored.noteId !== noteId ||
    !Array.isArray(stored.cards) ||
    !stored.cards.length
  ) {
    return null
  }
  return stored
}

export function createStudySet(
  notesDir: string,
  note: NoteMeta,
  cards: GeneratedStudyCard[]
): StudySet {
  const clean = cards
    .filter(
      (card) =>
        typeof card.question === 'string' &&
        typeof card.answer === 'string' &&
        card.question.trim() &&
        card.answer.trim()
    )
    .slice(0, STUDY_LIMIT)
    .map((card, index): StudyCard => {
      const source: StudySource = {}
      const heading = card.heading?.trim().slice(0, 160)
      const excerpt = card.excerpt?.trim().slice(0, 240)
      if (heading) source.heading = heading
      if (excerpt) source.excerpt = excerpt
      if (Number.isFinite(card.timestamp) && Number(card.timestamp) >= 0) {
        source.timestamp = Math.round(Number(card.timestamp))
      }
      return {
        id: `card_${Date.now()}_${index}_${randomUUID().slice(0, 6)}`,
        question: card.question.trim().slice(0, 2_000),
        answer: card.answer.trim().slice(0, 4_000),
        source,
        confidence: 0,
        attempts: 0,
        lastReviewedAt: null
      }
    })

  if (!clean.length) throw new Error('The study model returned no usable cards.')

  const set: StudySet = {
    noteId: note.id,
    noteTitle: note.title,
    courseName: note.courseName,
    generatedAt: new Date().toISOString(),
    cards: clean
  }
  saveStudySet(notesDir, set)
  return set
}

export function saveStudySet(notesDir: string, set: StudySet): void {
  writeJson(studyFilePath(notesDir, set.noteId), set)
}

export function rateStudyCard(
  notesDir: string,
  noteId: string,
  cardId: string,
  confidence: StudyConfidence
): StudySet {
  if (![1, 2, 3].includes(confidence)) {
    throw new Error('Invalid confidence rating.')
  }
  const set = loadStudySet(notesDir, noteId)
  if (!set) throw new Error('Generate a study set for this note first.')

  const card = set.cards.find((item) => item.id === cardId)
  if (!card) throw new Error('Study card not found.')
  card.confidence = confidence
  card.attempts += 1
  card.lastReviewedAt = new Date().toISOString()
  saveStudySet(notesDir, set)
  return set
}

export function studyMarkdown(set: StudySet): string {
  const labels: Record<StudyConfidence, string> = {
    0: 'Por rever',
    1: 'Precisa de revisão',
    2: 'Quase',
    3: 'Seguro'
  }
  const lines = [
    `# Conjunto de estudo — ${set.noteTitle}`,
    '',
    `**Disciplina:** ${set.courseName}`,
    `**Gerado em:** ${new Date(set.generatedAt).toLocaleString('pt-PT')}`,
    ''
  ]

  set.cards.forEach((card, index) => {
    lines.push(`## ${index + 1}. ${card.question}`, '', card.answer, '')
    const source = sourceLabel(card.source)
    if (source) lines.push(`**Fonte:** ${source}`)
    lines.push(
      `**Confiança:** ${labels[card.confidence]}`,
      `**Tentativas:** ${card.attempts}`,
      ''
    )
  })

  return lines.join('\n')
}

function sourceLabel(source: StudySource): string {
  const parts: string[] = []
  if (source.heading) parts.push(source.heading)
  if (source.timestamp !== undefined) {
    const minutes = Math.floor(source.timestamp / 60)
    const seconds = Math.floor(source.timestamp % 60)
    parts.push(
      `transcrição ${minutes}:${String(seconds).padStart(2, '0')}`
    )
  }
  if (source.excerpt) parts.push(source.excerpt)
  return parts.join(' — ')
}
