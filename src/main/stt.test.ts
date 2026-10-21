import { describe, expect, it } from 'vitest'
import { dedupeSegments, transcriptToText, trimOverlap } from './stt'

describe('trimOverlap', () => {
  it('removes a duplicated three-word tail', () => {
    expect(
      trimOverlap(
        'A derivada mede a taxa de variação',
        'taxa de variação instantânea'
      )
    ).toBe('instantânea')
  })

  it('matches across case and accents', () => {
    expect(
      trimOverlap('A definição de derivada', 'Definição de derivada é o limite')
    ).toBe('é o limite')
  })

  it('keeps overlaps shorter than three words', () => {
    expect(trimOverlap('a taxa', 'taxa de variação')).toBe('taxa de variação')
  })

  it('returns an empty string when the next text is already contained', () => {
    expect(trimOverlap('Isto é importante para o exame', 'para o exame')).toBe('')
  })

  it('returns the trimmed next text when there is no previous text', () => {
    expect(trimOverlap('', '  Olá mundo  ')).toBe('Olá mundo')
  })
})

describe('dedupeSegments', () => {
  it('drops duplicated words between consecutive segments', () => {
    const segments = dedupeSegments([
      { id: 'a', start: 0, end: 2, text: 'A derivada mede a taxa' },
      {
        id: 'b',
        start: 2,
        end: 4,
        text: 'mede a taxa de variação instantânea'
      }
    ])

    expect(segments).toHaveLength(2)
    expect(segments[1].text).toBe('de variação instantânea')
  })

  it('drops segments that repeat the previous text entirely', () => {
    const segments = dedupeSegments([
      { id: 'a', start: 0, end: 2, text: 'Isto é importante para o exame' },
      { id: 'b', start: 2, end: 4, text: 'para o exame' }
    ])

    expect(segments).toHaveLength(1)
    expect(segments[0].id).toBe('a')
  })

  it('keeps the timestamps of the segment it keeps', () => {
    const [segment] = dedupeSegments([
      { id: 'a', start: 5, end: 9, text: 'Texto único.' }
    ])

    expect(segment).toMatchObject({ id: 'a', start: 5, end: 9 })
  })

  it('skips empty segments', () => {
    expect(
      dedupeSegments([{ id: 'a', start: 0, end: 1, text: '   ' }])
    ).toHaveLength(0)
  })
})

describe('transcriptToText', () => {
  it('prefixes timestamps and speaker labels', () => {
    expect(
      transcriptToText([
        { id: 'a', start: 0, end: 2, text: 'Bom dia.' },
        { id: 'b', start: 65, end: 70, text: 'Pergunta?', speaker: 'Speaker 2' }
      ])
    ).toBe('[0:00] Bom dia.\n[1:05] Speaker 2: Pergunta?')
  })
})
