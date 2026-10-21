import { describe, expect, it } from 'vitest'
import { detectCues, extractSummary, extractTitle } from './llm'

describe('detectCues', () => {
  it('finds exam, definition, and example cues with timestamps', () => {
    const cues = detectCues([
      { id: '1', start: 0, end: 3, text: 'Bom dia, vamos começar.' },
      { id: '2', start: 3, end: 8, text: 'Isto vai sair no exame.' },
      {
        id: '3',
        start: 8,
        end: 12,
        text: 'A definição de derivada é um limite.'
      },
      { id: '4', start: 12, end: 16, text: 'Por exemplo, x ao quadrado.' }
    ])

    expect(cues.map((cue) => cue.start)).toEqual([3, 8, 12])
  })

  it('ignores filler speech', () => {
    expect(
      detectCues([
        { id: '1', start: 0, end: 3, text: 'Bom dia a todos, vamos começar.' }
      ])
    ).toEqual([])
  })

  it('caps the cue list at 80 entries', () => {
    const segments = Array.from({ length: 100 }, (_, index) => ({
      id: String(index),
      start: index,
      end: index + 1,
      text: 'Atenção, isto é importante para o exame.'
    }))

    expect(detectCues(segments)).toHaveLength(80)
  })
})

describe('extractTitle', () => {
  it('uses the first heading', () => {
    expect(extractTitle('# Derivadas\n\nTexto', 'fallback')).toBe('Derivadas')
  })

  it('falls back and strips markdown decoration', () => {
    expect(extractTitle('sem título', '**Fallback**')).toBe('Fallback')
  })
})

describe('extractSummary', () => {
  it('joins the first three bullets of the Resumo section', () => {
    const markdown = `# Aula

## Resumo
- Um
- Dois
- Três
- Quatro

## Glossário
| Termo | Significado |
`

    expect(extractSummary(markdown)).toBe('Um · Dois · Três')
  })
})
