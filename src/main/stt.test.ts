import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  analyzeSpeech,
  dedupeSegments,
  isLikelyHallucination,
  transcriptToText,
  transcribePcm,
  trimOverlap
} from './stt'

const SAMPLE_RATE = 16000

function pcmOf(
  seconds: number,
  fn: (sample: number) => number,
  sampleRate = SAMPLE_RATE
): Buffer {
  const count = Math.round(seconds * sampleRate)
  const buffer = Buffer.alloc(count * 2)
  for (let sample = 0; sample < count; sample++) {
    const value = Math.max(-1, Math.min(1, fn(sample)))
    buffer.writeInt16LE(Math.round(value * 32767), sample * 2)
  }
  return buffer
}

function silence(seconds: number): Buffer {
  return pcmOf(seconds, () => 0)
}

function tone(seconds: number, amplitude = 0.1, frequency = 220): Buffer {
  return pcmOf(
    seconds,
    (sample) => amplitude * Math.sin((2 * Math.PI * frequency * sample) / SAMPLE_RATE)
  )
}

describe('analyzeSpeech', () => {
  it('returns null for pure silence', () => {
    expect(analyzeSpeech(silence(2), SAMPLE_RATE)).toBeNull()
  })

  it('trims silence around speech and reports voiced time', () => {
    const data = Buffer.concat([silence(0.5), tone(2), silence(0.5)])
    const speech = analyzeSpeech(data, SAMPLE_RATE, 1_200)

    expect(speech).not.toBeNull()
    expect(speech!.startByte).toBeGreaterThan(0)
    expect(speech!.endByte).toBeLessThan(data.length)
    expect(speech!.voicedMs).toBeGreaterThanOrEqual(1_900)
    expect(speech!.recentVoicedMs).toBeGreaterThan(300)
  })

  it('rejects steady low-level noise', () => {
    const noise = pcmOf(3, (sample) => (sample % 2 ? 0.004 : -0.004))
    expect(analyzeSpeech(noise, SAMPLE_RATE)).toBeNull()
  })

  it('rejects a continuous non-speech tone', () => {
    expect(analyzeSpeech(tone(3), SAMPLE_RATE)).toBeNull()
  })

  it('keeps a short utterance inside a long quiet window', () => {
    const data = Buffer.concat([silence(20), tone(0.8), silence(20)])
    const speech = analyzeSpeech(data, SAMPLE_RATE)

    expect(speech).not.toBeNull()
    expect(speech!.voicedMs).toBeGreaterThanOrEqual(700)
  })
})

describe('isLikelyHallucination', () => {
  it('keeps normal lecture speech', () => {
    expect(
      isLikelyHallucination({
        text: 'A derivada mede a taxa de variação instantânea.',
        avg_logprob: -0.25,
        no_speech_prob: 0.04,
        compression_ratio: 1.4
      })
    ).toBe(false)
  })

  it('drops segments with a high no-speech probability', () => {
    expect(
      isLikelyHallucination({
        text: 'Bom dia a todos.',
        no_speech_prob: 0.92,
        avg_logprob: -0.2
      })
    ).toBe(true)
  })

  it('drops very low confidence text', () => {
    expect(
      isLikelyHallucination({
        text: 'palavra inventada aqui',
        avg_logprob: -1.4,
        no_speech_prob: 0.2
      })
    ).toBe(true)
  })

  it('drops repeated output', () => {
    expect(
      isLikelyHallucination({ text: 'muito muito muito', compression_ratio: 2.8 })
    ).toBe(true)
  })

  it('drops known Whisper outros even with good metadata', () => {
    expect(
      isLikelyHallucination({
        text: 'Obrigado por assistir.',
        avg_logprob: -0.1,
        no_speech_prob: 0.01,
        compression_ratio: 1.2
      })
    ).toBe(true)
  })

  it('keeps a real obrigado without bad metadata', () => {
    expect(isLikelyHallucination({ text: 'Obrigado.' })).toBe(false)
  })
})

describe('transcribePcm quality filtering', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('drops silent and low-confidence segments but keeps real speech', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              text: 'A derivada mede a taxa de variação. Obrigado por assistir. Texto inventado.',
              segments: [
                {
                  id: 0,
                  start: 0,
                  end: 4,
                  text: 'A derivada mede a taxa de variação.',
                  avg_logprob: -0.2,
                  no_speech_prob: 0.05,
                  compression_ratio: 1.4
                },
                {
                  id: 1,
                  start: 4,
                  end: 8,
                  text: 'Obrigado por assistir.',
                  avg_logprob: -0.1,
                  no_speech_prob: 0.02,
                  compression_ratio: 1.2
                },
                {
                  id: 2,
                  start: 8,
                  end: 12,
                  text: 'Texto inventado.',
                  avg_logprob: -1.5,
                  no_speech_prob: 0.3,
                  compression_ratio: 1.5
                }
              ]
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
      )
    )

    const segments = await transcribePcm(Buffer.alloc(SAMPLE_RATE * 2), {
      apiKey: 'test',
      model: 'whisper-large-v3',
      language: 'pt'
    })

    expect(segments.map((segment) => segment.text)).toEqual([
      'A derivada mede a taxa de variação.'
    ])
  })
})

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
