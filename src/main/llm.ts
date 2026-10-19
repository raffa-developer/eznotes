import type { LlmMessage, TestResult, TranscriptSegment } from '../shared/types'
import { formatTimestamp, transcriptToText } from './stt'
import { demoMode, MOCK_OUTLINE, mockNote } from './mock'

export interface LlmOptions {
  apiKey: string
  baseURL: string
  model: string
  sessionId?: string
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
}

interface ChatResponse {
  choices?: Array<{
    message?: { content?: string | Array<{ type?: string; text?: string }> }
    text?: string
  }>
  error?: { message?: string }
}

export async function chat(
  messages: LlmMessage[],
  options: LlmOptions
): Promise<string> {
  const baseURL = options.baseURL.replace(/\/+$/, '')
  const endpoint = `${baseURL}/chat/completions`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 180_000)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Aula/0.1',
        ...(options.sessionId ? { 'x-opencode-session': options.sessionId } : {})
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 6000,
        stream: false
      }),
      signal: controller.signal
    })

    const raw = await response.text()
    if (!response.ok) {
      throw new Error(
        `Notes model failed (${response.status}): ${extractError(raw) || response.statusText}`
      )
    }

    const data = JSON.parse(raw) as ChatResponse
    const content = data.choices?.[0]?.message?.content
    if (typeof content === 'string') return content.trim()
    if (Array.isArray(content)) {
      return content
        .map((part) => part.text ?? '')
        .join('')
        .trim()
    }
    const legacy = data.choices?.[0]?.text
    if (typeof legacy === 'string') return legacy.trim()
    throw new Error('The notes model returned an empty response.')
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The notes model timed out. Try again or use a faster model.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function testLlm(options: LlmOptions): Promise<TestResult> {
  if (demoMode) {
    return { ok: true, message: 'Demo mode: the notes model is simulated.' }
  }
  try {
    const reply = await chat(
      [
        {
          role: 'system',
          content: 'You are a connection test. Reply with exactly: OK'
        },
        { role: 'user', content: 'Reply with exactly: OK' }
      ],
      { ...options, maxTokens: 20, temperature: 0, timeoutMs: 45_000 }
    )
    return {
      ok: true,
      message: reply
        ? `Connected to ${options.model}.`
        : 'Connected, but the model returned an empty reply.'
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

export interface NotePromptInput {
  courseName: string
  lecturer?: string
  date: string
  durationSec: number
  glossary: string[]
  segments: TranscriptSegment[]
}

export async function generateNotes(
  input: NotePromptInput,
  options: LlmOptions
): Promise<string> {
  if (demoMode) {
    await new Promise((resolve) => setTimeout(resolve, 700))
    return mockNote(input)
  }

  const transcript = transcriptToText(input.segments)
  const cues = detectCues(input.segments)
  const glossary = input.glossary.length
    ? input.glossary.join(', ')
    : 'Sem glossário fornecido.'
  const cuesText = cues.length
    ? cues.map((cue) => `[${formatTimestamp(cue.start)}] ${cue.text}`).join('\n')
    : 'Nenhum sinal explícito detetado.'

  const messages: LlmMessage[] = [
    { role: 'system', content: NOTES_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Disciplina: ${input.courseName}
Professor: ${input.lecturer || 'Não indicado'}
Data: ${input.date}
Duração: ${Math.round(input.durationSec / 60)} minutos
Glossário da disciplina: ${glossary}

Sinais de importância detetados na transcrição (podem ajudar, mas não são obrigatórios):
${cuesText}

Transcrição com timestamps:
${transcript}

Produz os apontamentos em Markdown, seguindo exatamente a estrutura pedida.`
    }
  ]

  return chat(messages, { ...options, maxTokens: 7000, temperature: 0.15 })
}

export async function generateOutline(
  previousBullets: string[],
  recentTranscript: string,
  options: LlmOptions
): Promise<string[]> {
  if (demoMode) {
    return MOCK_OUTLINE
  }

  const previous = previousBullets.length
    ? previousBullets.map((bullet) => `- ${bullet}`).join('\n')
    : '(vazio)'

  const reply = await chat(
    [
      {
        role: 'system',
        content: `Atualiza o esboço de uma aula em curso. Escreve em português europeu.
Regras:
- Devolve no máximo 6 linhas.
- Cada linha começa por "- " e tem um tópico curto (3 a 10 palavras).
- Podes adicionar um detalhe entre parênteses.
- Mantém os tópicos anteriores que continuam válidos.
- Não inventes conteúdo que não esteja na transcrição.
- Não uses títulos, numeração, introdução ou conclusão.
- Se a transcrição não tiver conteúdo académico suficiente, devolve o esboço anterior.`
      },
      {
        role: 'user',
        content: `Esboço atual:
${previous}

Transcrição recente:
${recentTranscript.slice(-5000)}`
      }
    ],
    { ...options, maxTokens: 220, temperature: 0.1, timeoutMs: 45_000 }
  )

  return reply
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
    .filter((line) => line.length > 0 && line.length < 140)
    .slice(0, 6)
}

const NOTES_SYSTEM_PROMPT = `És um assistente de estudo que transforma a transcrição de uma aula em apontamentos estruturados em português europeu (pt-PT). O objetivo é produzir material útil para estudar e para exames, não uma ata da aula.

Regras de conteúdo:
- Escreve em português europeu natural e correto. Não uses português do Brasil.
- Não inventes factos, números, fórmulas, datas, nomes ou citações. Se algo estiver ambíguo ou inaudível, escreve "Por esclarecer: ...".
- Ignora conversa social, piadas, avisos administrativos, mudanças de sala, pausas e logística. Mantém apenas conteúdo académico.
- Preserva definições, fórmulas, datas, nomes, exemplos, passos de processos e relações causa-efeito.
- Quando o professor sinalizar importância ("isto vai sair no exame", "atenção", "não se esqueçam", repetição ou ênfase clara), marca com uma citação "> **Importante:** ..." e inclui o ponto em "Para o exame".
- Agrupa por tópicos, não por ordem cronológica cega. Reorganiza para clareza, mas não acrescentes informação.
- Usa os timestamps [m:ss] da transcrição para ligar cada secção à aula.
- Corrige hesitações e erros óbvios de transcrição. Corrige nomes próprios apenas quando tiveres certeza.
- Se a transcrição tiver partes irrelevantes, omite-as sem as comentar.
- Não escrevas metacomentários sobre a transcrição nem sobre o teu processo.

Estrutura obrigatória (Markdown):
# <título curto, específico e útil>
**Disciplina:** ...
**Data:** ...
**Duração:** ...
**Tópicos:** ...

## Resumo
- 3 a 6 bullets com o essencial da aula.

## Conceitos-chave
### <nome do conceito>
- **Definição:** ...
- **Porquê é importante:** ...
- **Exemplo:** ...

## Apontamentos
### <tópico>
Explicação clara, em parágrafos curtos e bullets. Inclui timestamps.

## Exemplos e aplicações
- Exemplos concretos dados na aula e o que ilustram.

## Para o exame
- Pontos sinalizados pelo professor ou claramente centrais.
> **Importante:** citações de ênfase, se existirem.

## Dúvidas a esclarecer
- Lacunas, ambiguidades ou perguntas que ficaram por responder. Se não houver, escreve "Nenhuma."

## Glossário
| Termo | Significado |
| --- | --- |
| ... | ... |

Não incluas a transcrição completa no fim. Não uses HTML. Não uses frontmatter.`

export interface Cue {
  start: number
  text: string
}

const CUE_PATTERNS = [
  /\b(exame|exames|teste|frequ[eê]ncia|avalia[cç][aã]o)\b/i,
  /\b(importante|aten[cç][aã]o|atenciosamente|n[aã]o se esque[cç]am|n[aã]o esquecer)\b/i,
  /\b(vai sair|sai no|vai cair|costuma sair|perguntar no exame)\b/i,
  /\b(defini[cç][aã]o|define-se|chama-se|designa-se)\b/i,
  /\b(f[oó]rmula|equa[cç][aã]o|teorema|regra)\b/i,
  /\b(por exemplo|exemplo|caso pr[aá]tico)\b/i,
  /\b(passos|primeiro|segundo|terceiro|por [uú]ltimo)\b/i,
  /\b(resumo|conclus[aã]o|em s[ií]ntese)\b/i
]

export function detectCues(segments: TranscriptSegment[]): Cue[] {
  const cues: Cue[] = []
  for (const segment of segments) {
    if (CUE_PATTERNS.some((pattern) => pattern.test(segment.text))) {
      cues.push({ start: segment.start, text: segment.text })
    }
  }
  return cues.slice(0, 80)
}

export function extractTitle(markdown: string, fallback: string): string {
  const match = /^#\s+(.+)$/m.exec(markdown)
  return (match?.[1] ?? fallback).replace(/[*_`]/g, '').trim().slice(0, 120)
}

export function extractSummary(markdown: string): string {
  const section = /##\s+Resumo\s*\n([\s\S]*?)(?=\n##\s|$)/.exec(markdown)
  const source = section?.[1] ?? markdown
  const bullets = source
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s*/, '').trim())
    .filter(Boolean)
  return bullets.slice(0, 3).join(' · ').slice(0, 320)
}

function extractError(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string } | string
      message?: string
    }
    if (typeof parsed.error === 'string') return parsed.error
    return parsed.error?.message ?? parsed.message ?? ''
  } catch {
    return raw.replace(/\s+/g, ' ').slice(0, 260)
  }
}
