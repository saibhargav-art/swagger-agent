import http from 'node:http'

import { readConfig } from './config.js'
import type { ChatRequest, ToolResultRequest } from './protocol.js'
import { runAgent, shutdownAgents } from './runtime.js'
import { completeToolRequest, subscribe } from './tool-broker.js'

const config = readConfig()
const port = Number(process.env.STRANDS_AGENT_PORT ?? 8787)
const host = process.env.STRANDS_AGENT_HOST ?? '127.0.0.1'

const server = http.createServer(async (request, response) => {
  setCorsHeaders(request, response)
  if (request.method === 'OPTIONS') return end(response, 204)

  const url = new URL(request.url ?? '/', `http://${host}:${port}`)
  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, {
      ok: true,
      runtime: 'strands',
      modelProvider: config.modelProvider,
      model: config.modelProvider === 'openai' ? config.openAiModel : config.anthropicModel,
    })
  }

  if (request.method === 'GET' && url.pathname === '/events') {
    const sessionId = url.searchParams.get('sessionId')?.trim()
    if (!sessionId) return sendJson(response, 400, { error: 'sessionId is required' })
    subscribe(sessionId, response)
    return
  }

  if (request.method === 'POST' && url.pathname === '/chat') {
    try {
      const input = await readJson<ChatRequest>(request)
      validateChat(input)
      return sendJson(response, 200, await runAgent(config, input))
    } catch (error) {
      return sendJson(response, 500, { error: errorMessage(error) })
    }
  }

  if (request.method === 'POST' && url.pathname === '/tool-results') {
    try {
      const input = await readJson<ToolResultRequest>(request)
      completeToolRequest(input)
      return sendJson(response, 200, { ok: true })
    } catch (error) {
      return sendJson(response, 400, { error: errorMessage(error) })
    }
  }

  return sendJson(response, 404, { error: 'Not found' })
})

server.listen(port, host, () => console.log(`Strands agent service listening on http://${host}:${port}`))
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

async function shutdown() {
  await shutdownAgents()
  server.close(() => process.exit(0))
}

function validateChat(input: ChatRequest): void {
  if (!input.sessionId?.trim()) throw new Error('sessionId is required')
  if (!input.conversationId?.trim()) throw new Error('conversationId is required')
  if (!input.executionId?.trim()) throw new Error('executionId is required')
  if (!input.message?.trim()) throw new Error('message is required')
  if (!Array.isArray(input.tools)) throw new Error('tools must be an array')
}

function setCorsHeaders(request: http.IncomingMessage, response: http.ServerResponse): void {
  const origin = request.headers.origin
  if (origin && isAllowedOrigin(origin)) response.setHeader('Access-Control-Allow-Origin', origin)
  response.setHeader('Vary', 'Origin')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function isAllowedOrigin(origin: string): boolean {
  if (/^(chrome-extension|moz-extension):\/\//.test(origin)) return true
  try {
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(origin).hostname)
  } catch {
    return false
  }
}

async function readJson<T>(request: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const value = Buffer.concat(chunks).toString('utf8')
  return (value ? JSON.parse(value) : {}) as T
}

function sendJson(response: http.ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(value))
}

function end(response: http.ServerResponse, status: number): void {
  response.writeHead(status)
  response.end()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
