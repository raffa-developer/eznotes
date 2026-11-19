import { describe, expect, it } from 'vitest'
import { parseStudyCards } from './llm'

describe('parseStudyCards', () => {
  it('parses fenced JSON and matches an existing heading', () => {
    const cards = parseStudyCards(
      '```json\n[{"question":"O que é TCP?","answer":"Orientado à ligação.","heading":"protocolos","timestamp":90,"excerpt":"TCP"}]\n```',
      ['Protocolos', 'Endereçamento']
    )
    expect(cards).toEqual([
      {
        question: 'O que é TCP?',
        answer: 'Orientado à ligação.',
        heading: 'Protocolos',
        timestamp: 90,
        excerpt: 'TCP'
      }
    ])
  })

  it('skips malformed cards', () => {
    const cards = parseStudyCards(
      JSON.stringify([
        { question: '', answer: 'x' },
        { question: 'Válida?', answer: 'Sim.' }
      ])
    )
    expect(cards).toHaveLength(1)
    expect(cards[0].question).toBe('Válida?')
  })

  it('rejects replies without a JSON card list', () => {
    expect(() => parseStudyCards('No cards today.')).toThrow('JSON')
    expect(() => parseStudyCards('[]')).toThrow('no usable cards')
  })
})
