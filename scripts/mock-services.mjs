import http from 'node:http'

async function bodyOf(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks)
}

function json(response, value) {
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify(value))
}

const note = `# Aula simulada — Teste do pipeline

**Disciplina:** Teste
**Data:** 19 de outubro de 2026
**Duração:** 1 minuto
**Tópicos:** pipeline, transcrição, notas

## Resumo
- O pipeline local foi exercitado de ponta a ponta.
- A transcrição simulada chegou ao modelo de notas.
- O Markdown foi escrito no disco e indexado.

## Conceitos-chave
### Pipeline
- **Definição:** sequência de passos entre o microfone e o ficheiro Markdown.
- **Porquê é importante:** permite testar sem chaves reais.
- **Exemplo:** áudio → WAV → transcrição → LLM → nota.

## Apontamentos
### Teste
[0:00] Esta é uma nota gerada pelo servidor local de teste. A transcrição veio do mock de Groq e a estrutura veio do mock de OpenCode.

## Exemplos e aplicações
- Executar o fluxo completo sem gastar créditos.

## Para o exame
- Nenhum.

## Dúvidas a esclarecer
- Nenhuma.

## Glossário
| Termo | Significado |
| --- | --- |
| Mock | Serviço local que imita uma API real. |
`

const llm = http.createServer(async (request, response) => {
  const body = await bodyOf(request)
  console.log(
    `[llm] ${request.method} ${request.url} ${body.length}b session=${request.headers['x-opencode-session'] ?? '-'} ua=${request.headers['user-agent'] ?? '-'}`
  )
  if (request.url?.endsWith('/chat/completions')) {
    let prompt = ''
    try {
      const parsed = JSON.parse(body.toString('utf8'))
      prompt = String(parsed.messages?.at(-1)?.content ?? '')
    } catch {
      // Ignore malformed test bodies.
    }
    console.log(`[llm] prompt chars=${prompt.length}`)
    json(response, {
      id: 'mock',
      choices: [{ index: 0, message: { role: 'assistant', content: note } }]
    })
    return
  }
  response.statusCode = 404
  response.end('not found')
})

const groq = http.createServer(async (request, response) => {
  const body = await bodyOf(request)
  console.log(
    `[groq] ${request.method} ${request.url} ${body.length}b type=${request.headers['content-type'] ?? '-'}`
  )

  if (request.url?.endsWith('/models')) {
    json(response, {
      data: [{ id: 'whisper-large-v3-turbo' }, { id: 'whisper-large-v3' }]
    })
    return
  }

  if (request.url?.endsWith('/audio/transcriptions')) {
    json(response, {
      text: 'Transcrição simulada do servidor local.',
      duration: 30,
      language: 'pt',
      segments: [
        { id: 0, start: 0, end: 4, text: 'Bom dia. Esta é uma aula de teste.' },
        {
          id: 1,
          start: 5,
          end: 10,
          text: 'A derivada mede a taxa de variação instantânea.'
        },
        {
          id: 2,
          start: 11,
          end: 16,
          text: 'Atenção, a regra da cadeia é importante para o exame.'
        },
        {
          id: 3,
          start: 17,
          end: 22,
          text: 'Por exemplo, a derivada de x ao quadrado é dois x.'
        },
        {
          id: 4,
          start: 23,
          end: 27,
          text: 'Não se esqueçam da regra do produto.'
        },
        {
          id: 5,
          start: 28,
          end: 30,
          text: 'Na próxima aula vamos resolver exercícios.'
        }
      ]
    })
    return
  }

  response.statusCode = 404
  response.end('not found')
})

llm.listen(4010, '127.0.0.1', () => console.log('[mock] LLM on http://127.0.0.1:4010'))
groq.listen(4011, '127.0.0.1', () => console.log('[mock] Groq on http://127.0.0.1:4011'))
