import type { NotePromptInput } from './llm'
import type { TranscriptSegment } from '../shared/types'

export const demoMode =
  (process.env.EZNOTES_MOCK_AI ?? process.env.AULA_MOCK_AI) === '1'

const LIVE_LINES = [
  'Bom dia. Hoje vamos começar com a definição de derivada.',
  'A derivada mede a taxa de variação instantânea de uma função num ponto.',
  'Atenção, isto é importante para o exame: a regra da cadeia aparece sempre.',
  'Por exemplo, se f de x é igual a x ao quadrado, então a derivada é dois x.',
  'Não se esqueçam da regra do produto e da regra do quociente.',
  'Na próxima aula vamos aplicar isto a problemas de otimização.'
]

export function mockLiveTranscript(): string {
  return LIVE_LINES[Math.floor(Date.now() / 5000) % LIVE_LINES.length]
}

export function mockFileTranscript(durationSec: number): TranscriptSegment[] {
  const count = 8
  const step = Math.max(20, durationSec / count)
  return Array.from({ length: count }, (_, index) => {
    const start = Math.round(index * step)
    const end = Math.round(Math.min(durationSec, (index + 1) * step))
    return {
      id: `mock_${index}`,
      start,
      end,
      text: LIVE_LINES[index % LIVE_LINES.length]
    }
  })
}

export const MOCK_OUTLINE = [
  'Definição de derivada',
  'Interpretação geométrica',
  'Regras de derivação',
  'Regra da cadeia (importante para o exame)',
  'Exemplos e aplicações'
]

export function mockNote(input: NotePromptInput): string {
  const date = input.date
  const duration = Math.round(input.durationSec / 60)
  const durationLabel = duration === 1 ? '1 minuto' : `${duration} minutos`
  return `# ${input.courseName} — Derivadas e regras de derivação

**Disciplina:** ${input.courseName}
**Data:** ${date}
**Duração:** ${durationLabel}
**Tópicos:** derivada, taxa de variação, regras de derivação, regra da cadeia, otimização

## Resumo
- A derivada mede a taxa de variação instantânea de uma função num ponto.
- A interpretação geométrica é o declive da reta tangente ao gráfico nesse ponto.
- As regras de derivação permitem calcular derivadas sem recorrer sempre à definição.
- A regra da cadeia foi sinalizada como presença garantida no exame.

## Conceitos-chave

### Derivada
- **Definição:** limite da taxa média de variação quando o intervalo tende para zero.
- **Porquê é importante:** descreve como uma grandeza muda em cada instante.
- **Exemplo:** se $f(x) = x^2$, então $f'(x) = 2x$.

### Regra da cadeia
- **Definição:** regra para derivar funções compostas, multiplicando a derivada da função exterior pela derivada da função interior.
- **Porquê é importante:** aparece em quase todos os problemas de otimização e em funções com expressões dentro de outras.
- **Exemplo:** derivar $\\sin(x^2)$ exige a regra da cadeia.

## Apontamentos

### Definição e interpretação
[0:00] A derivada de uma função num ponto é o limite da taxa média de variação quando o intervalo tende para zero. Geometricamente, corresponde ao declive da reta tangente.

### Regras de derivação
[1:20] Foram recordadas a regra da soma, a regra do produto e a regra do quociente. A regra da cadeia aplica-se a funções compostas.

> **Importante:** o professor disse explicitamente que a regra da cadeia sai no exame.

### Exemplo
[2:40] Para $f(x) = x^2$, a derivada é $f'(x) = 2x$. O exemplo serve para ligar a definição formal ao cálculo rápido.

## Exemplos e aplicações
- Derivar $x^2$ pela definição e confirmar o resultado $2x$.
- Usar a regra da cadeia para derivar funções compostas.
- Aplicar as regras a problemas de otimização na próxima aula.

## Para o exame
- Saber enunciar a definição de derivada.
- Aplicar corretamente a regra da cadeia.
- Distinguir a regra do produto da regra do quociente.
> **Importante:** a regra da cadeia foi indicada como presença garantida.

## Dúvidas a esclarecer
- Rever a demonstração da regra do produto.
- Confirmar se a regra do quociente exige alguma condição adicional.

## Glossário
| Termo | Significado |
| --- | --- |
| Derivada | Taxa de variação instantânea de uma função. |
| Reta tangente | Reta que toca o gráfico num ponto com o mesmo declive da curva. |
| Regra da cadeia | Regra para derivar funções compostas. |
| Otimização | Procura de máximos e mínimos de uma função. |
`
}
