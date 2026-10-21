import http from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chat } from './llm'

interface CapturedRequest {
  url: string
  headers: http.IncomingHttpHeaders
  body: Record<string, unknown>
}

let server: http.Server
let baseURL: string
let captured: CapturedRequest | null = null

beforeAll(async () => {
  server = http.createServer((request, response) => {
    let raw = ''
    request.on('data', (chunk) => {
      raw += chunk
    })
    request.on('end', () => {
      const body = JSON.parse(raw || '{}') as Record<string, unknown>
      captured = {
        url: request.url ?? '',
        headers: request.headers,
        body
      }
      response.setHeader('content-type', 'application/json')

      if (request.url === '/v1/messages') {
        response.setHeader('content-type', 'text/event-stream')
        response.write(
          `event: message_start\ndata: ${JSON.stringify({
            type: 'message_start',
            message: {
              id: 'msg_test',
              type: 'message',
              role: 'assistant',
              model: 'claude-opus-5-5',
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 10, output_tokens: 1 }
            }
          })}\n\n`
        )
        response.write(
          `event: content_block_start\ndata: ${JSON.stringify({
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' }
          })}\n\n`
        )
        response.write(
          `event: content_block_delta\ndata: ${JSON.stringify({
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'anthropic note' }
          })}\n\n`
        )
        response.write(
          `event: content_block_stop\ndata: ${JSON.stringify({
            type: 'content_block_stop',
            index: 0
          })}\n\n`
        )
        response.write(
          `event: message_delta\ndata: ${JSON.stringify({
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: 3 }
          })}\n\n`
        )
        response.write(
          `event: message_stop\ndata: ${JSON.stringify({
            type: 'message_stop'
          })}\n\n`
        )
        response.end()
        return
      }

      if (request.url?.startsWith('/v1beta/models/')) {
        response.end(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: 'gemini note' }] } }
            ]
          })
        )
        return
      }

      if (request.url === '/v1/responses') {
        response.end(
          JSON.stringify({
            output: [
              { content: [{ type: 'output_text', text: 'responses note' }] }
            ]
          })
        )
        return
      }

      response.statusCode = 404
      response.end('{"error":{"message":"not found"}}')
    })
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Could not bind the mock provider server.')
  }
  baseURL = `http://127.0.0.1:${address.port}`
})

afterAll(() => {
  server.close()
})

describe('chat provider adapters', () => {
  it('streams Anthropic messages and sends the system prompt', async () => {
    const text = await chat(
      [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'hello' }
      ],
      {
        provider: 'anthropic',
        apiKey: 'anthropic-key',
        baseURL,
        model: 'claude-opus-5-5',
        maxTokens: 1024
      }
    )

    expect(text).toBe('anthropic note')
    expect(captured?.url).toBe('/v1/messages')
    expect(captured?.headers['x-api-key']).toBe('anthropic-key')
    expect(captured?.headers['anthropic-version']).toBeTruthy()
    expect(captured?.body.system).toBe('system prompt')
    expect(captured?.body.max_tokens).toBe(1024)
    expect(captured?.body.stream).toBe(true)
    expect(captured?.body.messages).toEqual([
      { role: 'user', content: 'hello' }
    ])
  })

  it('calls Gemini generateContent with a system instruction and key header', async () => {
    const text = await chat(
      [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'hello' }
      ],
      {
        provider: 'gemini',
        apiKey: 'gemini-key',
        baseURL: `${baseURL}/v1beta`,
        model: 'gemini-3.8-flash',
        maxTokens: 1234
      }
    )

    expect(text).toBe('gemini note')
    expect(captured?.url).toBe(
      '/v1beta/models/gemini-3.8-flash:generateContent'
    )
    expect(captured?.headers['x-goog-api-key']).toBe('gemini-key')
    expect(captured?.body.systemInstruction).toEqual({
      parts: [{ text: 'system prompt' }]
    })
    expect(captured?.body.contents).toEqual([
      { role: 'user', parts: [{ text: 'hello' }] }
    ])
    expect(captured?.body.generationConfig).toEqual({ maxOutputTokens: 1234 })
  })

  it('calls the OpenAI Responses endpoint and reads output parts', async () => {
    const text = await chat(
      [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'hello' }
      ],
      {
        provider: 'openai-responses',
        apiKey: 'sk-test',
        baseURL: `${baseURL}/v1`,
        model: 'gpt-6-astra',
        maxTokens: 2048
      }
    )

    expect(text).toBe('responses note')
    expect(captured?.url).toBe('/v1/responses')
    expect(captured?.headers.authorization).toBe('Bearer sk-test')
    expect(captured?.body.instructions).toBe('system prompt')
    expect(captured?.body.max_output_tokens).toBe(2048)
    expect(captured?.body.input).toEqual([
      { role: 'user', content: 'hello' }
    ])
  })

  it('surfaces provider errors', async () => {
    await expect(
      chat([{ role: 'user', content: 'hello' }], {
        provider: 'gemini',
        apiKey: 'k',
        baseURL: `${baseURL}/missing`,
        model: 'x'
      })
    ).rejects.toThrow(/Notes model failed \(404\)/)
  })
})
