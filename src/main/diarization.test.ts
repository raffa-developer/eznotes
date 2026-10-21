import { describe, expect, it } from 'vitest'
import type { TranscriptSegment } from '../shared/types'
import { assignSpeakers, type DiarizationTurn } from './diarization'

function segment(
  id: string,
  start: number,
  end: number,
  text = 'texto'
): TranscriptSegment {
  return { id, start, end, text }
}

describe('assignSpeakers', () => {
  it('assigns the speaker with the largest overlap', () => {
    const turns: DiarizationTurn[] = [
      { start: 0, end: 4, speaker: 3 },
      { start: 4, end: 10, speaker: 7 }
    ]

    const [result] = assignSpeakers([segment('a', 0, 6)], turns)

    expect(result.speaker).toBe('Speaker 1')
  })

  it('numbers labels by first appearance in the transcript', () => {
    const turns: DiarizationTurn[] = [
      { start: 0, end: 2, speaker: 9 },
      { start: 2, end: 4, speaker: 4 }
    ]

    const result = assignSpeakers(
      [segment('a', 0, 2), segment('b', 2, 4)],
      turns
    )

    expect(result[0].speaker).toBe('Speaker 1')
    expect(result[1].speaker).toBe('Speaker 2')
  })

  it('leaves segments without any overlap unchanged', () => {
    const [result] = assignSpeakers(
      [segment('a', 10, 12)],
      [{ start: 0, end: 2, speaker: 1 }]
    )

    expect(result.speaker).toBeUndefined()
  })

  it('returns the same segments when there are no turns', () => {
    const segments = [segment('a', 0, 2)]

    expect(assignSpeakers(segments, [])).toBe(segments)
  })

  it('keeps the other segment fields intact', () => {
    const [result] = assignSpeakers(
      [segment('a', 1.5, 6.25, 'Olá')],
      [{ start: 0, end: 8, speaker: 2 }]
    )

    expect(result).toMatchObject({
      id: 'a',
      start: 1.5,
      end: 6.25,
      text: 'Olá'
    })
  })
})
